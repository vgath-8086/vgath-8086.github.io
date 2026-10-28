import { useMemo } from 'react';
import type { CompilerResult } from '@emu8086/compiler';

type FinalViewLine = NonNullable<CompilerResult['finalView']>[number];

export function useSourceHighlight(finalView: FinalViewLine[], currentAddr: number, csNum: number = 0) {
  const addrMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of finalView) {
      if (line.executableLine && line.lexicalLine?.index != null) {
        map.set(line.instructionAddr, line.lexicalLine.index);
      }
    }
    return map;
  }, [finalView]);

  const phys = (csNum << 4) + currentAddr;
  const currentLineIdx = addrMap.get(phys) ?? addrMap.get(currentAddr) ?? -1;

  return { addrMap, currentLineIdx };
}
