import type { IInstructionHandler } from '../interfaces/i-instruction-handler.js';
import type { CpuContext } from '../cpu/cpu-context.js';
import { AX_REG, BX_REG, DX_REG, DS_REG } from '../constants.js';
import { INT } from '../opcodes.js';

export class InterruptHandler implements IInstructionHandler {
  matches(op: number): boolean {
    return op === INT; // 0xCC
  }

  execute(op: number, ctx: CpuContext): void {
    const ip = ctx.reg.readReg(13); // IP_REG
    const cs = ctx.reg.readReg(4);  // CS_REG
    const secondByte = ctx.ram.readByte((cs << 4) + ip + 1);

    if (secondByte === 0x21) {
      const ah = (ctx.reg.readReg(AX_REG) & 0xFF00) >> 8;

      if (ah === 0x4C) {
        ctx.halted = true;
      } else if (ah === 0x01) {
        ctx.cnsl.readChar();
        ctx.int21_01 = true;
      } else if (ah === 0x02) {
        const ch = String.fromCharCode(ctx.reg.readReg(DX_REG) & 0x00FF);
        ctx.cnsl.writeChar(ch);
      } else if (ah === 0x09) {
        const ds = ctx.reg.readReg(DS_REG);
        let addr = ctx.reg.readReg(DX_REG);
        let val = ctx.ram.readByte((ds << 4) + addr);
        while (val !== 36) { // '$'
          ctx.cnsl.writeChar(String.fromCharCode(val));
          addr++;
          val = ctx.ram.readByte((ds << 4) + addr);
        }
      } else if (ah === 0x0A) {
        ctx.cnsl.readChar();
        ctx.int21_0a = true;
        ctx.readNum = 1;
        ctx.cnsl.waitForEnter();
      }
    } else if (secondByte === 0x10) {
      const ah = (ctx.reg.readReg(AX_REG) & 0xFF00) >> 8;

      // AH=09h — write character and attribute. Real BIOS leaves the cursor in
      // place; this emulator's console only ever renders up to its write
      // cursor, so (unlike real INT 10h) writing also advances it — the same
      // teletype-style model INT 21h's character output already uses.
      if (ah === 0x09) {
        const al = ctx.reg.readReg(AX_REG) & 0x00FF;
        const bl = ctx.reg.readReg(BX_REG) & 0x00FF;
        const fg = bl & 0x0F;
        const bg = (bl >> 4) & 0x0F;
        ctx.cnsl.writeChar(String.fromCharCode(al), fg, bg);
      }
    }

    ctx.reg.incIP(2);
  }
}
