import type { LexicalLine } from '../types.js';

export function generateVariable(line: LexicalLine): number[] {
  const bytes: number[] = [];
  const varType = line.variableClass;

  for (const op of line.operands) {
    if (op.type === 'INT') {
      const v = parseInt(op.name);
      if (varType === 'DB' || varType === 'DU') {
        bytes.push(v & 0xFF);
      } else if (varType === 'DD') {
        bytes.push(v & 0xFF);
        bytes.push((v >> 8) & 0xFF);
        bytes.push((v >> 16) & 0xFF);
        bytes.push((v >> 24) & 0xFF);
      } else {
        bytes.push(v & 0xFF);
        bytes.push((v >> 8) & 0xFF);
      }
    } else if (op.type === 'STR') {
      const inner = op.name.trim().slice(1, -1);
      for (let j = 0; j < inner.length; j++)
        bytes.push(inner.charCodeAt(j) & 0xFF);
    }
  }

  return bytes;
}
