import { useMemo } from 'react';
import type { EmulatorController } from '@emu8086/emulator';
import {
  AX_REG, BX_REG, CX_REG, DX_REG,
  CS_REG, DS_REG, ES_REG, SS_REG,
  SP_REG, BP_REG, DI_REG, SI_REG,
  FLAG_REG, IP_REG,
} from '@emu8086/emulator';

function toHex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

export function useRegisters(controller: EmulatorController | null, tick: number) {
  return useMemo(() => {
    if (!controller) {
      return {
        ax: '0000', bx: '0000', cx: '0000', dx: '0000',
        cs: '0000', ds: '0000', es: '0000', ss: '0000',
        sp: '0000', bp: '0000', si: '0000', di: '0000',
        ip: '0000', flags: '0000',
        ipNum: 0,
        csNum: 0,
      };
    }
    const r = controller.processor.register;
    return {
      ax: toHex4(r.readReg(AX_REG)),
      bx: toHex4(r.readReg(BX_REG)),
      cx: toHex4(r.readReg(CX_REG)),
      dx: toHex4(r.readReg(DX_REG)),
      cs: toHex4(r.readReg(CS_REG)),
      ds: toHex4(r.readReg(DS_REG)),
      es: toHex4(r.readReg(ES_REG)),
      ss: toHex4(r.readReg(SS_REG)),
      sp: toHex4(r.readReg(SP_REG)),
      bp: toHex4(r.readReg(BP_REG)),
      si: toHex4(r.readReg(SI_REG)),
      di: toHex4(r.readReg(DI_REG)),
      ip: toHex4(r.readReg(IP_REG)),
      flags: toHex4(r.readReg(FLAG_REG)),
      ipNum: r.readReg(IP_REG),
      csNum: r.readReg(CS_REG),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, tick]);
}
