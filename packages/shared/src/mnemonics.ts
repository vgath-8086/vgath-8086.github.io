// Complete list of 8086 mnemonics and assembler directives.
// Used by the compiler (to distinguish reserved words from variable names) and
// the web app (for syntax highlighting in the code editor).

export const INSTRUCTIONS: readonly string[] = [
  // Data / assembler directives
  'DB', 'DW', 'DD', 'DUP', 'ORG', 'EQU', 'DEFINE',
  'SEGMENT', 'ENDS', 'ASSUME', 'END', 'PTR', 'NEAR', 'FAR',
  // Macro directives
  'MACRO', 'ENDM', 'LOCAL', 'PROC', 'ENDP',
  // Data movement
  'MOV', 'XCHG', 'LEA', 'PUSH', 'POP', 'PUSHF', 'POPF', 'LAHF', 'SAHF',
  // Arithmetic
  'ADD', 'ADC', 'SUB', 'SBB', 'SSB', 'NEG', 'INC', 'DEC', 'CMP',
  'AAA', 'CBW', 'CWD', 'MUL', 'IMUL', 'DIV', 'IDIV',
  // Logic / bitwise
  'AND', 'OR', 'XOR', 'NOT', 'TEST',
  // Shift / rotate
  'SHL', 'SHR', 'SAL', 'SAR', 'ROL', 'ROR', 'RCL', 'RCR',
  // Unconditional control flow
  'JMP', 'CALL', 'RET', 'RETN', 'RETF',
  // Conditional jumps (including common aliases)
  'JE',  'JZ',  'JNE', 'JNZ',
  'JG',  'JNLE','JGE', 'JNL',
  'JL',  'JNGE','JLE', 'JNG',
  'JA',  'JNBE','JAE', 'JNB',
  'JB',  'JNAE','JBE', 'JNA',
  'JC',  'JS',  'JNS',
  'JO',  'JNO', 'JP',  'JPE', 'JNP', 'JPO',
  'JCXZ',
  // Loop
  'LOOP', 'LOOPE', 'LOOPZ', 'LOOPNE', 'LOOPNZ',
  // String operations
  'MOVSB', 'MOVSW', 'LODSB', 'LODSW', 'STOSB', 'STOSW',
  'CMPSB', 'CMPSW', 'SCASB', 'SCASW',
  // Repeat prefixes
  'REP', 'REPE', 'REPNE', 'REPNZ', 'REPZ',
  // Flag operations
  'CLC', 'STC', 'CMC', 'CLD', 'STD',
  // Interrupts / misc
  'INT', 'NOP', 'HLT',
];
