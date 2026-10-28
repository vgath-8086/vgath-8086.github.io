import type { LoadableProgram } from '@emu8086/emulator';
import type { CompilerResult, FinalViewLine } from './types.js';

/**
 * Projects a successful CompilerResult into the shape EmulatorController.loadProgram()
 * expects. Returns null if the compile failed — check `result.message` for why.
 */
export function toLoadableProgram(result: CompilerResult): LoadableProgram | null {
  if (!result.status || !result.finalView || result.origin === null) return null;
  return {
    origin: result.origin,
    instructions: result.finalView
      .filter((l: FinalViewLine) => l.executableLine)
      .map((l: FinalViewLine) => ({ addr: l.instructionAddr, opcodes: l.opcodes })),
    initialRegs: result.initialRegs,
  };
}
