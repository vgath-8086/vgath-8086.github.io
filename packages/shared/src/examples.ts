export interface AsmExample {
  id: string;
  name: string;
  category: string;
  description: string;
  source: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA TRANSFER
// ─────────────────────────────────────────────────────────────────────────────
const DATA_TRANSFER: AsmExample[] = [
  {
    id: 'mov',
    name: 'MOV',
    category: 'Data Transfer',
    description: 'Move data between registers, between register and memory, and load immediate values.',
    source: `org 100h

; reg ← immediate
mov ax, 1234h       ; AX = 1234h
mov bl, 0FFh        ; BL = FFh

; reg ← reg
mov cx, ax          ; CX = 1234h

; memory ← reg  (write BL to address 0200h)
mov [0200h], bl     ; mem[0200h] = FFh

; reg ← memory
mov dh, [0200h]     ; DH = FFh

ret`,
  },

  {
    id: 'xchg',
    name: 'XCHG',
    category: 'Data Transfer',
    description: 'Swap two registers (or a register and a memory location) atomically.',
    source: `org 100h

mov ax, 0001h
mov bx, 0002h

xchg ax, bx        ; AX = 0002h, BX = 0001h

; Also works with memory
mov [0200h], ax    ; mem[0200h] = 0002h
xchg bx, [0200h]  ; BX = 0002h, mem[0200h] = 0001h

ret`,
  },

  {
    id: 'lea',
    name: 'LEA',
    category: 'Data Transfer',
    description: 'Load Effective Address — store a computed address into a register without accessing memory.',
    source: `org 100h

mov bx, 0100h
mov si, 0010h

; LEA loads the address, not the value at that address
lea ax, [bx+si]    ; AX = 0110h  (0100h + 0010h)
lea dx, [bx+4]     ; DX = 0104h

ret`,
  },

  {
    id: 'push-pop',
    name: 'PUSH / POP',
    category: 'Data Transfer',
    description: 'Push values onto the stack and pop them off — classic last-in-first-out order.',
    source: `org 100h

mov ax, 0001h
mov bx, 0002h
mov cx, 0003h

push ax            ; stack: [0001h]
push bx            ; stack: [0001h, 0002h]
push cx            ; stack: [0001h, 0002h, 0003h]

pop  dx            ; DX = 0003h  (last in, first out)
pop  si            ; SI = 0002h
pop  di            ; DI = 0001h

ret`,
  },

  {
    id: 'pushf-popf',
    name: 'PUSHF / POPF',
    category: 'Data Transfer',
    description: 'Push the FLAGS register onto the stack and restore it — useful for saving/restoring CPU state.',
    source: `org 100h

mov ax, 0005h
cmp ax, 0005h      ; sets ZF=1 (equal)

pushf              ; save flags (ZF=1) on stack

mov ax, 0001h
cmp ax, 0002h      ; sets ZF=0, CF=1 (below)

popf               ; restore flags: ZF=1 again

; at this point ZF=1, so JE would branch
je  equal
mov bx, 0000h      ; not reached
ret
equal:
mov bx, 0001h      ; BX = 0001h confirms ZF was restored
ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ARITHMETIC
// ─────────────────────────────────────────────────────────────────────────────
const ARITHMETIC: AsmExample[] = [
  {
    id: 'add',
    name: 'ADD',
    category: 'Arithmetic',
    description: 'Add a register, memory operand, or immediate to a register. Sets CF, ZF, SF, OF, PF.',
    source: `org 100h

mov ax, 0003h
mov bx, 0004h

add ax, bx         ; AX = 0007h — reg + reg
add ax, 0001h      ; AX = 0008h — reg + immediate

; Word addition in memory
mov [0200h], ax    ; mem = 0008h
add word [0200h], 0002h  ; mem = 000Ah

ret`,
  },

  {
    id: 'sub',
    name: 'SUB',
    category: 'Arithmetic',
    description: 'Subtract — computes dst = dst − src. Sets CF (borrow), ZF, SF, OF, PF.',
    source: `org 100h

mov ax, 000Ah      ; AX = 10
mov bx, 0003h      ; BX = 3

sub ax, bx         ; AX = 7
sub ax, 0002h      ; AX = 5  (immediate)

; Subtraction that sets CF (borrow)
mov cx, 0001h
sub cx, 0002h      ; CX = FFFFh, CF = 1 (underflow)

ret`,
  },

  {
    id: 'mul',
    name: 'MUL',
    category: 'Arithmetic',
    description: 'Unsigned multiply: AX = AL×src (byte) or DX:AX = AX×src (word).',
    source: `org 100h

; 8-bit: AL × BL → AX
mov al, 0Ah        ; AL = 10
mov bl, 05h        ; BL = 5
mul bl             ; AX = 0032h (50)

; 16-bit: AX × BX → DX:AX
mov ax, 0064h      ; AX = 100
mov bx, 0064h      ; BX = 100
mul bx             ; DX:AX = 0000h:2710h (10000)

ret`,
  },

  {
    id: 'div',
    name: 'DIV',
    category: 'Arithmetic',
    description: 'Unsigned divide: AX÷src → AL (quotient) + AH (remainder) for byte; DX:AX÷src → AX+DX for word.',
    source: `org 100h

; 8-bit division: AX ÷ BL
mov ax, 0019h      ; AX = 25
mov bl, 04h        ; divisor = 4
div bl             ; AL = 6 (quotient), AH = 1 (remainder)

; 16-bit division: DX:AX ÷ BX
mov dx, 0000h
mov ax, 0064h      ; DX:AX = 100
mov bx, 0007h      ; divisor = 7
div bx             ; AX = 14 (quotient), DX = 2 (remainder)

ret`,
  },

  {
    id: 'neg',
    name: 'NEG',
    category: 'Arithmetic',
    description: "Two's complement negation: dst = 0 − dst. Sets CF (unless src was 0), SF, ZF, OF.",
    source: `org 100h

mov ax, 0005h
neg ax             ; AX = FFFBh (-5 in two's complement)

mov bx, 0000h
neg bx             ; BX = 0000h, CF = 0 (special case: neg 0)

mov cx, 8000h
neg cx             ; CX = 8000h, OF = 1 (overflow: -(-32768) = 32768 doesn't fit)

ret`,
  },

  {
    id: 'inc-dec',
    name: 'INC / DEC',
    category: 'Arithmetic',
    description: 'Increment or decrement by 1. Does NOT affect CF — useful in loops without disturbing carry.',
    source: `org 100h

mov ax, 0000h

inc ax             ; AX = 0001h
inc ax             ; AX = 0002h

dec ax             ; AX = 0001h
dec ax             ; AX = 0000h
dec ax             ; AX = FFFFh (wraps — CF not set)

; Works on memory too
mov byte [0200h], 09h
inc byte [0200h]   ; mem[0200h] = 0Ah
dec byte [0200h]   ; mem[0200h] = 09h

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON
// ─────────────────────────────────────────────────────────────────────────────
const COMPARISON: AsmExample[] = [
  {
    id: 'cmp',
    name: 'CMP',
    category: 'Comparison',
    description: 'Compare two operands by subtracting without storing the result — sets flags for conditional jumps.',
    source: `org 100h

mov ax, 0005h
mov bx, 0005h
cmp ax, bx         ; ZF=1, CF=0 (equal)
je  equal          ; jumps because ZF=1

mov cx, 0001h      ; not reached
jmp done
equal:
    mov cx, 0002h  ; CX = 0002h confirms the branch was taken
done:

cmp ax, 000Ah      ; AX(5) < 10: CF=1, ZF=0
jb  below          ; jumps because CF=1
mov dx, 0000h
jmp finish
below:
    mov dx, 0001h  ; DX = 0001h
finish:

ret`,
  },

  {
    id: 'test',
    name: 'TEST',
    category: 'Comparison',
    description: 'Bitwise AND without storing the result — sets ZF/SF/PF; use to check individual bits.',
    source: `org 100h

mov ax, 0006h      ; 0000 0110b

; Check bit 0 (odd/even)
test ax, 0001h     ; AND = 0 → ZF=1 (even number)
jz  even
mov bx, 0001h      ; odd
jmp next
even:
    mov bx, 0000h  ; BX = 0 → confirmed even
next:

; Check bit 2
test ax, 0004h     ; AND = 0100b (non-zero) → ZF=0
jnz bit2_set
mov cx, 0000h
jmp done
bit2_set:
    mov cx, 0001h  ; CX = 1 → bit 2 is set
done:

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BIT OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
const BIT_OPS: AsmExample[] = [
  {
    id: 'and',
    name: 'AND',
    category: 'Bit Operations',
    description: 'Bitwise AND — mask bits to zero. Classic use: extract a bit-field or test flags.',
    source: `org 100h

mov ax, 0F0Fh      ; 0000 1111 0000 1111

; Keep only the low byte
and ax, 00FFh      ; AX = 000Fh

; Mask a single bit (bit 3)
mov bx, 00FFh
and bx, 0008h      ; BX = 0008h (bit 3 isolated)

; Convert uppercase ASCII to lowercase: set bit 5
mov cl, 41h        ; 'A'
or  cl, 20h        ; CL = 61h 'a'  (OR is more natural here — shown for contrast)

ret`,
  },

  {
    id: 'or',
    name: 'OR',
    category: 'Bit Operations',
    description: 'Bitwise OR — set individual bits without disturbing others.',
    source: `org 100h

mov ax, 0F00h

; Set the low byte bits
or ax, 000Fh       ; AX = 0F0Fh

; Set bit 6 (0-indexed)
or ax, 0040h       ; AX = 0F4Fh

; OR with self: fast non-destructive ZF/SF test  (result unchanged)
or ax, ax          ; ZF=0 (ax ≠ 0)
jnz nonzero
mov bx, 0000h
jmp done
nonzero:
    mov bx, 0001h  ; BX = 1 — confirmed non-zero
done:

ret`,
  },

  {
    id: 'xor',
    name: 'XOR',
    category: 'Bit Operations',
    description: 'Bitwise XOR — toggle bits. XOR reg,reg is the fastest way to zero a register.',
    source: `org 100h

; Zero a register without an immediate (smaller encoding)
xor ax, ax         ; AX = 0000h

; Toggle bits
mov bx, 00FFh
xor bx, 0F0Fh      ; BX = 0FF0h (bits flip where mask=1)

; Simple byte swap trick via XOR
mov al, 0AAh       ; AL = 10101010b
mov bl, 055h       ; BL = 01010101b
xor al, bl         ; AL = FFh
xor bl, al         ; BL = AAh  (original AL)
xor al, bl         ; AL = 55h  (original BL — values swapped)

ret`,
  },

  {
    id: 'not',
    name: 'NOT',
    category: 'Bit Operations',
    description: "Bitwise NOT — flip every bit (one's complement). Does not affect flags.",
    source: `org 100h

mov ax, 00FFh      ; 0000 0000 1111 1111
not ax             ; AX = FF00h

mov bl, 0Ah        ; 0000 1010
not bl             ; BL = F5h (1111 0101)

; NOT then INC = NEG (two's complement)
mov cx, 0005h
not cx             ; CX = FFFAh
inc cx             ; CX = FFFBh  (-5)

ret`,
  },

  {
    id: 'shl',
    name: 'SHL / SAL',
    category: 'Bit Operations',
    description: 'Shift left — each shift multiplies by 2 and shifts a bit into CF.',
    source: `org 100h

mov ax, 0001h

shl ax, 1          ; AX = 0002h (×2)
shl ax, 1          ; AX = 0004h (×2)

; Shift by CL
mov cl, 03h
shl ax, cl         ; AX = 0020h (×8)

; Shift out into CF
mov bx, 8000h      ; bit 15 set
shl bx, 1          ; BX = 0000h, CF = 1 (MSB shifted out)

ret`,
  },

  {
    id: 'shr',
    name: 'SHR',
    category: 'Bit Operations',
    description: 'Logical shift right — fills with 0. Divides unsigned values by 2 per shift.',
    source: `org 100h

mov ax, 0080h      ; 128

shr ax, 1          ; AX = 0040h (64)
shr ax, 1          ; AX = 0020h (32)

; Shift by CL
mov cl, 02h
shr ax, cl         ; AX = 0008h (8)

; CF gets the last bit shifted out
mov bx, 0003h      ; 0000 0011
shr bx, 1          ; BX = 0001h, CF = 1

ret`,
  },

  {
    id: 'sar',
    name: 'SAR',
    category: 'Bit Operations',
    description: 'Arithmetic shift right — sign-extends (fills with MSB). Divides signed values by 2.',
    source: `org 100h

; Positive number — same as SHR
mov ax, 0010h      ; +16
sar ax, 1          ; AX = 0008h (+8)

; Negative number — sign bit preserved
mov bx, 0FF00h     ; -256 (signed)
sar bx, 1          ; BX = 0FF80h (-128, sign extended)

mov cl, 02h
sar bx, cl         ; BX = 0FFE0h (-32)

ret`,
  },

  {
    id: 'rol',
    name: 'ROL',
    category: 'Bit Operations',
    description: 'Rotate left — the bit shifted out of the MSB wraps into the LSB and into CF.',
    source: `org 100h

mov al, 80h        ; 1000 0000

rol al, 1          ; AL = 01h  (1→CF, wraps to bit 0), CF=1
rol al, 1          ; AL = 02h, CF=0
rol al, 1          ; AL = 04h

; After 8 rotations, back to original
mov cl, 05h
rol al, cl         ; AL = 80h (rotated 8 total)

ret`,
  },

  {
    id: 'ror',
    name: 'ROR',
    category: 'Bit Operations',
    description: 'Rotate right — LSB wraps to MSB and into CF.',
    source: `org 100h

mov al, 01h        ; 0000 0001

ror al, 1          ; AL = 80h (bit 0 → MSB), CF=1
ror al, 1          ; AL = 40h, CF=0

mov cl, 06h
ror al, cl         ; AL = 01h (rotated 8 total)

ret`,
  },

  {
    id: 'rcl',
    name: 'RCL',
    category: 'Bit Operations',
    description: 'Rotate left through Carry — CF participates as an extra bit, making it a 17-bit rotation.',
    source: `org 100h

; Use CLC first so CF is known
clc
mov ax, 8000h      ; MSB set

rcl ax, 1          ; AX = 0000h, CF = 1 (MSB → CF)
rcl ax, 1          ; AX = 0001h, CF = 0 (old CF → LSB)

; Useful for multi-precision shifts
mov bx, 0000h
rcl bx, 1          ; CF was 0: BX = 0000h, CF=0

ret`,
  },

  {
    id: 'rcr',
    name: 'RCR',
    category: 'Bit Operations',
    description: 'Rotate right through Carry — like RCL but in the opposite direction.',
    source: `org 100h

stc                ; CF = 1
mov ax, 0001h      ; LSB set

rcr ax, 1          ; AX = 8000h (CF→MSB), CF=1 (LSB→CF)
rcr ax, 1          ; AX = C000h, CF=0

clc
rcr ax, 1          ; AX = 6000h, CF=0

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL FLOW
// ─────────────────────────────────────────────────────────────────────────────
const CONTROL_FLOW: AsmExample[] = [
  {
    id: 'jmp',
    name: 'JMP',
    category: 'Control Flow',
    description: 'Unconditional jump — short (±127 bytes) or near (full segment) direct jump to a label.',
    source: `org 100h

mov ax, 0001h
jmp skip           ; skip the next instruction

mov ax, 0DEADh     ; never executed

skip:
mov bx, 0002h      ; BX = 0002h — we landed here

ret`,
  },

  {
    id: 'call-ret',
    name: 'CALL / RET',
    category: 'Control Flow',
    description: 'CALL pushes the return address onto the stack and jumps to a procedure. RET pops and returns.',
    source: `org 100h

mov ax, 0003h
mov bx, 0004h
call add_ab        ; call the subroutine

; AX = 0007h after return
ret

; Subroutine: AX = AX + BX
add_ab:
    add ax, bx
    ret`,
  },

  {
    id: 'loop',
    name: 'LOOP',
    category: 'Control Flow',
    description: 'Decrement CX and jump if CX ≠ 0 — the classic 8086 counted loop.',
    source: `org 100h

; Sum 1+2+3+4+5 = 15 (000Fh)
mov ax, 0000h      ; accumulator
mov cx, 0005h      ; loop 5 times

sum_loop:
    add ax, cx     ; ax += cx  (5,4,3,2,1)
    loop sum_loop  ; CX-- ; jump if CX≠0

; AX = 000Fh (15)
ret`,
  },

  {
    id: 'je-jne',
    name: 'JE / JNE',
    category: 'Control Flow',
    description: 'Jump if Equal (ZF=1) or Jump if Not Equal (ZF=0) — most common conditional jumps.',
    source: `org 100h

mov ax, 0005h
cmp ax, 0005h      ; ZF=1 (equal)
je  was_equal
mov bx, 0000h
jmp next
was_equal:
    mov bx, 0001h  ; BX=1: branch taken ✓
next:

cmp ax, 0009h      ; ZF=0 (not equal)
jne was_not_equal
mov cx, 0000h
jmp done
was_not_equal:
    mov cx, 0001h  ; CX=1: branch taken ✓
done:

ret`,
  },

  {
    id: 'jl-jg',
    name: 'JL / JG / JLE / JGE',
    category: 'Control Flow',
    description: 'Signed comparisons: Jump if Less, Greater, Less-or-Equal, Greater-or-Equal.',
    source: `org 100h

mov ax, 0003h      ; signed +3

; JL: jump if less (SF≠OF)
cmp ax, 0005h      ; 3 < 5
jl  less
mov bx, 0000h
jmp t2
less:   mov bx, 0001h   ; BX=1 ✓
t2:

; JG: jump if greater (ZF=0 and SF=OF)
cmp ax, 0001h      ; 3 > 1
jg  greater
mov cx, 0000h
jmp t3
greater: mov cx, 0001h  ; CX=1 ✓
t3:

; Signed negative: FFFEh = -2
mov dx, 0FFFEh
cmp dx, 0001h      ; -2 < 1
jl  neg_less
mov si, 0000h
jmp done
neg_less: mov si, 0001h  ; SI=1 ✓
done:

ret`,
  },

  {
    id: 'jb-ja',
    name: 'JB / JA / JBE / JAE',
    category: 'Control Flow',
    description: 'Unsigned comparisons: Jump if Below (CF=1), Above (CF=0 and ZF=0), etc.',
    source: `org 100h

mov ax, 0003h

; JB (below = unsigned less): CF=1 after CMP if src > dst
cmp ax, 0005h      ; 3 < 5 unsigned → CF=1
jb  below
mov bx, 0000h
jmp t2
below:  mov bx, 0001h   ; BX=1 ✓
t2:

; JA (above = unsigned greater): CF=0 and ZF=0
cmp ax, 0001h      ; 3 > 1 → CF=0, ZF=0
ja  above
mov cx, 0000h
jmp t3
above:  mov cx, 0001h   ; CX=1 ✓
t3:

; 0FFFFh is large unsigned but -1 signed — JB sees it as large
mov dx, 0FFFFh
cmp dx, 0001h      ; 65535 > 1 unsigned → CF=0
ja  big
mov si, 0000h
jmp done
big:    mov si, 0001h   ; SI=1 ✓
done:

ret`,
  },

  {
    id: 'js-jo',
    name: 'JS / JO / JP',
    category: 'Control Flow',
    description: 'Jump on Sign (SF), Overflow (OF), or Parity (PF). Useful for detecting edge cases.',
    source: `org 100h

; JS: jump if sign flag set (result was negative)
mov ax, 0000h
sub ax, 0001h      ; AX = FFFFh, SF=1
js  signed_neg
mov bx, 0000h
jmp t2
signed_neg: mov bx, 0001h   ; BX=1 ✓
t2:

; JO: jump if signed overflow (e.g. 7FFFh + 1)
mov ax, 7FFFh      ; max positive signed 16-bit
add ax, 0001h      ; overflows to 8000h (-32768), OF=1
jo  overflow
mov cx, 0000h
jmp t3
overflow: mov cx, 0001h    ; CX=1 ✓
t3:

; JP: jump if parity even (even number of 1-bits in low byte)
mov ax, 0003h      ; 0000 0011 — two 1-bits → PF=1
or  ax, ax         ; refresh flags
jp  parity_even
mov dx, 0000h
jmp done
parity_even: mov dx, 0001h  ; DX=1 ✓
done:

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// STRING OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
const STRING_OPS: AsmExample[] = [
  {
    id: 'movs',
    name: 'MOVS (MOVSB / MOVSW)',
    category: 'String Operations',
    description: 'Copy one byte/word from DS:SI to ES:DI, then auto-advance SI and DI by 1 or 2.',
    source: `org 100h

; Copy 1 byte from 0200h to 0300h
mov si, 0200h
mov di, 0300h
mov byte [si], 0ABh   ; source = ABh

movsb                  ; copies [0200h]→[0300h], SI++, DI++

; mem[0300h] = ABh
ret`,
  },

  {
    id: 'lods',
    name: 'LODS (LODSB / LODSW)',
    category: 'String Operations',
    description: 'Load byte/word from DS:SI into AL/AX, then advance SI.',
    source: `org 100h

; Set up a source byte
mov si, 0200h
mov byte [0200h], 042h  ; 'B'
mov byte [0201h], 043h  ; 'C'

lodsb           ; AL = 42h, SI = 0201h
mov bl, al      ; BL = 42h

lodsb           ; AL = 43h, SI = 0202h
mov cl, al      ; CL = 43h

ret`,
  },

  {
    id: 'stos',
    name: 'STOS (STOSB / STOSW)',
    category: 'String Operations',
    description: 'Store AL/AX into ES:DI, then advance DI. Perfect for filling a buffer.',
    source: `org 100h

; Fill 4 bytes at 0200h with 0FFh
mov al, 0FFh
mov di, 0200h

stosb              ; [0200h] = FFh, DI = 0201h
stosb              ; [0201h] = FFh, DI = 0202h
stosb              ; [0202h] = FFh
stosb              ; [0203h] = FFh

ret`,
  },

  {
    id: 'cmps',
    name: 'CMPS (CMPSB / CMPSW)',
    category: 'String Operations',
    description: 'Compare bytes/words at DS:SI and ES:DI, set flags, advance both pointers.',
    source: `org 100h

mov byte [0200h], 041h  ; 'A'
mov byte [0300h], 041h  ; 'A'
mov byte [0201h], 042h  ; 'B'
mov byte [0301h], 043h  ; 'C'

mov si, 0200h
mov di, 0300h

cmpsb           ; compare [0200h] vs [0300h]: A==A, ZF=1, SI/DI advance
je  match1
mov ax, 0000h
jmp t2
match1: mov ax, 0001h   ; AX=1 ✓ (matched)
t2:

cmpsb           ; compare [0201h] vs [0301h]: B vs C, ZF=0
jne mismatch
mov bx, 0000h
jmp done
mismatch: mov bx, 0001h  ; BX=1 ✓ (mismatch detected)
done:

ret`,
  },

  {
    id: 'scas',
    name: 'SCAS (SCASB / SCASW)',
    category: 'String Operations',
    description: 'Scan string — compare AL/AX with byte/word at ES:DI, set flags, advance DI.',
    source: `org 100h

; Search for 0Dh (carriage return) in a short string
mov byte [0200h], 041h  ; 'A'
mov byte [0201h], 042h  ; 'B'
mov byte [0202h], 0Dh   ; target
mov byte [0203h], 000h

mov di, 0200h
mov al, 0Dh        ; value to find

scasb              ; DI[0200h]='A' ≠ 0Dh → ZF=0
jne try2
jmp found
try2:
scasb              ; DI[0201h]='B' ≠ 0Dh → ZF=0
jne try3
jmp found
try3:
scasb              ; DI[0202h]=0Dh == 0Dh → ZF=1
je  found
jmp not_found
found:
    mov ax, 0001h  ; AX=1 — found at offset 2
    ret
not_found:
    mov ax, 0000h
    ret`,
  },

  {
    id: 'rep',
    name: 'REP / REPE / REPNE',
    category: 'String Operations',
    description: 'Repeat a string instruction CX times. REPE stops on mismatch; REPNE stops on match.',
    source: `org 100h

; REP STOSB — fill 8 bytes with 00h
mov al, 00h
mov di, 0200h
mov cx, 0008h
rep stosb          ; mem[0200h..0207h] = 00h, CX = 0

; REP MOVSB — copy 4 bytes from 0300h to 0400h
mov byte [0300h], 01h
mov byte [0301h], 02h
mov byte [0302h], 03h
mov byte [0303h], 04h
mov si, 0300h
mov di, 0400h
mov cx, 0004h
rep movsb          ; mem[0400h..0403h] = 01h..04h

; REPNE SCASB — find 03h in the copied block
mov al, 03h
mov di, 0400h
mov cx, 0004h
repne scasb        ; DI advances until match; CX = remaining
; CX = 1 means found at offset 2 (0402h)

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FLAG OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
const FLAG_OPS: AsmExample[] = [
  {
    id: 'clc-stc-cmc',
    name: 'CLC / STC / CMC',
    category: 'Flag Operations',
    description: 'Clear, Set, or Complement the Carry Flag — useful before multi-precision arithmetic or rotate-through-carry.',
    source: `org 100h

clc                ; CF = 0
mov ax, 0001h
rcl ax, 1          ; AX = 0002h (CF=0 shifts in 0)

stc                ; CF = 1
rcl ax, 1          ; AX = 0005h (CF=1 shifts in 1, bit 15 was 0 so new CF=0)

cmc                ; CF flips 0→1 (the rcl above left CF=0)
mov bx, 0000h
adc bx, 0000h      ; BX = 0 + 0 + CF(1) = 0001h

stc
cmc                ; CF = 0 again (1 flipped)

ret`,
  },

  {
    id: 'cld-std',
    name: 'CLD / STD',
    category: 'Flag Operations',
    description: 'Clear or Set the Direction Flag — controls whether string instructions auto-increment (CLD) or auto-decrement (STD) SI/DI.',
    source: `org 100h

; Write 3 bytes at 0200h, 0201h, 0202h
mov byte [0200h], 01h
mov byte [0201h], 02h
mov byte [0202h], 03h

; CLD: DF=0 — SI/DI increment (forward scan)
cld
mov si, 0200h
lodsb              ; AL = 01h, SI = 0201h
lodsb              ; AL = 02h, SI = 0202h

; STD: DF=1 — SI/DI decrement (backward scan)
std
mov si, 0202h
lodsb              ; AL = 03h, SI = 0201h
lodsb              ; AL = 02h, SI = 0200h

cld                ; restore forward direction
ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INTERRUPTS / I/O
// ─────────────────────────────────────────────────────────────────────────────
const INTERRUPTS: AsmExample[] = [
  {
    id: 'int21-02',
    name: 'INT 21h — Write Char (AH=02h)',
    category: 'Interrupts / I/O',
    description: 'DOS service AH=02h: output the character in DL to the console.',
    source: `org 100h

mov ah, 02h

mov dl, 48h    ; 'H'
int 21h
mov dl, 69h    ; 'i'
int 21h
mov dl, 21h    ; '!'
int 21h
mov dl, 0Ah    ; newline
int 21h

ret`,
  },

  {
    id: 'int21-09',
    name: 'INT 21h — Print String (AH=09h)',
    category: 'Interrupts / I/O',
    description: 'DOS service AH=09h: print a $-terminated string pointed to by DS:DX. Use OFFSET to load an address — a bare variable name loads its value instead.',
    source: `org 100h

mov dx, offset msg
mov ah, 09h
int 21h

ret

msg db 'Hello, World!', 0Dh, 0Ah, '$'`,
  },

  {
    id: 'int21-01',
    name: 'INT 21h — Read Char (AH=01h)',
    category: 'Interrupts / I/O',
    description: 'DOS service AH=01h: wait for a keypress, echo it, and return the ASCII code in AL.',
    source: `org 100h

; Prompt
mov dx, offset prompt
mov ah, 09h
int 21h

; Read one character — emulator pauses until a key is pressed
mov ah, 01h
int 21h            ; AL = ASCII of key pressed (and auto-echoed)

; Echo it back a second time explicitly
mov dl, al
mov ah, 02h
int 21h

ret

prompt db 'Press a key: $'`,
  },

  {
    id: 'int21-0a',
    name: 'INT 21h — Buffered Input (AH=0Ah)',
    category: 'Interrupts / I/O',
    description: 'DOS service AH=0Ah: read a line of input (up to N chars) into a buffer, terminated by Enter. This compiler only allows BX/BP/SI/DI inside [...], so address a variable by loading OFFSET into a register first.',
    source: `org 100h

; Set up input buffer: byte 0 = max chars, byte 1 = actual count (filled by INT)
mov bx, offset buf
mov byte [bx+0], 10h  ; accept up to 16 chars
mov byte [bx+1], 00h

mov dx, offset prompt
mov ah, 09h
int 21h            ; print prompt

mov dx, offset buf
mov ah, 0Ah
int 21h            ; read line — stops early on Enter, or after 16 chars

; buf+1 now has the count; buf+2 onward has the characters
mov bx, offset buf
mov al, [bx+1]     ; AL = number of chars actually typed (excludes Enter)

ret

prompt db 'Type text and press Enter: $'
buf    db 10h, 00h, 16 dup (00h)`,
  },

  {
    id: 'int10-09',
    name: 'INT 10h — Write Char + Color (AH=09h)',
    category: 'Interrupts / I/O',
    description: 'Video service AH=09h: write the character in AL using the color in BL (low nibble = foreground).',
    source: `org 100h

mov ah, 09h    ; INT 10h AH=09h: write char + attribute

mov al, 52h    ; 'R'
mov bl, 04h    ; red
int 10h

mov al, 47h    ; 'G'
mov bl, 02h    ; green
int 10h

mov al, 42h    ; 'B'
mov bl, 01h    ; blue
int 10h

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHMS (combined examples)
// ─────────────────────────────────────────────────────────────────────────────
const ALGORITHMS: AsmExample[] = [
  {
    id: 'fibonacci',
    name: 'Fibonacci Sequence',
    category: 'Algorithms',
    description: 'Compute 8 Fibonacci numbers and store them as 16-bit words at DS:0200h.',
    source: `org 100h

; Stores F(0)=0, F(1)=1, … F(7)=13 at 0200h
mov di, 0200h
mov ax, 0000h   ; F(n-2)
mov bx, 0001h   ; F(n-1)
mov cx, 0008h

fib:
    mov [di], ax
    add di, 2
    add ax, bx
    xchg ax, bx
    loop fib

ret`,
  },

  {
    id: 'bubble-sort',
    name: 'Bubble Sort',
    category: 'Algorithms',
    description: 'Sort [5,3,1,4,2] → [1,2,3,4,5] stored as bytes at DS:0200h.',
    source: `org 100h

mov si, 0200h
mov byte [si+0], 05h
mov byte [si+1], 03h
mov byte [si+2], 01h
mov byte [si+3], 04h
mov byte [si+4], 02h

mov cx, 0004h
outer:
    push cx
    mov si, 0200h
    mov cx, 0004h
inner:
    mov al, [si]
    mov bl, [si+1]
    cmp al, bl
    jle no_swap
    mov [si],   bl
    mov [si+1], al
no_swap:
    inc si
    loop inner
    pop cx
    loop outer

ret`,
  },

  {
    id: 'multiply-loop',
    name: 'Multiply via Addition',
    category: 'Algorithms',
    description: 'Compute 6 × 7 = 42 (002Ah) using repeated addition and LOOP.',
    source: `org 100h

mov ax, 0000h
mov bx, 0006h   ; multiplicand
mov cx, 0007h   ; multiplier (loop count)

mul_loop:
    add ax, bx
    loop mul_loop

; AX = 002Ah (42)
ret`,
  },

  {
    id: 'string-length',
    name: 'String Length',
    category: 'Algorithms',
    description: 'Measure the length of a null-terminated string using REPNE SCASB.',
    source: `org 100h

mov byte [0200h], 48h  ; 'H'
mov byte [0201h], 69h  ; 'i'
mov byte [0202h], 21h  ; '!'
mov byte [0203h], 00h  ; null terminator

cld                    ; DF=0 — forward scan
mov di, 0200h
mov al, 00h            ; search for null
mov cx, 0FFFFh         ; max scan distance
repne scasb            ; DI advances past the null; CX decrements

; length = 0FFFFh - CX - 1
mov ax, 0FFFFh
sub ax, cx
dec ax                 ; AX = 3 (length of "Hi!")

ret`,
  },

  {
    id: 'countdown',
    name: 'Countdown 5→1',
    category: 'Algorithms',
    description: 'Print "5 4 3 2 1" using LOOP and INT 21h / AH=02h.',
    source: `org 100h

mov cx, 0005h
mov ah, 02h

count:
    mov dl, cl
    add dl, 30h      ; digit → ASCII
    int 21h
    mov dl, 20h      ; space
    int 21h
    loop count

ret`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PROCEDURES & MACROS
// ─────────────────────────────────────────────────────────────────────────────
const PROCEDURES_AND_MACROS: AsmExample[] = [
  {
    id: 'proc-call-ret',
    name: 'PROC / ENDP',
    category: 'Procedures & Macros',
    description: 'Declare a reusable procedure with PROC/ENDP and invoke it with CALL — note PROC takes the name as its operand (PROC name), not name-first like MASM.',
    source: `org 100h

mov ax, 0003h
call square        ; AX = AX * AX, via repeated addition

; AX = 0009h confirms the call worked
ret

PROC square
    mov bx, ax
    mov cx, ax
    mov ax, 0000h
mul_loop:
    add ax, bx
    dec cx
    jnz mul_loop
    ret
ENDP`,
  },

  {
    id: 'macro-local',
    name: 'MACRO / ENDM / LOCAL',
    category: 'Procedures & Macros',
    description: "Define a parameterised macro with MACRO/ENDM. LOCAL keeps a loop label private to each expansion, so the same macro can be invoked more than once without its labels colliding.",
    source: `org 100h

countdown 3        ; first expansion's "again" label is private to this call
mov bx, ax         ; BX = 0003h

countdown 5        ; second expansion gets its own "again" — no collision
mov cx, ax         ; CX = 0005h

ret

countdown MACRO n
LOCAL again
    mov ax, 0000h
    mov dx, n
again:
    inc ax
    dec dx
    jnz again
ENDM`,
  },

  {
    id: 'masm-segments',
    name: 'MASM Segments & Procedures',
    category: 'Procedures & Macros',
    description: 'Traditional MASM program with STACK, DATA, and CODE segments, ASSUME directive, <name> PROC NEAR / ENDP, and INT 21H termination.',
    source: `STACK0 SEGMENT PARA STACK 'STACK'
    DW 100H DUP(?)
STACK0 ENDS

DATA SEGMENT
    PARAM DW 1234H
    RESULT DW ?
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA, SS:STACK0

START:
    MOV AX, DATA
    MOV DS, AX

    MOV AX, PARAM
    CALL COMPUTE
    MOV RESULT, AX

    MOV AX, 4C00H
    INT 21H

COMPUTE PROC NEAR
    ADD AX, 1111H
    RET
COMPUTE ENDP

CODE ENDS
END START`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
export const EXAMPLES: AsmExample[] = [
  ...DATA_TRANSFER,
  ...ARITHMETIC,
  ...COMPARISON,
  ...BIT_OPS,
  ...CONTROL_FLOW,
  ...STRING_OPS,
  ...FLAG_OPS,
  ...INTERRUPTS,
  ...ALGORITHMS,
  ...PROCEDURES_AND_MACROS,
];

export const CATEGORIES = [
  'Data Transfer',
  'Arithmetic',
  'Comparison',
  'Bit Operations',
  'Control Flow',
  'String Operations',
  'Flag Operations',
  'Interrupts / I/O',
  'Algorithms',
  'Procedures & Macros',
] as const;
