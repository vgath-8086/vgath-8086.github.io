import { describe, it, expect } from 'vitest';
import { AX_REG, BX_REG, CX_REG } from '@emu8086/emulator';
import { getExample, runExample, expectCategoryCovered } from './test-helpers.js';

describe('Procedures & Macros examples', () => {
  it('covers every example in this category', () => {
    expectCategoryCovered('Procedures & Macros', ['proc-call-ret', 'macro-local', 'masm-segments']);
  });

  describe('MASM Segments & Procedures', () => {
    it('executes traditional MASM segmented program', async () => {
      const { source } = getExample('masm-segments');
      const { controller, done } = await runExample(source);
      expect(done).toBe(true);
      const reg = controller.processor.register;
      expect(reg.readReg(AX_REG)).toBe(0x4C00); // Exited via INT 21H with AX=4C00H
    });
  });

  describe('PROC / ENDP', () => {
    it('declares and calls a reusable procedure', async () => {
      const { source } = getExample('proc-call-ret');
      const { controller, done } = await runExample(source);
      expect(done).toBe(true);
      expect(controller.processor.register.readReg(AX_REG)).toBe(0x0009); // 3 * 3 via PROC
    });
  });

  describe('MACRO / ENDM / LOCAL', () => {
    it('keeps a LOCAL label private across multiple macro invocations', async () => {
      const { source } = getExample('macro-local');
      const { controller, done } = await runExample(source);
      expect(done).toBe(true);
      const reg = controller.processor.register;
      expect(reg.readReg(BX_REG)).toBe(0x0003); // first macro expansion
      expect(reg.readReg(CX_REG)).toBe(0x0005); // second expansion, independent LOCAL label
    });
  });
});
