import { expect } from 'vitest';
import { createCompiler, toLoadableProgram } from '@emu8086/compiler';
import { EXAMPLES } from '@emu8086/shared';
import { EmulatorController } from '@emu8086/emulator';
import type { KeyProvider } from '@emu8086/emulator';

class QueueKeyProvider implements KeyProvider {
  private queue: string[];
  constructor(keys: string[] = []) {
    this.queue = [...keys];
  }
  async waitForKey(): Promise<string> {
    return this.queue.shift() ?? '';
  }
  async waitForEnter(): Promise<void> {
    return;
  }
}

export function getExample(id: string) {
  const example = EXAMPLES.find(e => e.id === id);
  if (!example) throw new Error(`Example ${id} not found`);
  return example;
}

export async function runExample(source: string, keys: string[] = [], maxSteps = 10_000) {
  const program = toLoadableProgram(createCompiler().compile(source));
  if (!program) throw new Error('compile failed');
  const provider = new QueueKeyProvider(keys);
  const controller = new EmulatorController(provider);
  controller.loadProgram(program);

  let steps = 0;
  let done = false;
  while (!done && steps < maxSteps) {
    await Promise.resolve();
    controller.tick();
    done = controller.singleStep().done;
    steps++;
  }
  return { controller, steps, done };
}

export function consoleText(controller: EmulatorController): string {
  return controller.processor.cnsl.getDisplayChars().map(c => c.char).join('');
}

export function expectCategoryCovered(category: string, expectedIds: string[]) {
  const ids = EXAMPLES.filter(e => e.category === category).map(e => e.id);
  expect(ids).toEqual(expectedIds);
}
