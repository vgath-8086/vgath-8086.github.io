import type { IRegisters } from '../interfaces/i-registers.js';
import type { IMemory }    from '../interfaces/i-memory.js';
import type { IConsole }   from '../interfaces/i-console.js';
import {
  BX_REG, BP_REG, SI_REG, DI_REG, CS_REG, IP_REG,
} from '../constants.js';
import {
  NO_DISP, IWEN_DISP, SIN_DISP, REG_MODE,
  ADD_MODE, ADC_MODE, SUB_MODE, SBB_MODE, CMP_MODE, AND_MODE, OR_MODE, XOR_MODE,
  CARRY_FLAG, ZERO_FLAG, PARITY_FLAG, SIGN_FLAG, AUXILARY_FLAG, OVERFLOW_FLAG,
} from '../opcodes.js';

export class CpuContext {
  reg: IRegisters;
  ram: IMemory;
  cnsl: IConsole;
  activeSegment: number = 3;

  // Interrupt state shared with Processor.handleKeyInput()
  int21_01: boolean = false;
  int21_0a: boolean = false;
  readNum: number = 1;
  halted: boolean = false;

  constructor(reg: IRegisters, ram: IMemory, cnsl: IConsole) {
    this.reg = reg;
    this.ram = ram;
    this.cnsl = cnsl;
  }

  extractOperand(
    addrModeByte: number,
    segmentEnabled: boolean = true,
  ): { addr: number | null; dispSize: number; opRegister: [number, number | null] } {
    const mode = (addrModeByte & 0xC0) >> 6;
    const reg  = (addrModeByte & 0x38) >> 3;
    const rm   = (addrModeByte & 0x07);

    let addr: number | null = null;
    let dispSize = 0;
    const opRegister: [number, number | null] = [reg, null];

    const current_ip  = this.reg.readReg(IP_REG);
    const current_cs  = this.reg.readReg(CS_REG);
    const act_seg     = this.reg.readSegReg(this.activeSegment);

    switch (mode) {
      case NO_DISP:
        if (rm === 0b110) {
          addr = this.ram.readWord((current_cs << 4) + current_ip + 2);
          dispSize = 2;
        } else {
          addr = this.baseAddressFromRM(rm);
        }
        break;

      case IWEN_DISP:
        addr = this.baseAddressFromRM(rm) + this.signExtendByte(this.ram.readByte((current_cs << 4) + current_ip + 2));
        dispSize = 1;
        break;

      case SIN_DISP:
        addr = this.baseAddressFromRM(rm) + this.ram.readWord((current_cs << 4) + current_ip + 2);
        dispSize = 2;
        break;

      case REG_MODE:
        opRegister[1] = rm;
        break;
    }

    if (addr != null) addr &= 0x0000FFFF;

    if (addr != null && segmentEnabled) {
      addr += (act_seg << 4);
    }

    return { addr, dispSize, opRegister };
  }

  /** Returns the sum of base/index registers indicated by the r/m field (before displacement or segment). */
  baseAddressFromRM(rm: number): number {
    switch (rm) {
      case 0x00: return this.reg.readReg(BX_REG) + this.reg.readReg(SI_REG);
      case 0x01: return this.reg.readReg(BX_REG) + this.reg.readReg(DI_REG);
      case 0x02: return this.reg.readReg(BP_REG) + this.reg.readReg(SI_REG);
      case 0x03: return this.reg.readReg(BP_REG) + this.reg.readReg(DI_REG);
      case 0x04: return this.reg.readReg(SI_REG);
      case 0x05: return this.reg.readReg(DI_REG);
      case 0x06: return this.reg.readReg(BP_REG);
      case 0x07: return this.reg.readReg(BX_REG);
      default:   return -1;
    }
  }

  /** Applies the arithmetic/logic operation mode (ADD/SUB/AND/OR/etc.) and returns the unmasked result. */
  executeArithmetic(mode: number, op1: number, op2: number): number {
    switch (mode) {
      case ADD_MODE: return op1 + op2;
      case ADC_MODE: return op1 + op2 + this.reg.extractFlag('C');
      case SUB_MODE: return op1 - op2;
      case SBB_MODE: return op1 - op2 - this.reg.extractFlag('C');
      case AND_MODE: return op1 & op2;
      case OR_MODE:  return op1 | op2;
      case XOR_MODE: return op1 ^ op2;
      case CMP_MODE: return op1 - op2;
      default:       return 0;
    }
  }

  /** Sign-extends a byte to a 16-bit word (fills the upper byte with bit 7). */
  signExtendByte(val: number): number {
    return (val >> 7) === 1 ? (val | 0xFF00) : val;
  }

  generateFlag(
    value: number, op1: number, op2: number, w: number = 1,
    Flag: number = 0b11111111111111, subtractive: boolean = false,
  ): void {
    if ((Flag & CARRY_FLAG) !== 0) {
      const mask = (w === 1) ? 0xFFFF0000 : 0xFFFFFF00;
      this.reg.setFlag('C', (value & mask) === 0 ? 0 : 1);
    }

    if ((Flag & ZERO_FLAG) !== 0) {
      const mask = (w === 1) ? 0x0000FFFF : 0x000000FF;
      this.reg.setFlag('Z', (value & mask) === 0 ? 1 : 0);
    }

    if ((Flag & PARITY_FLAG) !== 0) {
      // PF = 1 when the low byte of the result has an even number of set bits.
      let bits = 0;
      for (let i = 0; i < 8; i++) bits += (value >> i) & 1;
      this.reg.setFlag('P', bits % 2 === 0 ? 1 : 0);
    }

    if ((Flag & SIGN_FLAG) !== 0) {
      const mask = (w === 1) ? 0x8000 : 0x80;
      this.reg.setFlag('S', (value & mask) !== 0 ? 1 : 0);
    }

    if ((Flag & AUXILARY_FLAG) !== 0) {
      this.reg.setFlag('A', 0);
    }

    if ((Flag & OVERFLOW_FLAG) !== 0) {
      let newVal = (w === 1) ? value >> 15 : value >> 7;
      newVal &= 0x0001;

      // Additive overflow (ADD/ADC): operands share a sign but the result doesn't.
      // Subtractive overflow (SUB/SBB/CMP/NEG): operands have different signs and
      // the result doesn't match the minuend (op1) — the opposite sign comparison.
      const operandSignsMatch = (w === 1) ? (op1 >> 15) === (op2 >> 15) : (op1 >> 7) === (op2 >> 7);
      const signCondition = subtractive ? !operandSignsMatch : operandSignsMatch;

      if ((w === 1) && (newVal !== (op1 >> 15)) && signCondition)
        this.reg.setFlag('O', 1);
      else if ((w === 0) && (newVal !== (op1 >> 7)) && signCondition)
        this.reg.setFlag('O', 1);
      else
        this.reg.setFlag('O', 0);
    }
  }
}
