import type { IEncoder } from '../interfaces/i-encoder.js';
import type { LexicalLine, VariableEntry, LabelEntry, FinalViewLine, PostLinkState, SegmentEntry } from '../types.js';
import { FLOW_INSTRUCTIONS, LONG_FLOW_INSTRUCTIONS } from '@emu8086/shared';
import { CompilerErrorCode }   from '../error-codes.js';
import { generateVariable }    from './generate-variable.js';
import { reformInstruction }   from './reform-instruction.js';

type ResolvedLine = { lexicalLine: LexicalLine; strLine: string };

export class Linkage {
  private origine:    number           = 0;
  private varArray:   VariableEntry[]  = [];
  private labelArray: LabelEntry[]     = [];
  private finalArray: FinalViewLine[]  = [];
  private segments:   SegmentEntry[]   = [];
  private entryPointLabel: string | null = null;
  private initialRegs: { cs?: number; ip?: number; ss?: number; sp?: number; ds?: number; es?: number } | null = null;

  constructor(private readonly encoder: IEncoder) {}

  getOrigin(): number | null {
    return this.origine;
  }

  getInitialRegs(): { cs?: number; ip?: number; ss?: number; sp?: number; ds?: number; es?: number } | null {
    return this.initialRegs;
  }

  // ── Public entry points ──────────────────────────────────────────────────

  link(
    lexicalView: LexicalLine[],
    varArray: VariableEntry[],
    labelArray: LabelEntry[],
    origin: number,
    segments?: SegmentEntry[],
    entryPointLabel?: string | null,
  ): FinalViewLine[] {
    this.origine         = origin;
    this.varArray        = varArray;
    this.labelArray      = labelArray;
    this.segments        = segments ?? [];
    this.entryPointLabel = entryPointLabel ?? null;
    this.initialRegs     = null;
    this.finalArray      = [];

    this.initFinalView(lexicalView);
    let passes = 0;
    while (this.runPass(lexicalView) && passes < 1000) passes++;

    this.calculateFinalProgramLayout(lexicalView);

    return this.finalArray;
  }

  verify(finalView: FinalViewLine[]): PostLinkState {
    for (const entry of finalView) {
      const line = entry.lexicalLine;
      if (line === null) continue;
      if (
        line.expressionType === 'INST' &&
        FLOW_INSTRUCTIONS.includes(line.instName ?? '') &&
        !LONG_FLOW_INSTRUCTIONS.includes(line.instName ?? '')
      ) {
        if ((parseInt(line.operands[0].name) & 0xFF00) !== 0)
          return { good: false, message: CompilerErrorCode.JUMP_OUT_OF_BOUNDS, errorLine: line.index };
      }
    }
    return { good: true, message: '', errorLine: null };
  }

  // ── Pass initialisation ──────────────────────────────────────────────────

  private initFinalView(lexicalView: LexicalLine[]): void {
    this.finalArray = lexicalView.map(line => {
      const originalLine = reformInstruction(line, true, true);
      const entry: FinalViewLine = {
        executableLine:  false,
        lexicalLine:     null,
        originalLine,
        resolvedLine:    '',
        opcodes:         [],
        instructionSize: 0,
        instructionAddr: 0,
      };

      if (line.expressionType === 'INST') {
        entry.executableLine = true;
      } else if (line.expressionType === 'VAR') {
        const bytes = generateVariable(line);
        entry.executableLine  = true;
        entry.resolvedLine    = originalLine;
        entry.opcodes         = bytes;
        entry.instructionSize = bytes.length;
      }

      return entry;
    });
  }

  // ── Iterative address-resolution pass ────────────────────────────────────

  private runPass(lexicalView: LexicalLine[]): boolean {
    let shouldReloop = false;
    const hasSegments = this.segments.length > 0;

    if (!hasSegments) {
      let virtualIP = this.origine;
      for (let i = 0; i < lexicalView.length; i++) {
        const line = lexicalView[i];

        if (line.label !== null) {
          for (const lbl of line.label as string[]) {
            if (this.setLabelAddr(lbl, virtualIP)) shouldReloop = true;
          }
        }

        if (line.expressionType === 'VAR') {
          this.finalArray[i].instructionAddr = virtualIP;
          if (this.setVarAddr(line.variableName, virtualIP)) shouldReloop = true;
          virtualIP += this.finalArray[i].instructionSize;

        } else if (line.expressionType === 'INST') {
          const resolved = FLOW_INSTRUCTIONS.includes(line.instName ?? '')
            ? this.resolveJmp(line, virtualIP)
            : this.resolveGeneral(line);

          this.finalArray[i].lexicalLine     = resolved.lexicalLine;
          this.finalArray[i].resolvedLine    = resolved.strLine.trim();
          this.finalArray[i].opcodes         = this.encoder.encode(resolved.strLine.trim());
          this.finalArray[i].instructionSize = this.finalArray[i].opcodes.length;
          this.finalArray[i].instructionAddr = virtualIP;
          virtualIP += this.finalArray[i].instructionSize;
        }
      }
      return shouldReloop;
    }

    // Segmented layout
    const segOffsets = new Map<string, number>();
    for (const s of this.segments) segOffsets.set(s.name, 0);

    const segMap = new Map<string, SegmentEntry>();
    for (const s of this.segments) segMap.set(s.name, s);

    for (let i = 0; i < lexicalView.length; i++) {
      const line = lexicalView[i];
      const segName = line.segmentName ?? (this.segments[0]?.name ?? '');
      const seg = segMap.get(segName) ?? this.segments[0];
      const offset = segOffsets.get(seg.name) ?? 0;
      const physicalAddr = (seg.base << 4) + offset;

      if (line.label !== null) {
        for (const lbl of line.label as string[]) {
          if (this.setLabelAddr(lbl, offset)) shouldReloop = true;
        }
      }

      if (line.expressionType === 'VAR') {
        this.finalArray[i].instructionAddr = physicalAddr;
        if (this.setVarAddr(line.variableName, offset)) shouldReloop = true;
        const newOffset = offset + this.finalArray[i].instructionSize;
        segOffsets.set(seg.name, newOffset);
        seg.size = Math.max(seg.size, newOffset);

      } else if (line.expressionType === 'INST') {
        const resolved = FLOW_INSTRUCTIONS.includes(line.instName ?? '')
          ? this.resolveJmp(line, offset)
          : this.resolveGeneral(line);

        this.finalArray[i].lexicalLine     = resolved.lexicalLine;
        this.finalArray[i].resolvedLine    = resolved.strLine.trim();
        this.finalArray[i].opcodes         = this.encoder.encode(resolved.strLine.trim());
        this.finalArray[i].instructionSize = this.finalArray[i].opcodes.length;
        this.finalArray[i].instructionAddr = physicalAddr;
        const newOffset = offset + this.finalArray[i].instructionSize;
        segOffsets.set(seg.name, newOffset);
        seg.size = Math.max(seg.size, newOffset);
      }
    }

    return shouldReloop;
  }

  private calculateFinalProgramLayout(lexicalView: LexicalLine[]): void {
    if (this.segments.length === 0) return;

    let codeSeg = this.segments.find(s => !s.isStack && s.name.toUpperCase() === 'CODE')
               ?? this.segments.find(s => !s.isStack && s.name.toUpperCase() !== 'DATA')
               ?? this.segments[0];

    let entryIP = 0;

    if (this.entryPointLabel) {
      const lbl = this.labelArray.find(l => l.labelName?.toUpperCase() === this.entryPointLabel?.toUpperCase());
      if (lbl) {
        entryIP = lbl.addr;
        const lineWithLbl = lexicalView.find(l => l.label?.some(x => x.toUpperCase() === this.entryPointLabel?.toUpperCase()));
        if (lineWithLbl?.segmentName) {
          const segForLbl = this.segments.find(s => s.name.toUpperCase() === lineWithLbl.segmentName?.toUpperCase());
          if (segForLbl) codeSeg = segForLbl;
        }
      }
    }

    const stackSeg = this.segments.find(s => s.isStack);
    const ss = stackSeg ? stackSeg.base : 0x700;
    const sp = stackSeg ? (stackSeg.size > 0 ? stackSeg.size : 0x200) : 0xfffe;

    const dataSeg = this.segments.find(s => s.name.toUpperCase() === 'DATA');
    const ds = dataSeg ? dataSeg.base : undefined;

    this.initialRegs = {
      cs: codeSeg.base,
      ip: entryIP,
      ss,
      sp,
      ds,
    };

    this.origine = (codeSeg.base << 4) + entryIP;
  }

  // ── Operand resolution: general instructions ─────────────────────────────

  private resolveGeneral(line: LexicalLine, addLabels = false): ResolvedLine {
    const newLine = this.copyLine(line);

    for (const op of newLine.operands) {
      if (op.type === 'VAR16' || op.type === 'VAR8' || op.type === 'VARU') {
        const entry = this.varArray.find(v => v.varName?.toUpperCase() === op.name.toUpperCase());
        if (entry) {
          const prefix = op.type === 'VAR16' ? 'word [' : op.type === 'VAR8' ? 'byte [' : '[';
          op.name = prefix + (entry.addr & 0xFFFF).toString() + ' ]';
          op.type = op.type === 'VARU' ? 'MU' : op.type === 'VAR16' ? 'MW' : 'MB';
        }
      } else if (op.type === 'OFF') {
        const varName = op.name.trim().split(' ')[1].toUpperCase();
        const entry   = this.varArray.find(v => v.varName?.toUpperCase() === varName);
        if (entry) { op.name = (entry.addr & 0xFFFF).toString(); op.type = 'INT'; }
      } else if (op.type === 'LBL') {
        const entry = this.labelArray.find(l => l.labelName?.toUpperCase() === op.name.toUpperCase());
        if (entry) { op.name = (entry.addr & 0xFFFF).toString(); op.type = 'INT'; }
      }
    }

    return { lexicalLine: newLine, strLine: reformInstruction(newLine, addLabels) };
  }

  // ── Operand resolution: flow instructions (JMP / CALL / Jcc / LOOP) ──────

  private resolveJmp(line: LexicalLine, virtualIP: number, addLabels = false): ResolvedLine {
    const newLine = this.copyLine(line);
    const op      = newLine.operands[0];

    if (op?.type === 'LBL') {
      const entry = this.labelArray.find(l => l.labelName?.toUpperCase() === op.name.toUpperCase());
      if (entry) this.applyJumpValue(newLine, op, entry.addr, virtualIP);

    } else if (op?.type === 'OFF') {
      const varName = op.name.trim().split(' ')[1];
      const entry   = this.varArray.find(v => v.varName === varName);
      if (entry) this.applyJumpValue(newLine, op, entry.addr, virtualIP);
    }

    return { lexicalLine: newLine, strLine: reformInstruction(newLine, addLabels) };
  }

  private applyJumpValue(
    line: LexicalLine,
    op:   LexicalLine['operands'][number],
    targetAddr: number,
    virtualIP:  number,
  ): void {
    const modulo = this.jumpModulo(line.instName, targetAddr, virtualIP);
    let value    = (targetAddr - virtualIP - modulo) & 0xFFFF;
    if (!LONG_FLOW_INSTRUCTIONS.includes(line.instName ?? '')) value &= 0x00FF;
    op.name = value.toString();
    op.type = 'INT';
  }

  private jumpModulo(instName: string | null, targetAddr: number, virtualIP: number): number {
    if (instName === 'JMP')
      return (targetAddr - virtualIP > 128 || targetAddr - virtualIP < 0) ? 3 : 2;
    if (instName === 'CALL') return 3;
    return 2;
  }

  // ── Address-table writers ────────────────────────────────────────────────

  private setLabelAddr(name: string | null, addr: number): boolean {
    if (name === null) return false;
    const entry = this.labelArray.find(l => l.labelName === name.toUpperCase());
    if (!entry) return false;
    const changed = entry.addr !== addr;
    entry.addr = addr;
    return changed;
  }

  private setVarAddr(name: string | null, addr: number): boolean {
    if (name === null) return false;
    const entry = this.varArray.find(v => v.varName === name);
    if (!entry) return false;
    const changed = entry.addr !== addr;
    entry.addr = addr;
    return changed;
  }

  private copyLine(line: LexicalLine): LexicalLine {
    return { ...line, operands: line.operands.map(op => ({ ...op })) };
  }
}
