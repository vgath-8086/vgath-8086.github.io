import type { LexicalLine, Operand, VariableClass, LexicalAnalysisResult, OperandType } from '../types.js';
import { OperandClassifier, WORD_REGISTERS, BYTE_REGISTERS, SEGMENT_REGISTERS, ALL_REGISTERS, INSTRUCTIONS } from './operand-classifier.js';
import { MemoryValidator } from './memory-validator.js';
import { CompilerErrorCode } from '../error-codes.js';

const KEYWORDS    = ['MACRO', 'PROC', 'SEGMENT', 'ENDS', 'ASSUME', 'END', 'EQU'];
const PRE_PRO_INS = ['ORG', 'DEFINE', 'EQU', 'PROC', 'LOCAL', 'ENDM', 'ENDP', 'OFFSET', 'SEGMENT', 'ENDS', 'ASSUME', 'END', 'TITLE', '.MODEL', '.STACK', '.DATA', '.CODE'];
const STRING_INSTRUCTIONS = ['MOVSB', 'CMPSB', 'SCASB', 'LODSB', 'STOSB', 'MOVSW', 'CMPSW', 'SCASW', 'LODSW', 'STOSW'];

export class LexicalAnalysis {
  private lexical: LexicalLine = this.emptyLine();

  constructor(
    private readonly classifier: OperandClassifier,
    private readonly memValidator: MemoryValidator,
  ) {}

  /** Creates a zeroed-out LexicalLine for starting a new parse. */
  private emptyLine(): LexicalLine {
    return {
      good: true, expressionType: null, instructionType: null,
      label: [], message: null, instName: null,
      variableName: null, variableClass: null, operands: [], index: null,
    };
  }

  analyse(s: string): LexicalAnalysisResult {
    const lines = s.split(/\n/);
    const result: LexicalLine[] = [];

    for (let index = 0; index < lines.length; index++) {
      const cleaned = this.expandTabs(this.stripComment(lines[index]));
      const temp    = this.execute(cleaned);
      temp.index    = index;
      result.push(temp);
      if (!temp.good) return { status: false, lexicalView: result };
    }

    return { status: true, lexicalView: result };
  }

  execute(str: string): LexicalLine {
    this.lexical = this.emptyLine();

    let firstToken = this.extractFirstToken(str);

    while (this.lexical.good && firstToken.endsWith(':')) {
      const name = firstToken.slice(0, -1);
      if (this.isLegalName(name)) {
        (this.lexical.label as string[]).push(name);
        const m = str.match(/(?<=\s*)(\w+\s*\:|\w+(?=\s+\w))/);
        if (m !== null) str = str.replace(m[0], '').trim();
        firstToken = this.extractFirstToken(str);
      } else {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.ILLEGAL_EXPRESSION;
      }
    }

    if (str.trim() === '') {
      this.lexical.expressionType = 'NULL';
      return { ...this.lexical };
    }

    if      (this.lexical.good && this.tryParseMasmDirectives(str))   { /* handled */ }
    else if (this.lexical.good && this.tryParseMacroDefinition(str))  this.parseMacroParameters(str);
    else if (this.lexical.good && this.tryParseVariable(str))         this.parseVariableOperands(str);
    else if (this.lexical.good && this.tryParseInstruction(str))      this.lexical.good = this.parseInstructionOperands(str);
    else if (this.lexical.good)                                       this.parseMacroCallOperands(str);

    return { ...this.lexical };
  }

  // ── MASM Directives ───────────────────────────────────────────────────────

  private tryParseMasmDirectives(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed) return false;
    const tokens = trimmed.split(/\s+/);
    const tok0 = (tokens[0] || '').toUpperCase();
    const tok1 = (tokens[1] || '').toUpperCase();

    // TITLE directive
    if (tok0 === 'TITLE') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'TITLE';
      return true;
    }

    // Simplified segment directives: .MODEL, .STACK, .DATA, .CODE
    if (tok0 === '.MODEL') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = '.MODEL';
      return true;
    }
    if (tok0 === '.STACK') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = '.STACK';
      if (tokens[1]) {
        this.lexical.operands = [{ name: tokens[1].toUpperCase(), type: 'INT' }];
      }
      return true;
    }
    if (tok0 === '.DATA') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = '.DATA';
      return true;
    }
    if (tok0 === '.CODE') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = '.CODE';
      return true;
    }

    // <name> SEGMENT [attrs...]
    if (tokens.length >= 2 && tok1 === 'SEGMENT') {
      if (this.isLegalName(tokens[0])) {
        this.lexical.expressionType = 'INST';
        this.lexical.instructionType = 'prePropIns';
        this.lexical.instName = 'SEGMENT';
        this.lexical.operands = [
          { name: tokens[0].toUpperCase(), type: 'SEG' },
          ...tokens.slice(2).map(t => ({ name: t.replace(/['"]/g, '').toUpperCase(), type: 'VAR' as OperandType })),
        ];
        return true;
      }
    }

    // <name> ENDS or standalone ENDS
    if (tok0 === 'ENDS') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'ENDS';
      return true;
    }
    if (tokens.length >= 2 && tok1 === 'ENDS') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'ENDS';
      this.lexical.operands = [{ name: tokens[0].toUpperCase(), type: 'SEG' }];
      return true;
    }

    // ASSUME CS:CODE, DS:DATA, ...
    if (tok0 === 'ASSUME') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'ASSUME';
      const rest = trimmed.slice(tokens[0].length).trim();
      const parts = rest.split(',').map(p => p.trim()).filter(Boolean);
      this.lexical.operands = parts.map(p => ({ name: p.toUpperCase(), type: 'VAR' as OperandType }));
      return true;
    }

    // <name> PROC [NEAR|FAR]
    if (tokens.length >= 2 && tok1 === 'PROC') {
      if (this.isLegalName(tokens[0])) {
        this.lexical.expressionType = 'INST';
        this.lexical.instructionType = 'prePropIns';
        this.lexical.instName = 'PROC';
        this.lexical.operands = [{ name: tokens[0].toUpperCase(), type: 'VAR' }];
        return true;
      }
    }

    // <name> ENDP
    if (tokens.length >= 2 && tok1 === 'ENDP') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'ENDP';
      this.lexical.operands = [{ name: tokens[0].toUpperCase(), type: 'VAR' }];
      return true;
    }

    // END [entry_label]
    if (tok0 === 'END') {
      this.lexical.expressionType = 'INST';
      this.lexical.instructionType = 'prePropIns';
      this.lexical.instName = 'END';
      if (tokens[1]) {
        this.lexical.operands = [{ name: tokens[1].toUpperCase(), type: 'VAR' }];
      }
      return true;
    }

    // <name> EQU <value>
    if (tokens.length >= 3 && tok1 === 'EQU') {
      if (this.isLegalName(tokens[0])) {
        this.lexical.expressionType = 'INST';
        this.lexical.instructionType = 'prePropIns';
        this.lexical.instName = 'EQU';
        const val = tokens.slice(2).join(' ').trim();
        this.lexical.operands = [
          { name: tokens[0].toUpperCase(), type: 'VAR' },
          { name: val.toUpperCase(), type: 'INT' },
        ];
        return true;
      }
    }

    return false;
  }

  // ── Name / token validation ───────────────────────────────────────────────

  private isLegalName(str: string): boolean {
    str = str.toUpperCase().trim();
    return !(
      KEYWORDS.includes(str) || str === '' || /[^A-Z0-9_@]/.test(str) || /^\d|^\-\-/.test(str) ||
      INSTRUCTIONS.includes(str) || WORD_REGISTERS.includes(str) || BYTE_REGISTERS.includes(str) ||
      SEGMENT_REGISTERS.includes(str)
    );
  }

  private extractFirstToken(str: string): string {
    const t = str.trim().match(/(\w+\s*\:|\w+)/);
    return t === null ? '' : t[0].replace(/\s/g, '');
  }

  // ── Variable declaration detection ────────────────────────────────────────

  /** True if line is a variable declaration; sets variableName/variableClass state as a side effect. */
  private tryParseVariable(str: string): boolean {
    // Split on any run of whitespace — a literal single-space split leaves empty
    // entries (and silently misclassifies the line) whenever the source uses
    // more than one space, or a tab, between the name and DB/DW (e.g. for
    // column alignment with neighbouring declarations).
    const arr = str.toUpperCase().trim().split(/\s+/);

    if (arr[0] === 'DB' || arr[0] === 'DW' || arr[0] === 'DD') {
      this.lexical.expressionType = 'VAR';
      this.lexical.variableClass  = arr[0] as VariableClass;
      this.lexical.variableName   = null;
      return true;
    }

    if (arr[1] === 'DB' || arr[1] === 'DW' || arr[1] === 'DD') {
      if (this.classifier.isLegalVarName(arr[0])) {
        this.lexical.variableName  = arr[0];
        this.lexical.variableClass = arr[1] as VariableClass;
        this.lexical.expressionType = 'VAR';
      } else {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.ILLEGAL_VARIABLE_NAME;
      }
      return true;
    }

    return false;
  }

  /** Parses and validates operands after DB/DW keyword. */
  private parseVariableOperands(str: string): void {
    const ops = this.splitVarOps(str);
    for (const element of ops) {
      const el = element.trim();
      if (el === '') {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.WRONG_VARIABLE_VALUE;
        return;
      } else if (el === '?') {
        this.lexical.operands.push({ name: '0', type: 'INT' });
      } else if (/^"/.test(el) || /^'/.test(el)) {
        if (/(^").*("$)/.test(el) || /(^').*('$)/.test(el)) {
          // Preserve the literal's original case — only the surrounding assembly
          // syntax is case-insensitive, not string contents (e.g. 'Hello, World!').
          this.lexical.operands.push({ name: el.trim(), type: 'STR' });
        } else {
          this.lexical.message = CompilerErrorCode.MISMATCHED_QUOTES;
          this.lexical.good    = false;
          return;
        }
      } else if (this.classifier.isNumber(el)) {
        this.lexical.operands.push({ name: el.trim().toUpperCase(), type: 'INT' });
      } else if (/dup/i.test(el)) {
        this.parseDup(el);
      } else {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.WRONG_VARIABLE_VALUE;
      }
    }
  }

  private parseDup(str: string): void {
    const sizeMatch  = str.match(/.*?(?=(dup))/i);
    const valueMatch = str.match(/(?<=(dup\s*\()).*?(?=\))/i);

    if (sizeMatch === null || !this.classifier.isNumber(sizeMatch[0].trim())) {
      this.lexical.good    = false;
      this.lexical.message = CompilerErrorCode.WRONG_DUP_PARAMETER;
    } else {
      this.lexical.operands.push({ name: sizeMatch[0], type: 'DUPSIZE' });
    }

    if (valueMatch === null) {
      this.lexical.good    = false;
      this.lexical.message = CompilerErrorCode.WRONG_DUP_VALUE;
      return;
    }

    if (valueMatch[0].trim() === '' || valueMatch[0].trim() === '?') {
      this.lexical.operands.push({ name: '?', type: 'DUP' });
    } else {
      for (const item of valueMatch[0].split(',')) {
        if (this.classifier.isNumber(item.trim().toUpperCase())) {
          this.lexical.operands.push({ name: item.trim(), type: 'DUP' });
        } else {
          this.lexical.good    = false;
          this.lexical.message = CompilerErrorCode.ILLEGAL_TABLE_VALUE;
          break;
        }
      }
    }
  }

  // ── Macro detection ────────────────────────────────────────────────────────

  /** True if line is `NAME MACRO`; sets macro definition state. */
  private tryParseMacroDefinition(str: string): boolean {
    // See tryParseVariable — same fix: collapse runs of whitespace instead of
    // splitting on one literal space, or extra spaces before MACRO go undetected.
    const arr = str.trim().toUpperCase().split(/\s+/);
    if (arr[1] !== 'MACRO') return false;

    if (this.isLegalName(arr[0])) {
      this.lexical.expressionType = 'macro definition';
      this.lexical.instName       = arr[0].trim().toUpperCase();
    } else {
      this.lexical.good    = false;
      this.lexical.message = CompilerErrorCode.ILLEGAL_MACRO_NAME;
    }
    return true;
  }

  /** Parses formal parameter names listed after the MACRO keyword. */
  private parseMacroParameters(str: string): void {
    const m = str.match(/ Macro\s*/i);
    if (m === null) return;
    const opsStr = str.toUpperCase().substring(str.indexOf(m[0]) + 6, str.length);
    if (opsStr.trim() === '') return;

    for (const element of opsStr.split(',')) {
      if (this.isLegalName(element.toUpperCase())) {
        this.lexical.operands.push({ name: element, type: 'VAR' });
      } else {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.ILLEGAL_PARAMETER_NAME;
        break;
      }
    }
  }

  // ── Instruction detection ─────────────────────────────────────────────────

  /** True if first token is a known mnemonic or preprocessor instruction. */
  private tryParseInstruction(str: string): boolean {
    const testStr = this.extractFirstToken(str).toUpperCase();
    if (!PRE_PRO_INS.includes(testStr) && !INSTRUCTIONS.includes(testStr)) return false;

    this.lexical.instName        = testStr;
    this.lexical.instructionType = PRE_PRO_INS.includes(testStr) ? 'prePropIns' : 'InsSIM';
    this.lexical.expressionType  = 'INST';
    return true;
  }

  /** Parses and classifies all operands; returns false on any validation error. */
  private parseInstructionOperands(str: string): boolean {
    const str2 = (str + ' ').replace(/\w+(?=\s)/, '').trim();

    if (/^REP|^REPE|^REPNE/i.test(str.trim())) {
      if (STRING_INSTRUCTIONS.includes(str2.trim().toUpperCase())) {
        this.lexical.operands.push({ name: str2.toUpperCase(), type: 'INS' });
        return true;
      }
      this.lexical.message = CompilerErrorCode.INVALID_OPERAND;
      return false;
    }

    if (/^JMP|^CALL/i.test(str.trim())) {
      this.lexical.instName       = /^JMP/i.test(str.trim()) ? 'JMP' : 'CALL';
      this.lexical.expressionType = 'INST';

      if (this.classifier.isNumber(str2.trim())) {
        this.lexical.operands.push({ name: str2.toUpperCase(), type: 'INT' });
        return true;
      }
      if (this.classifier.isLegalVarName(str2.trim())) {
        this.lexical.operands.push({ name: str2.toUpperCase(), type: 'VAR' });
        return true;
      }
      if (/\:/.test(str)) {
        const parts = str2.split(':');
        if (this.classifier.isNumber(parts[0].trim()) && this.classifier.isNumber(parts[1].trim())) {
          this.lexical.operands.push({ name: str2.toUpperCase(), type: 'DIS' });
          return true;
        }
        if (this.memValidator.isValid(str2.trim())) {
          this.lexical.operands.push({ name: str2.toUpperCase(), type: this.classifier.typeOf(str2.trim()) });
          return true;
        }
        this.lexical.message = CompilerErrorCode.WRONG_PARAMETER_TYPE;
        return false;
      }
    }

    const operands = /,/.test(str2) ? str2.split(',') : [str2];
    if (operands[0] !== '') {
      for (let raw of operands) {
        raw = raw.trim().replace(/\bptr\b/ig, '').trim();
        const varInBracket = raw.match(/^\[\s*([a-zA-Z_]\w*)\s*\]$/);
        if (varInBracket && this.classifier.isLegalVarName(varInBracket[1])) {
          raw = varInBracket[1];
        }
        const result = this.classifier.isValid(raw);
        if (!result.ok) {
          this.lexical.message = result.message || null;
          return false;
        }
        const type = this.classifier.typeOf(raw);
        const name = type === 'OFF'
          ? raw.trim().toUpperCase()
          : raw.replace(/\s/g, '').replace(/word(?=[edcs]s)/i, 'word ').replace(/byte(?=[edcs]s)/i, 'byte ').trim().toUpperCase();
        this.lexical.operands.push({ name, type });
      }
    }

    return true;
  }

  // ── Macro call (application) ──────────────────────────────────────────────

  /** Handles an unrecognized identifier as a macro invocation site. */
  private parseMacroCallOperands(str: string): void {
    this.lexical.expressionType = 'MACRO';
    this.lexical.instName       = str.trim().split(' ')[0].trim().toUpperCase();

    str = str.trim();
    if (str === '') { this.lexical.expressionType = 'NULL'; return; }

    if (!this.isLegalName(str.split(' ')[0].trim())) {
      this.lexical.good    = false;
      this.lexical.message = CompilerErrorCode.ILLEGAL_INSTRUCTION;
      return;
    }

    const instLen = (this.lexical.instName ?? '').length;
    this.lexical.operands = this.splitMacroArgs(str.slice(instLen));

    let i = 0;
    while (this.lexical.good && i < this.lexical.operands.length) {
      const op     = this.lexical.operands[i];
      const opName = op.name.toUpperCase();

      if ((opName[0] === '"' || opName[0] === "'") && opName[opName.length - 1] !== opName[0]) {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.ILLEGAL_STRING_FORMAT;
      } else if (
        !(opName[0] === '"' || opName[0] === "'") &&
        !this.isLegalName(opName) && !this.classifier.isNumber(opName) &&
        ALL_REGISTERS.indexOf(opName) === -1 && !this.classifier.isOffset(opName)
      ) {
        this.lexical.good    = false;
        this.lexical.message = CompilerErrorCode.ILLEGAL_OPERANDS;
      }

      if ((opName[0] === '"' || opName[0] === "'") && opName[opName.length - 1] === opName[0])
        op.type = 'STR';
      else if (this.classifier.isNumber(opName))    op.type = 'INT';
      else if (this.isLegalName(opName))       op.type = 'VAR';
      else if (WORD_REGISTERS.indexOf(opName) !== -1)    op.type = 'RX';
      else if (BYTE_REGISTERS.indexOf(opName) !== -1)    op.type = 'RL';
      else if (SEGMENT_REGISTERS.indexOf(opName) !== -1) op.type = 'RS';
      else if (this.classifier.isOffset(opName))    op.type = 'OFF';

      i++;
    }
  }

  // ── String splitting helpers ──────────────────────────────────────────────

  private splitMacroArgs(str: string): Operand[] {
    let inString = false;
    let accoType = '"';
    let current  = '';
    let strBuf   = '';
    const result: Operand[] = [];

    for (const ch of str) {
      if (ch === accoType && inString) {
        current  = strBuf + ch;
        strBuf   = '';
        inString = false;
      } else if ((ch === '"' || ch === "'") && !inString) {
        strBuf  += ch;
        inString = true;
        accoType = ch;
      } else if (ch !== accoType && inString) {
        strBuf += ch;
      } else if (ch === ',' && !inString) {
        result.push({ name: current.trim().toUpperCase(), type: '' });
        current = '  ';
      } else {
        current += ch;
      }
    }

    if (strBuf !== '') current = strBuf;
    if (current !== '') result.push({ name: current.trim().toUpperCase(), type: '' });
    return result;
  }

  private splitVarOps(str: string): string[] {
    str = str.trim().replace(/(?<=DUP\s*\([a-z0-9,\s]*),(?=[a-z0-9,\s]*\))/ig, 'verreplacementinsup');
    const ops = this.parseVarList(str);
    return ops.map(o => o.replace(/verreplacementinsup/g, ','));
  }

  private parseVarList(str: string): string[] {
    let inString = false;
    let accoType = '"';
    let strBuf   = '';
    let current  = ' ';
    const arr: string[] = [];

    const dbdwMatch = str.match(/\b(db|dw|dd)\b/i);
    if (dbdwMatch === null) return arr;
    str = str.substring(str.indexOf(dbdwMatch[0]) + 3).trim();

    for (const ch of str) {
      if (ch === accoType && inString) {
        current  = strBuf + ch;
        strBuf   = '';
        inString = false;
      } else if ((ch === '"' || ch === "'") && !inString) {
        strBuf  += ch;
        inString = true;
        accoType = ch;
      } else if (ch !== accoType && inString) {
        strBuf += ch;
      } else if (ch === ',' && !inString) {
        arr.push(current.trim());
        current = '  ';
      } else {
        current += ch;
      }
    }

    if (strBuf !== '') current = strBuf;
    if (current !== '') arr.push(current.trim());
    return arr;
  }

  // ── Comment stripping ────────────────────────────────────────────────────

  private stripComment(str: string): string {
    let i = 0;
    for (; i < str.length; i++) {
      if (str[i] === ';' && !this.insideString(str, i)) break;
    }
    return str.substring(0, i);
  }

  private insideString(str: string, j: number): boolean {
    let k1 = 0, k2 = 0;
    for (let i = 0; i < j; i++) {
      if (str[i] === "'" && str[i - 1] !== '\\') k1++;
      if (str[i] === '"' && str[i - 1] !== '\\') k2++;
    }
    return k1 % 2 === 1 || k2 % 2 === 1;
  }

  /** Replaces tab characters with 4 spaces for uniform column alignment. */
  private expandTabs(str: string): string {
    return str.replace(/\t/g, '    ');
  }
}
