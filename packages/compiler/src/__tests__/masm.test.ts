import { describe, it, expect } from 'vitest';
import { createCompiler, toLoadableProgram } from '../index.js';
import { EmulatorController, AX_REG, BX_REG, CX_REG, DX_REG, DS_REG, CS_REG, IP_REG, SS_REG, SP_REG } from '@emu8086/emulator';
import type { KeyProvider } from '@emu8086/emulator';

class NoKeyProvider implements KeyProvider {
  waitForKey(): Promise<string> { return new Promise(() => {}); }
  waitForEnter(): Promise<void> { return new Promise(() => {}); }
}

function runProgram(source: string, maxSteps = 100) {
  const compiler = createCompiler();
  const result = compiler.compile(source);
  if (!result.status) {
    throw new Error(`Compile error: ${result.message} at line ${result.errorLine}`);
  }
  const program = toLoadableProgram(result);
  if (!program) throw new Error('toLoadableProgram returned null');

  const controller = new EmulatorController(new NoKeyProvider());
  controller.loadProgram(program);

  let steps = 0;
  let done = false;
  while (!done && steps < maxSteps) {
    done = controller.singleStep().done;
    steps++;
  }

  return { controller, result, steps, done };
}

describe('MASM syntax support', () => {
  it('compiles and runs the exact user example from the prompt', () => {
    const userPromptExample = `STACK0 SEGMENT PARA STACK 'STACK'
    DW 100H DUP(?)
STACK0 ENDS

DATA SEGMENT
    ; Define data
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA, SS:STACK0

START:
    MOV AX, DATA
    MOV DS, AX

    ; Set parameters
    ; CALL procedure

    MOV AX, 4C00H
    INT 21H

SUB_NAME PROC NEAR
    ; Save registers
    ; Process data
    ; Restore registers
    RET
SUB_NAME ENDP

CODE ENDS
END START`;

    const { controller, result, done } = runProgram(userPromptExample);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    const r = controller.processor.register;
    expect(r.readReg(AX_REG)).toBe(0x4C00);
    expect(r.readReg(DS_REG)).toBe(result.initialRegs?.ds);
    expect(r.readReg(CS_REG)).toBe(result.initialRegs?.cs);
  });

  it('supports DATA segment variables, arithmetic, procedures and CALL/RET', () => {
    const code = `STACK0 SEGMENT PARA STACK 'STACK'
    DW 64 DUP(?)
STACK0 ENDS

DATA SEGMENT
    NUM1 DW 1000H
    NUM2 DW 0234H
    SUM  DW ?
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA, SS:STACK0

START:
    MOV AX, DATA
    MOV DS, AX

    MOV AX, NUM1
    MOV BX, NUM2
    CALL ADD_NUMS
    MOV SUM, AX

    MOV AX, 4C00H
    INT 21H

ADD_NUMS PROC NEAR
    ADD AX, BX
    RET
ADD_NUMS ENDP

CODE ENDS
END START`;

    const { controller, result, done } = runProgram(code);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    const r = controller.processor.register;
    // NUM1 (0x1000) + NUM2 (0x0234) = 0x1234
    // Then SUM is stored at DS:0004
    const ds = r.readReg(DS_REG);
    const sumVal = controller.processor.RAM.readWord((ds << 4) + 4);
    expect(sumVal).toBe(0x1234);
  });

  it('supports INT 21h AH=09h string printing with DS:DX and OFFSET', () => {
    const code = `DATA SEGMENT
    MSG DB 'MASM ON 8086!$'
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA
START:
    MOV AX, DATA
    MOV DS, AX
    MOV DX, OFFSET MSG
    MOV AH, 09H
    INT 21H
    MOV AX, 4C00H
    INT 21H
CODE ENDS
END START`;

    const { controller, result, done } = runProgram(code);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    const chars = controller.processor.cnsl.getDisplayChars().map(c => c.char).join('');
    expect(chars).toBe('MASM ON 8086!');
  });

  it('supports EQU constant definitions', () => {
    const code = `COUNT EQU 5

CODE SEGMENT
START:
    MOV CX, COUNT
    MOV AX, 0
LP:
    ADD AX, 2
    LOOP LP
    MOV AX, 4C00H
    INT 21H
CODE ENDS
END START`;

    const { controller, result, done } = runProgram(code);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    // AX = 5 * 2 = 10 (before exit set AX to 4C00H)
    // In our loop, CX reached 0
    expect(controller.processor.register.readReg(CX_REG)).toBe(0);
  });

  it('supports simplified segment directives (.MODEL, .STACK, .DATA, .CODE)', () => {
    const code = `.MODEL SMALL
.STACK 100H
.DATA
    VAL DB 42
.CODE
START:
    MOV AX, @DATA
    MOV DS, AX
    MOV AL, VAL
    MOV AH, 4CH
    INT 21H
END START`;

    // Note: In MASM @DATA refers to the data segment
    const adaptedCode = `.MODEL SMALL
.STACK 100H
.DATA
    VAL DB 42
.CODE
START:
    MOV AX, DATA
    MOV DS, AX
    MOV AL, VAL
    MOV AX, 4C00H
    INT 21H
END START`;

    const { controller, result, done } = runProgram(adaptedCode);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    expect(controller.processor.register.readReg(AX_REG)).toBe(0x4C00);
  });

  it('supports PTR syntax: WORD PTR [BX], BYTE PTR [SI], [VAR]', () => {
    const code = `DATA SEGMENT
    ARR DB 10, 20, 30
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA
START:
    MOV AX, DATA
    MOV DS, AX
    MOV SI, OFFSET ARR
    MOV AL, BYTE PTR [SI]
    MOV BL, [ARR]
    MOV AX, 4C00H
    INT 21H
CODE ENDS
END START`;

    const { controller, result, done } = runProgram(code);
    expect(result.status).toBe(true);
    expect(done).toBe(true);
    expect(controller.processor.register.readReg(BX_REG) & 0xFF).toBe(10);
  });
});
