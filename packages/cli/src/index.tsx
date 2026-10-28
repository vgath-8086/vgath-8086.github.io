import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { render } from 'ink';
import { createCompiler } from '@emu8086/compiler';
import type { CompilerResult } from '@emu8086/compiler';
import { EmulatorController } from '@emu8086/emulator';
import type { LoadableProgram } from '@emu8086/emulator';
import { NodeKeyProvider } from './node-key-provider.js';
import { NodeVfs } from './node-vfs.js';
import { App } from './app.js';

type FinalViewLine = NonNullable<CompilerResult['finalView']>[number];

const asmPath = process.argv[2];
if (!asmPath) {
  console.error('Usage: emu8086 <file.asm>');
  process.exit(1);
}

const source = readFileSync(resolve(process.cwd(), asmPath), 'utf-8');

// Sync this run into the shared virtual file system (~/.emu8086/files/) so it
// shows up in the web IDE too — same VirtualFileSystem port, node:fs-backed here.
void (async () => {
  const vfs = new NodeVfs();
  const name = basename(asmPath);
  const existing = (await vfs.list()).find(f => f.name === name);
  if (existing) await vfs.write(existing.id, source);
  else await vfs.create(name, source);
})();

const result = createCompiler().compile(source);

if (!result.status || !result.finalView || result.origin === null) {
  console.error('Compilation failed:', result.message);
  process.exit(1);
}

const program: LoadableProgram = {
  origin: result.origin,
  instructions: result.finalView
    .filter((line: FinalViewLine) => line.executableLine)
    .map((line: FinalViewLine) => ({ addr: line.instructionAddr, opcodes: line.opcodes })),
  initialRegs: result.initialRegs,
};

const keyProvider = new NodeKeyProvider();
const controller = new EmulatorController(keyProvider);
controller.loadProgram(program);

const sourceLines = source.split('\n');

render(<App controller={controller} keyProvider={keyProvider} finalView={result.finalView} sourceLines={sourceLines} />);
