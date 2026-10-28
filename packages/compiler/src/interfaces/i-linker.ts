import type { LexicalLine, VariableEntry, LabelEntry, FinalViewLine, PostLinkState, SegmentEntry } from '../types.js';

export interface ILinker {
  link(
    lexicalView: LexicalLine[],
    varArray: VariableEntry[],
    labelArray: LabelEntry[],
    origin: number,
    segments?: SegmentEntry[],
    entryPointLabel?: string | null,
  ): FinalViewLine[];
  verify(finalView: FinalViewLine[]): PostLinkState;
  getOrigin?(): number | null;
  getInitialRegs?(): { cs?: number; ip?: number; ss?: number; sp?: number; ds?: number; es?: number } | null;
}
