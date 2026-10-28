import type { CompilerErrorCode } from './error-codes.js';

export type OperandType =
  | 'INT' | 'VAR' | 'VAR8' | 'VAR16' | 'VARU'
  | 'STR'
  | 'RX' | 'RL' | 'RS'
  | 'MU' | 'MB' | 'MW'
  | 'OFF' | 'LBL' | 'DIS' | 'INS'
  | 'DUP' | 'DUPSIZE' | 'SEG' | '';

export interface Operand {
  name: string;
  type: OperandType;
}

export type ExpressionType = 'INST' | 'VAR' | 'NULL' | 'MACRO' | 'macro definition' | null;
export type InstructionType = 'prePropIns' | 'InsSIM' | 'DB' | null;
export type VariableClass = 'DB' | 'DW' | 'DD' | 'DU' | null;
export type VariableSize = 'BYTE' | 'WORD' | 'DWORD' | 'UNKNOWN' | null;

export interface LexicalLine {
  good: boolean;
  expressionType: ExpressionType;
  instructionType: InstructionType;
  label: string[] | null;
  message: CompilerErrorCode | null;
  instName: string | null;
  variableName: string | null;
  variableClass: VariableClass;
  operands: Operand[];
  index: number | null;
  segmentName?: string | null;
}

export interface SegmentEntry {
  name: string;
  base: number;
  size: number;
  isStack?: boolean;
}

export interface VariableEntry {
  line: number | null;
  size: VariableSize;
  varName: string | null;
  addr: number;
}

export interface LabelEntry {
  line: number | null;
  labelName: string | null;
  addr: number;
}

export interface FinalViewLine {
  executableLine: boolean;
  lexicalLine: LexicalLine | null;
  originalLine: string;
  resolvedLine: string;
  opcodes: number[];
  instructionSize: number;
  instructionAddr: number;
}

export interface MacroEntry {
  name: string | null;
  op: Operand[];
  index: number | null;
  innerContent: LexicalLine[];
  localInstParameter: Operand[];
}

export interface SyntaxResult {
  good: boolean;
  message: CompilerErrorCode | null;
}

export interface AnalysisResult {
  good: boolean;
  message: CompilerErrorCode | null;
  index: number | null;
}

export interface LexicalAnalysisResult {
  status: boolean;
  lexicalView: LexicalLine[];
}

export interface PreProcessorResult {
  status: boolean;
  lexicalView: LexicalLine[];
  varArray: VariableEntry[];
  labelArray: LabelEntry[];
  origin: number;
  message: CompilerErrorCode | '';
  errorLine: number | null;
  segments?: SegmentEntry[];
  entryPointLabel?: string | null;
  initialRegs?: {
    cs?: number;
    ip?: number;
    ss?: number;
    sp?: number;
    ds?: number;
    es?: number;
  };
}

export interface PostLinkState {
  good: boolean;
  message: CompilerErrorCode | '';
  errorLine: number | null;
}

export interface CompilerResult {
  status: boolean;
  origin: number | null;
  message: CompilerErrorCode | '';
  errorLine: number | null;
  finalView: FinalViewLine[] | null;
  varArray: VariableEntry[] | null;
  labelArray: LabelEntry[] | null;
  segments?: SegmentEntry[];
  initialRegs?: {
    cs?: number;
    ip?: number;
    ss?: number;
    sp?: number;
    ds?: number;
    es?: number;
  };
}
