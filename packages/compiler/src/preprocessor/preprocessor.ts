import type { LexicalLine, Operand, VariableEntry, LabelEntry, PreProcessorResult, VariableSize, SegmentEntry } from '../types.js';
import { MacroExpander } from './macro-expander.js';
import { CompilerErrorCode } from '../error-codes.js';

export class PreProcessor {
  private lexicalView: LexicalLine[] = [];
  private variables: VariableEntry[] = [];
  private labels: LabelEntry[] = [];
  private segments: SegmentEntry[] = [];
  private entryPointLabel: string | null = null;
  private origineValue: number = 0;
  private message: CompilerErrorCode | '' = '';
  private errorLine: number | null = null;

  constructor(private readonly macroExpander: MacroExpander) {}

  /** Records error code and line number for buildErrorResult to use. */
  private setError(message: CompilerErrorCode, errorLine: number | null): void {
    this.message = message;
    this.errorLine = errorLine;
  }

  /** Marks the failing lexical line and returns the error PreProcessorResult. */
  private buildErrorResult(): PreProcessorResult {
    for (const line of this.lexicalView) {
      if (line.index === this.errorLine) {
        line.good = false;
        line.message = this.message || null;
      }
    }
    return {
      status: false,
      lexicalView: this.lexicalView,
      varArray: this.variables,
      labelArray: this.labels,
      segments: this.segments,
      origin: this.origineValue,
      message: this.message,
      errorLine: this.errorLine,
    };
  }

  process(lexicalView: LexicalLine[]): PreProcessorResult {
    this.lexicalView = lexicalView;
    this.variables   = [];
    this.labels      = [];
    this.segments    = [];
    this.entryPointLabel = null;
    this.origineValue = 0;
    this.message     = '';
    this.errorLine   = null;

    if (this.executeDefine()          === -1) return this.buildErrorResult();
    if (this.manageSegments()         === -1) return this.buildErrorResult();
    this.normaliseAllOperands();
    if (this.expandMacros()           === -1) return this.buildErrorResult();
    if (this.manageProcedures()       === -1) return this.buildErrorResult();
    this.getVariables(this.lexicalView);
    if (this.manageVariables()        === -1) return this.buildErrorResult();
    if (this.verifyVarDeclaration()   === -1) return this.buildErrorResult();
    if (this.verifyOrigin()           === -1) return this.buildErrorResult();
    this.addEmptyLine();
    return {
      status: true,
      lexicalView: this.lexicalView,
      varArray: this.variables,
      labelArray: this.labels,
      segments: this.segments,
      entryPointLabel: this.entryPointLabel,
      origin: this.origineValue,
      message: '',
      errorLine: null,
    };
  }

  // ── Stage 1: DEFINE expansion ────────────────────────────────────────────

  private executeDefine(): number {
    for (let i = 0; i < this.lexicalView.length; i++) {
      const line = this.lexicalView[i];
      if (line.expressionType !== 'INST' || (line.instName !== 'DEFINE' && line.instName !== 'EQU')) continue;

      if (line.operands.length !== 2) {
        this.setError(CompilerErrorCode.INVALID_OPERANDS_FOR_DEFINE, line.index);
        return -1;
      }
      if (line.operands[0].type !== 'VAR' || line.operands[1].type !== 'INT') {
        this.setError(CompilerErrorCode.INVALID_OPERANDS, line.index);
        return -1;
      }

      const name  = line.operands[0].name;
      const value = line.operands[1].name;

      for (const target of this.lexicalView) {
        for (const op of target.operands) {
          if (op.name === name) { op.name = value; op.type = 'INT'; }
        }
      }

      this.lexicalView.splice(i, 1);
      i--;
    }
    return 0;
  }

  // ── Stage 1.5: Segment handling ──────────────────────────────────────────

  private manageSegments(): number {
    this.segments = [];
    this.entryPointLabel = null;

    let currentSeg: string | null = null;
    const segMap = new Map<string, SegmentEntry>();
    const segOrder: string[] = [];

    for (let i = 0; i < this.lexicalView.length; i++) {
      const line = this.lexicalView[i];

      if (line.expressionType === 'INST') {
        const name = line.instName ?? '';

        if (name === 'TITLE' || name === '.MODEL' || name === 'ASSUME') {
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === '.STACK') {
          currentSeg = 'STACK';
          if (!segMap.has('STACK')) {
            const sizeVal = line.operands[0]?.name ? parseInt(line.operands[0].name) : 1024;
            segMap.set('STACK', { name: 'STACK', base: 0, size: sizeVal, isStack: true });
            segOrder.push('STACK');
          }
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === '.DATA') {
          currentSeg = 'DATA';
          if (!segMap.has('DATA')) {
            segMap.set('DATA', { name: 'DATA', base: 0, size: 0, isStack: false });
            segOrder.push('DATA');
          }
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === '.CODE') {
          currentSeg = 'CODE';
          if (!segMap.has('CODE')) {
            segMap.set('CODE', { name: 'CODE', base: 0, size: 0, isStack: false });
            segOrder.push('CODE');
          }
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === 'SEGMENT') {
          const segName = line.operands[0]?.name?.toUpperCase() ?? 'SEG';
          currentSeg = segName;
          const isStack = line.operands.some(op => op.name.toUpperCase() === 'STACK' || op.name.toUpperCase() === "'STACK'");
          if (!segMap.has(segName)) {
            segMap.set(segName, {
              name: segName,
              base: 0,
              size: 0,
              isStack: isStack || segName.startsWith('STACK'),
            });
            segOrder.push(segName);
          }
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === 'ENDS') {
          currentSeg = null;
          line.expressionType = 'NULL';
          line.operands = [];
          continue;
        }

        if (name === 'END') {
          if (line.operands.length > 0) {
            this.entryPointLabel = line.operands[0].name.toUpperCase();
          }
          line.expressionType = 'NULL';
          line.operands = [];
          for (let j = i + 1; j < this.lexicalView.length; j++) {
            this.lexicalView[j].expressionType = 'NULL';
            this.lexicalView[j].operands = [];
          }
          break;
        }
      }

      if (currentSeg) {
        line.segmentName = currentSeg;
      }
    }

    if (segOrder.length > 0) {
      let nextBase = 0x0100;
      for (const sName of segOrder) {
        const seg = segMap.get(sName)!;
        seg.base = nextBase;
        nextBase += 0x0100;
      }
      this.segments = segOrder.map(n => segMap.get(n)!);
    }

    return 0;
  }

  private hasSegment(name: string): boolean {
    return this.segments.some(s => s.name === name.toUpperCase());
  }

  private getSegment(name: string): SegmentEntry | undefined {
    return this.segments.find(s => s.name === name.toUpperCase());
  }

  // ── Stage 2: text/operand normalisation ─────────────────────────────────

  /** Runs normaliseOperands and expandShiftRepeats over all lines. */
  private normaliseAllOperands(): void {
    this.normaliseOperands();
    this.expandShiftRepeats();
  }

  private normaliseOperands(): void {
    for (const line of this.lexicalView) {
      for (const op of line.operands) {
        if (op.type === 'INT' || op.type === 'DUP' || op.type === 'DUPSIZE') {
          let v = op.type === 'DUP' && op.name.trim() === '?' ? '0' : op.name;
          v = this.charLiteralToAscii(v);
          v = this.normaliseNumericLiterals(v);
          op.name = v.trim() !== '' ? eval(v).toString(10) : '0';
        } else if (op.type === 'MU' || op.type === 'MB' || op.type === 'MW') {
          op.name = this.normaliseMemOperand(op.name);
        }
      }
    }
  }

  // Expand `SHL dest, N` → N copies of `SHL dest, 1` (8086 has no count > 1).
  private expandShiftRepeats(): void {
    const SHIFT_OPS = ['SHL', 'SAL', 'SHR', 'SAR', 'ROL', 'ROR', 'RCL', 'RCR'];

    for (let i = 0; i < this.lexicalView.length; i++) {
      const line = this.lexicalView[i];
      if (line.expressionType !== 'INST' || !SHIFT_OPS.includes(line.instName ?? '')) continue;

      if (line.operands.length !== 2) {
        this.setError(CompilerErrorCode.INVALID_OPERANDS_FOR_SHIFT, line.index);
        return;
      }
      if (line.operands[1].type !== 'INT') {
        this.setError(CompilerErrorCode.INVALID_OPERANDS, line.index);
        return;
      }

      const count = parseInt(line.operands[1].name, 10);
      if (count > 255 || count <= 0) {
        this.setError(CompilerErrorCode.OPERAND_OUT_OF_RANGE, line.index);
        return;
      }

      const expanded: LexicalLine[] = Array.from({ length: count }, (_, k) => ({
        label:           k === 0 ? line.label : null,
        expressionType:  'INST' as const,
        instructionType: 'InsSIM' as const,
        instName:        line.instName,
        good:            true,
        message:         null,
        operands: [
          { name: line.operands[0].name, type: line.operands[0].type },
          { name: '1', type: 'INT' as const },
        ] as Operand[],
        variableName:  null,
        variableClass: null,
        index:         line.index,
      }));

      this.lexicalView.splice(i, 1, ...expanded);
    }
  }

  private normaliseMemOperand(value: string): string {
    const tailleMem = value.match(/(word|byte|w\.|b\.)/ig);
    const segOver   = value.match(/(cs|ds|es|ss)/ig);
    const reg       = value.match(/(bp|bx|di|si)/ig);

    let numerical = value.replace(/(word|byte|w\.|b\.|es|ds|ss|cs|bp|bx|di|si|\[|\]|\:)/ig, ' ');
    numerical = numerical
      .replace(/\+\s*\+/ig, '+').replace(/\+\s*\*/ig, '*').replace(/\+\s*\-/ig, '-')
      .replace(/\*\s*\+/ig, '*').replace(/\-\s*\+/ig, '-').replace(/\s*\+\s*$/ig, '+0');
    numerical = this.normaliseNumericLiterals(numerical);
    numerical = numerical.trim() !== '' ? eval(numerical).toString(10) : '0';

    let expr = '';
    if (tailleMem !== null) expr += tailleMem + ' ';
    if (segOver   !== null) expr += segOver + ':';
    expr += '[';
    if (reg !== null) {
      expr += reg[0];
      if (reg.length === 2) expr += '+' + reg[1];
      if (numerical !== '0') expr += parseInt(numerical) < 0 ? numerical : '+' + numerical;
    } else {
      expr += numerical;
    }
    expr += ']';
    return expr;
  }

  // ── Stage 3: macro expansion ─────────────────────────────────────────────

  private expandMacros(): number {
    const result = this.macroExpander.expand(this.lexicalView);
    if (!result.success) {
      this.setError(result.message as CompilerErrorCode, result.errorLine);
      return -1;
    }
    return 0;
  }

  // ── Stage 4: procedure handling ──────────────────────────────────────────

  private manageProcedures(): number {
    const view = this.lexicalView;

    for (let i = 0; i < view.length; i++) {
      const line = view[i];
      if (line.expressionType !== 'INST' || line.instName !== 'PROC') continue;

      if (line.operands.length !== 1 || line.operands[0].type !== 'VAR') {
        this.setError(CompilerErrorCode.WRONG_PROCEDURE_DECLARATION, line.index);
        return -1;
      }

      // Find matching ENDP
      let endpIdx = -1;
      for (let j = i + 1; j < view.length; j++) {
        if (view[j].expressionType === 'INST' && view[j].instName === 'ENDP') { endpIdx = j; break; }
        if (view[j].expressionType === 'INST' && view[j].instName === 'PROC') {
          this.setError(CompilerErrorCode.INVALID_INSTRUCTION_IN_PROC, view[j].index);
          return -1;
        }
      }

      if (endpIdx === -1) {
        this.setError(CompilerErrorCode.MISSING_ENDP, line.index);
        return -1;
      }

      // Ensure procedure body is non-empty
      let hasContent = false;
      for (let j = i + 1; j < endpIdx; j++) {
        if (view[j].expressionType !== null) { hasContent = true; break; }
      }
      if (!hasContent) {
        this.setError(CompilerErrorCode.PROCEDURE_EMPTY, line.index);
        return -1;
      }

      view[i].label = [view[i].operands[0].name];
      view[i].expressionType = 'NULL';
      view[endpIdx].expressionType = 'NULL';
    }

    return 0;
  }

  // ── Stage 5: variable & label collection ─────────────────────────────────

  private getVariables(objectsArray: LexicalLine[]): void {
    for (const line of objectsArray) {
      if (
        line.expressionType === 'VAR' &&
        line.variableName !== null &&
        !this.hasVariable(line.variableName) &&
        !this.hasLabel(line.variableName)
      ) {
        let size: VariableSize = null;
        if (/DB/.test(line.variableClass ?? ''))      size = 'BYTE';
        else if (/DW/.test(line.variableClass ?? '')) size = 'WORD';
        else if (/DD/.test(line.variableClass ?? '')) size = 'DWORD';
        else if (/DU/.test(line.variableClass ?? '')) size = 'UNKNOWN';

        this.variables.push({ line: line.index, varName: line.variableName!.toUpperCase(), size, addr: 0 });
      }

      if (line.label !== null) {
        for (const labelName of line.label as string[]) {
          this.labels.push({ line: line.index, labelName: labelName.toUpperCase(), addr: 0 });
        }
      }
    }

    this.executeDup(objectsArray);
  }

  private hasVariable(name: string): boolean {
    return this.variables.some(v => v.varName === name);
  }

  private hasLabel(name: string): boolean {
    return this.labels.some(l => l.labelName?.toUpperCase().trim() === name.toUpperCase().trim());
  }

  // ── Stage 6: variable resolution ─────────────────────────────────────────

  private manageVariables(): number {
    for (const line of this.lexicalView) {
      if (line.expressionType === 'NULL') continue;
      for (const op of line.operands) {
        if (/VAR|SEG/.test(op.type)) {
          let lookupName = op.name.toUpperCase();
          if (lookupName === '@DATA') lookupName = 'DATA';
          if (lookupName === '@CODE') lookupName = 'CODE';
          if (lookupName === '@STACK') lookupName = 'STACK';

          const varEntry = this.variables.find(v => v.varName?.toUpperCase() === lookupName);
          if (varEntry) {
            op.type = /BYTE/.test(varEntry.size ?? '') ? 'VAR8'
              : /WORD/.test(varEntry.size ?? '')    ? 'VAR16'
              : 'VARU';
          } else if (this.hasLabel(lookupName)) {
            op.type = 'LBL';
          } else if (this.hasSegment(lookupName)) {
            const seg = this.getSegment(lookupName)!;
            op.name = seg.base.toString(10);
            op.type = 'INT';
          } else {
            this.setError(CompilerErrorCode.VARIABLE_OR_LABEL_MISSING, line.index);
            return -1;
          }
        } else if (/OFF/.test(op.type)) {
          const varOffseted = op.name.split(' ')[1]?.trim().toUpperCase();
          if (!this.hasVariable(varOffseted)) {
            this.setError(CompilerErrorCode.VARIABLE_MISSING, line.index);
            return -1;
          }
        }
      }
    }
    return 0;
  }

  // ── Stage 7: variable value range check ──────────────────────────────────

  private verifyVarDeclaration(): number {
    for (const line of this.lexicalView) {
      if (line.expressionType !== 'VAR') continue;
      const varType = line.variableClass;
      for (const op of line.operands) {
        if (op.type !== 'INT') continue;
        const v = parseInt(op.name);
        if ((v > 255 || v <= -128) && varType === 'DB') {
          this.setError(CompilerErrorCode.OPERAND_EXCEEDS_BYTE, line.index);
          return -1;
        }
        if ((v > 65535 || v <= -32768) && varType === 'DW') {
          this.setError(CompilerErrorCode.OPERAND_EXCEEDS_WORD, line.index);
          return -1;
        }
      }
    }
    return 0;
  }

  // ── Stage 8: ORG directive ───────────────────────────────────────────────

  private verifyOrigin(): number {
    let found = false;

    for (let i = 0; i < this.lexicalView.length; i++) {
      const line = this.lexicalView[i];
      if (line.expressionType !== 'INST' || line.instName !== 'ORG') continue;

      if (!found) {
        if (line.operands.length !== 1) {
          this.setError(CompilerErrorCode.ORG_WRONG_PARAMETER_COUNT, line.index);
          return -1;
        }
        if (line.operands[0].type !== 'INT') {
          this.setError(CompilerErrorCode.ORG_PARAMETER_MUST_BE_INTEGER, line.index);
          return -1;
        }
        const value = parseInt(line.operands[0].name);
        if ((value & 0xFFFF0000) !== 0) {
          this.setError(CompilerErrorCode.ORG_OPERAND_OUT_OF_RANGE, line.index);
          return -1;
        }
        this.origineValue = value;
        found = true;
      }

      this.lexicalView.splice(i, 1);
      i--;
    }

    return 0;
  }

  // ── DUP expansion ────────────────────────────────────────────────────────

  private executeDup(objectsArray: LexicalLine[]): void {
    for (const line of objectsArray) {
      if (line.expressionType !== 'VAR') continue;

      for (let j = 0; j < line.operands.length; j++) {
        if (line.operands[j].type !== 'DUPSIZE') continue;

        const dupSize = parseInt(line.operands[j].name);
        if (dupSize <= 0 || dupSize > 1024) {
          this.setError(CompilerErrorCode.DUP_OUT_OF_RANGE, line.index);
          return;
        }

        const dupValues: string[] = [];
        let k = 1;
        while ((k + j) < line.operands.length && line.operands[k + j].type === 'DUP') {
          dupValues.push(line.operands[k + j].name);
          k++;
        }

        const expanded: Operand[] = [];
        for (let m = 0; m < dupSize; m++)
          for (const v of dupValues)
            expanded.push({ name: v, type: 'INT' });

        line.operands.splice(j, k, ...expanded);
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private addEmptyLine(): void {
    this.lexicalView.push({
      label: null, expressionType: 'NULL', instructionType: null, instName: null,
      good: true, message: null, operands: [],
      variableName: null, variableClass: null, index: null,
    });
  }

  /** Replaces a single-char literal like 'A' with its decimal ASCII value. */
  private charLiteralToAscii(str: string): string {
    if (/"."|'.'/i.test(str))
      return str.replace(/(?<=("|')).(?="|')/, str.charCodeAt(1).toString(10));
    return str;
  }

  /** Converts Nh/Nb literal notation to 0xN/0bN so the expression can be passed to eval. */
  private normaliseNumericLiterals(str: string): string {
    const hexToks = str.match(/[0-9][a-f0-9]*(h|H)/ig);
    const binToks = str.match(/[0-1]+(b|B)/ig);

    if (hexToks !== null)
      for (const tok of hexToks)
        str = str.replace(tok, '0x' + tok.slice(0, -1));

    if (binToks !== null)
      for (const tok of binToks)
        str = str.replace(tok, '0b' + tok.slice(0, -1));

    return str;
  }
}
