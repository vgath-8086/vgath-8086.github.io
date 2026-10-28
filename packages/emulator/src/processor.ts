import type { Memory }               from './cpu/memory.js';
import type { Registers }            from './cpu/registers.js';
import type { ConsoleW }             from './console/console-w.js';
import type { CpuState }             from './cpu/cpu-state.js';
import { AX_REG, DX_REG, DS_REG } from './constants.js';
import { XL }                        from './constants.js';
import { SEG_OVER_PREF }             from './opcodes.js';
import { CpuContext }                from './cpu/cpu-context.js';
import { InstructionDispatcher }     from './instruction-dispatcher.js';

export class Processor {
  readonly RAM: Memory;
  readonly register: Registers;
  readonly cnsl: ConsoleW;

  private readonly state: CpuState;
  private readonly ctx: CpuContext;
  private readonly dispatcher: InstructionDispatcher;

  constructor(
    RAM: Memory,
    register: Registers,
    cnsl: ConsoleW,
    dispatcher: InstructionDispatcher,
    state: CpuState,
  ) {
    this.RAM        = RAM;
    this.register   = register;
    this.cnsl       = cnsl;
    this.state      = state;
    this.dispatcher = dispatcher;
    this.ctx        = new CpuContext(this.register, this.RAM, this.cnsl);
  }

  get pause(): boolean        { return this.state.pause; }
  set pause(v: boolean)       { this.state.pause = v; }

  get int21_01(): boolean     { return this.ctx.int21_01; }
  get isHalted(): boolean     { return this.ctx.halted; }
  resetHalt(): void           { this.ctx.halted = false; }

  resetMemory(): void    { this.RAM.reset(); }
  resetRegisters(): void { this.register.reset(); this.resetHalt(); }

  /** Routes a buffered key to the active INT 21h handler (01h for single char, 0Ah for buffered input). */
  handleKeyInput(): void {
    const ctx  = this.ctx;
    const cnsl = this.cnsl; // concrete ConsoleW — keyReady/key are not part of IConsole
    if (cnsl.keyReady && ctx.int21_01) {
      cnsl.writeKeyToRegister(AX_REG, XL);
      ctx.int21_01 = false;
      cnsl.keyReady = false;
    }
    if (ctx.int21_0a && cnsl.keyReady) {
      const ds        = this.register.readReg(DS_REG);
      const dxAdr     = (ds << 4) + this.register.readReg(DX_REG);
      const maxChars  = this.RAM.readByte(dxAdr);
      if (ctx.readNum <= maxChars) {
        const keyCode  = cnsl.key!.charCodeAt(0) & 0x00FF;
        const isEnter  = keyCode === 0x0D;
        const isAtMax  = ctx.readNum === maxChars;

        if (isEnter || isAtMax) {
          if (!isEnter) this.RAM.writeByte(dxAdr + ctx.readNum + 1, keyCode);
          const charsRead = isEnter ? ctx.readNum - 1 : ctx.readNum;
          this.RAM.writeByte(dxAdr + 2 + charsRead, 0x0D);
          this.RAM.writeByte(dxAdr + 2 + charsRead + 1, 0);
          this.RAM.writeByte(dxAdr + 1, charsRead);
          cnsl.keyReady = false;
          ctx.int21_0a = false;
        } else {
          this.RAM.writeByte(dxAdr + ctx.readNum + 1, keyCode);
          cnsl.keyReady = false;
          cnsl.readChar();
          ctx.readNum++;
        }
      }
    }
  }

  decode(): void {
    if (this.state.pause) return;

    const cs = this.register.readReg(4);   // CS_REG
    let ip  = this.register.readReg(13);   // IP_REG
    let op  = this.RAM.readByte((cs << 4) + ip);

    this.ctx.activeSegment = 3; // DS by default

    if ((op & 0b11100111) === SEG_OVER_PREF) {
      this.ctx.activeSegment = (op >> 3) % 4;
      this.register.incIP(1);
      ip = this.register.readReg(13);
      op = this.RAM.readByte((cs << 4) + ip);
    }

    this.dispatcher.dispatch(op, this.ctx);

    this.ctx.activeSegment = 3;
  }
}
