import type { OperandType } from '../types.js';
import { MemoryValidator } from './memory-validator.js';
import { CompilerErrorCode } from '../error-codes.js';
import {
  WORD_REGISTERS,
  BYTE_REGISTERS,
  SEGMENT_REGISTERS,
  ALL_REGISTERS,
  INSTRUCTIONS,
} from '@emu8086/shared';

/**
 * Classifies operand strings into OperandType codes and validates individual
 * operand tokens.  Stateless — create once and reuse.
 */
export class OperandClassifier {
  constructor(private readonly memValidator: MemoryValidator) {}

  typeOf(str: string): OperandType {
    let v = str.trim().replace(/\bptr\b/ig, '').trim();
    const varInBracket = v.match(/^\[\s*([a-zA-Z_]\w*)\s*\]$/);
    if (varInBracket && this.isLegalVarName(varInBracket[1])) {
      v = varInBracket[1];
    }
    if (this.isNumber(v))                                 return 'INT';
    if (SEGMENT_REGISTERS.includes(v.toUpperCase()))      return 'RS';
    if (BYTE_REGISTERS.includes(v.toUpperCase()))         return 'RL';
    if (WORD_REGISTERS.includes(v.toUpperCase()))         return 'RX';
    if (/(w\.|word)\s*\[/i.test(v))                      return 'MW';
    if (/(b\.|byte)\s*\[/i.test(v))                      return 'MB';
    if (/\[/.test(v))                                     return 'MU';
    if (this.isOffset(v))                                 return 'OFF';
    if (this.isLegalVarName(v))                           return 'VAR';
    return '';
  }

  isValid(operand: string): { ok: boolean; message: CompilerErrorCode | '' } {
    operand = operand.trim().replace(/\bptr\b/ig, '').trim();

    if (ALL_REGISTERS.includes(operand.toUpperCase()))
      return { ok: true, message: '' };

    const varInBracket = operand.match(/^\[\s*([a-zA-Z_]\w*)\s*\]$/);
    if (varInBracket && this.isLegalVarName(varInBracket[1]))
      return { ok: true, message: '' };

    if (/\[/.test(operand)) {
      operand = operand.replace(/\s*(?=\[)/, '').replace(/(?<=\])\s*/, '');
      return this.memValidator.isValid(operand)
        ? { ok: true, message: '' }
        : { ok: false, message: CompilerErrorCode.INVALID_MEMORY_ADDRESSING };
    }

    if (this.isNumber(operand) || this.isLegalVarName(operand))
      return { ok: true, message: '' };

    if (/offset\s/i.test(operand)) {
      const rest = operand.replace(/offset/i, '').trim();
      return this.isLegalVarName(rest)
        ? { ok: true, message: '' }
        : { ok: false, message: CompilerErrorCode.INVALID_OFFSET_OR_VAR_NAME };
    }

    return { ok: false, message: CompilerErrorCode.INVALID_OPERAND };
  }

  isNumber(str: string): boolean {
    if (/\w\s*\*\s*\w/.test(str))
      return str.split('*').every(n => this.isNumericLiteral(n.trim()));
    return this.isNumericLiteral(str);
  }

  isOffset(str: string): boolean {
    const v = str.trim();
    const m = v.match(/(?<=\s)\w+/);
    return /OFFSET\s+\w/i.test(v) && m !== null && this.isLegalVarName(m[0]);
  }

  isLegalVarName(str: string): boolean {
    str = str.toUpperCase().trim();
    return !(
      /[^A-Z0-9_@]/.test(str) || /^\d|^\-\-/.test(str) || /\w\s\w/.test(str) ||
      INSTRUCTIONS.includes(str) || ALL_REGISTERS.includes(str) || str === ''
    );
  }

  charToAscii(str: string): string {
    if (/"."|'.'/i.test(str))
      return str.replace(/(?<=("|')).(?="|')/, str.charCodeAt(1).toString(10));
    return str;
  }

  /** True if str matches any 8086 numeric literal form (hex/bin/decimal/char). */
  private isNumericLiteral(str: string | null): boolean {
    if (str === null) return false;
    if (str.trim() === '?') return true;
    const v = str.replace(/(?<=\-)\s*(?=\w)/g, '');
    return /^0x[a-f0-9]+$|^0[A-F][A-Fa-f0-9]*h$|^\d+[A-Fa-f0-9]*h$|^[0-1]+(b$)|^\d+$|^"."$|^'.'$/i
      .test(str[0] === '-' ? v.replace('-', '') : str);
  }
}

export { WORD_REGISTERS, BYTE_REGISTERS, SEGMENT_REGISTERS, ALL_REGISTERS, INSTRUCTIONS };
