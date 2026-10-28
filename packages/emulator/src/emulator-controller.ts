import { Processor }            from './processor.js';
import { Memory }               from './cpu/memory.js';
import { Registers }            from './cpu/registers.js';
import { ConsoleW }             from './console/console-w.js';
import { CpuState }             from './cpu/cpu-state.js';
import { createDispatcher }     from './create-dispatcher.js';
import type { KeyProvider }     from './console/key-provider.js';
import { ExecutionStopReason }  from './error-codes.js';
import {
  AX_REG, BX_REG, CX_REG, DX_REG, CS_REG, DS_REG, ES_REG, SS_REG,
  SP_REG, BP_REG, DI_REG, SI_REG, FLAG_REG, IP_REG,
} from './constants.js';

/** Converts a segment:offset register pair to a flat 20-bit physical address. */
function physAddr(segment: number, offset: number): number {
  return ((segment << 4) + offset) & 0xFFFFF;
}

const MEMORY_SIZE = 1024 * 1024;

/**
 * A compiled program ready to be loaded into the emulator.
 * Produced by the compiler and consumed by EmulatorController.
 * Defined here so the emulator package stays independent of the compiler package.
 */
export interface LoadableProgram {
  /** Initial instruction pointer value */
  origin: number;
  /** Executable instructions to write into RAM */
  instructions: ReadonlyArray<{ addr: number; opcodes: ReadonlyArray<number> }>;
  /** Optional initial register values (e.g. for MASM segmented programs) */
  initialRegs?: {
    cs?: number;
    ip?: number;
    ss?: number;
    sp?: number;
    ds?: number;
    es?: number;
  };
}

/** A single RAM byte change recorded during execution, used for step-back. */
export type RamChange = { addr: number; prevVal: number; newVal: number };

type RegState = {
  ax: number; bx: number; cx: number; dx: number;
  cs: number; ip: number; ss: number; sp: number;
  bp: number; si: number; di: number; ds: number;
  es: number; flags: number;
};

type ConsoleState = { cursorRam: number; cursor: number };

const STEPS_LIMIT = 1000;
const SINGLE_STEP_INTERVAL_MS = 100;

export class EmulatorController {
  readonly processor: Processor;

  private _t = 0;
  private _compiled = false;
  private _breakpoints = new Set<number>();
  private _loadedProgram: LoadableProgram | undefined;
  private _regStatesManager: RegState[] = [];
  private _ramStatesManager: RamChange[][] = [[]];
  private _consoleStateManager: ConsoleState[] = [];
  private _intervalRun: ReturnType<typeof setInterval> | undefined;

  constructor(keyProvider: KeyProvider) {
    const state      = new CpuState();
    const onMemWrite = (change: RamChange) => { this._ramStatesManager[this._t].push(change); };
    const ram        = new Memory(MEMORY_SIZE, onMemWrite);
    const register   = new Registers();
    const cnsl       = new ConsoleW(ram, register, keyProvider, state);
    const dispatcher = createDispatcher();
    this.processor   = new Processor(ram, register, cnsl, dispatcher, state);
    this._initDefaultRegisters();
    this._consoleStateManager[0] = {
      cursorRam: this.processor.cnsl.cursorRam,
      cursor: this.processor.cnsl.cursor,
    };
    this._updateRegState();
  }

  get t(): number { return this._t; }
  get compiled(): boolean { return this._compiled; }
  get breakpoints(): ReadonlySet<number> { return this._breakpoints; }

  getRegStateAt(t: number): RegState | undefined {
    return this._regStatesManager[t];
  }

  addBreakpoint(physicalAddr: number): void    { this._breakpoints.add(physicalAddr); }
  removeBreakpoint(physicalAddr: number): void { this._breakpoints.delete(physicalAddr); }
  clearBreakpoints(): void                     { this._breakpoints.clear(); }
  hasBreakpoint(physicalAddr: number): boolean { return this._breakpoints.has(physicalAddr); }

  toggleBreakpoint(physicalAddr: number): void {
    if (this._breakpoints.has(physicalAddr)) this._breakpoints.delete(physicalAddr);
    else this._breakpoints.add(physicalAddr);
  }

  ramChangesAt(index: number): RamChange[] {
    return this._ramStatesManager[index] ?? [];
  }

  private _initDefaultRegisters(): void {
    this.processor.register.writeReg(SS_REG, 0x700);
    this.processor.register.writeReg(SP_REG, 0xfffe);
    this.processor.RAM._writeWord(
      (this.processor.register.readReg(SS_REG) << 4) + this.processor.register.readReg(SP_REG),
      0xfffe,
    );
  }

  private _updateRegState(): void {
    this._regStatesManager[this._t] = {
      ax: this.processor.register.readReg(AX_REG),
      bx: this.processor.register.readReg(BX_REG),
      cx: this.processor.register.readReg(CX_REG),
      dx: this.processor.register.readReg(DX_REG),
      cs: this.processor.register.readReg(CS_REG),
      ip: this.processor.register.readReg(IP_REG),
      ss: this.processor.register.readReg(SS_REG),
      sp: this.processor.register.readReg(SP_REG),
      bp: this.processor.register.readReg(BP_REG),
      si: this.processor.register.readReg(SI_REG),
      di: this.processor.register.readReg(DI_REG),
      ds: this.processor.register.readReg(DS_REG),
      es: this.processor.register.readReg(ES_REG),
      flags: this.processor.register.readReg(FLAG_REG),
    };
  }

  private _applyRegStateAt(index: number): void {
    const st = this._regStatesManager[index];
    if (!st) return;
    this.processor.register.writeReg(AX_REG, st.ax);
    this.processor.register.writeReg(BX_REG, st.bx);
    this.processor.register.writeReg(CX_REG, st.cx);
    this.processor.register.writeReg(DX_REG, st.dx);
    this.processor.register.writeReg(CS_REG, st.cs);
    this.processor.register.writeReg(IP_REG, st.ip);
    this.processor.register.writeReg(SP_REG, st.sp);
    this.processor.register.writeReg(BP_REG, st.bp);
    this.processor.register.writeReg(SI_REG, st.si);
    this.processor.register.writeReg(DI_REG, st.di);
    this.processor.register.writeReg(DS_REG, st.ds);
    this.processor.register.writeReg(ES_REG, st.es);
    this.processor.register.writeReg(FLAG_REG, st.flags);
  }

  private _resetState(): void {
    this.processor.resetRegisters();
    this.processor.resetMemory();
    this.processor.resetHalt();
    this._t = 0;
    this._regStatesManager = [];
    this._ramStatesManager = [[]];
    this._updateRegState();
    this.processor.cnsl.resetState();
    this._initDefaultRegisters();
  }

  private _applyInitialRegisters(program: LoadableProgram): void {
    if (program.initialRegs) {
      if (program.initialRegs.cs !== undefined) this.processor.register.writeReg(CS_REG, program.initialRegs.cs);
      if (program.initialRegs.ip !== undefined) this.processor.register.writeReg(IP_REG, program.initialRegs.ip);
      else this.processor.register.writeReg(IP_REG, program.origin);
      if (program.initialRegs.ss !== undefined) this.processor.register.writeReg(SS_REG, program.initialRegs.ss);
      if (program.initialRegs.sp !== undefined) this.processor.register.writeReg(SP_REG, program.initialRegs.sp);
      if (program.initialRegs.ds !== undefined) this.processor.register.writeReg(DS_REG, program.initialRegs.ds);
      if (program.initialRegs.es !== undefined) this.processor.register.writeReg(ES_REG, program.initialRegs.es);
    } else {
      this.processor.register.writeReg(IP_REG, program.origin);
    }
    this._updateRegState();
  }

  private _writeProgram(instructions: LoadableProgram['instructions']): void {
    for (const instr of instructions) {
      for (let j = 0; j < instr.opcodes.length; j++) {
        // _writeByte bypasses onMemWrite — program loading is not a step-back-able event
        this.processor.RAM._writeByte(instr.addr + j, instr.opcodes[j]);
      }
    }
  }

  loadProgram(program: LoadableProgram): void {
    this._loadedProgram = program;
    this._resetState();
    this._applyInitialRegisters(program);
    this._writeProgram(program.instructions);
    this._compiled = true;
  }

  reset(): void {
    if (!this._loadedProgram) return;
    this._resetState();
    this._applyInitialRegisters(this._loadedProgram);
    this._writeProgram(this._loadedProgram.instructions);
  }

  editMode(): void {
    this.stopRun();
    this._resetState();
    this._compiled = false;
    this._loadedProgram = undefined;
  }

  singleStep(): { done: boolean; endReason?: ExecutionStopReason } {
    this._consoleStateManager[this._t] = {
      cursorRam: this.processor.cnsl.cursorRam,
      cursor: this.processor.cnsl.cursor,
    };

    this._t++;
    this._ramStatesManager[this._t] = [];

    this.processor.decode();
    this._updateRegState();

    const ip = this.processor.register.readReg(IP_REG);
    const sp = this.processor.register.readReg(SP_REG);
    if ((ip === 0xfffe && sp === 0) || this.processor.isHalted) {
      return { done: true, endReason: ExecutionStopReason.SUCCESS };
    }
    return { done: false };
  }

  stepBack(): { success: boolean } {
    if (this._t <= 0) return { success: false };

    this.processor.resetHalt();
    this.processor.cnsl.cursorRam = this._consoleStateManager[this._t - 1].cursorRam;
    this.processor.cnsl.cursor = this._consoleStateManager[this._t - 1].cursor;

    for (const change of this._ramStatesManager[this._t]) {
      this.processor.RAM._writeByte(change.addr, change.prevVal);
    }
    this._ramStatesManager.splice(this._t, 1);
    this._regStatesManager.splice(this._t, 1);

    this._t--;
    this._applyRegStateAt(this._t);
    this._regStatesManager.splice(this._t, 1);
    this._updateRegState();

    return { success: true };
  }

  startRun(onStep: () => void, onEnd: (reason: ExecutionStopReason) => void): void {
    let runStepCount = 0;
    this._intervalRun = setInterval(() => {
      runStepCount++;
      if (runStepCount > STEPS_LIMIT) {
        clearInterval(this._intervalRun);
        onEnd(ExecutionStopReason.INFINITE_LOOP);
        return;
      }
      const result = this.singleStep();
      onStep();
      if (result.done) {
        clearInterval(this._intervalRun);
        onEnd(result.endReason ?? ExecutionStopReason.SUCCESS);
        return;
      }
      if (this._breakpoints.size > 0) {
        const cs = this.processor.register.readReg(CS_REG);
        const ip = this.processor.register.readReg(IP_REG);
        if (this._breakpoints.has(physAddr(cs, ip))) {
          clearInterval(this._intervalRun);
          onEnd(ExecutionStopReason.BREAKPOINT_HIT);
        }
      }
    }, SINGLE_STEP_INTERVAL_MS);
  }

  stopRun(): void {
    clearInterval(this._intervalRun);
  }

  /** Call once per animation frame. Handles echo and key-input delivery. */
  tick(): void {
    if (this.processor.cnsl.readMode) {
      this.processor.cnsl.processKeyReady();
    }
    this.processor.handleKeyInput();
  }

  /** Returns the stack view, ready to render. Encapsulates 8086 segment addressing. */
  getStackEntries(count = 65): Array<{ address: string; value: number; isSP: boolean }> {
    const ss = this.processor.register.readReg(SS_REG);
    const sp = this.processor.register.readReg(SP_REG);
    const top = (ss << 4) + 0xffff;
    const entries: Array<{ address: string; value: number; isSP: boolean }> = [];
    for (let i = top; entries.length < count; i--) {
      const offset = i - (ss << 4);
      entries.push({
        address: ss.toString(16) + ':' + offset.toString(16),
        value: this.processor.RAM.peekByte(i),
        isSP: sp === offset,
      });
    }
    return entries;
  }
}
