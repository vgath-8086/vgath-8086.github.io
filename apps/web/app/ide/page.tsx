'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createCompiler } from '@emu8086/compiler';
import type { CompilerResult } from '@emu8086/compiler';
import { EmulatorController, ExecutionStopReason } from '@emu8086/emulator';
import type { LoadableProgram } from '@emu8086/emulator';
import { useEmulatorLoop, useRegisters, useConsoleOutput, useSourceHighlight } from '@emu8086/react';
import { VfsErrorCode, type VfsFile, type VfsFileMeta } from '@emu8086/shared';
import { DomKeyProvider } from '@/lib/dom-key-provider';
import { IndexedDbVfs } from '@/lib/indexeddb-vfs';
import { useMediaQuery } from '@/lib/use-media-query';
import { EditorPane } from '@/components/ide/EditorPane';
import { FileExplorer } from '@/components/ide/FileExplorer';
import { LoadingScreen } from '@/components/ide/LoadingScreen';
import { RegisterPanel } from '@/components/ide/RegisterPanel';
import { FlagsPanel } from '@/components/ide/FlagsPanel';
import { ConsolePanel } from '@/components/ide/ConsolePanel';
import { RamPanel } from '@/components/ide/RamPanel';
import { StackPanel } from '@/components/ide/StackPanel';
import { MemoryHistoryPanel } from '@/components/ide/MemoryHistoryPanel';
import { PanelModal } from '@/components/ide/PanelModal';
import { ImportModal } from '@/components/ide/ImportModal';
import { Toolbar } from '@/components/ide/Toolbar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { EditorView } from '@codemirror/view';

type FinalViewLine = NonNullable<CompilerResult['finalView']>[number];
type AppMode = 'edit' | 'idle' | 'running' | 'done';
type ExpandedPanel = 'registers' | 'flags' | 'console' | 'ram' | 'stack' | 'history' | null;

const FONT_SIZE_KEY = 'emu8086.editorFontSize';
const DEFAULT_FONT_SIZE = 15;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 24;
const VIM_MODE_KEY = 'emu8086.vimMode';
const LAST_FILE_KEY = 'emu8086.lastFileId';
const AUTOSAVE_DEBOUNCE_MS = 400;

/** Build lineIdx → instructionAddr map from the compiler's finalView. */
function buildLineToAddrMap(finalView: FinalViewLine[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const line of finalView) {
    if (line.executableLine && line.lexicalLine?.index != null) {
      map.set(line.lexicalLine.index, line.instructionAddr);
    }
  }
  return map;
}

const DEFAULT_SOURCE = `org 100h

mov ax, 0005h
mov bx, 0003h
add ax, bx

ret`;

const NEW_FILE_TEMPLATE = `org 100h

ret`;

/** Appends .asm when the given name has no extension of its own. */
function withAsmExt(name: string): string {
  return /\.\w+$/.test(name) ? name : `${name}.asm`;
}

/** Formats the internal numeric RegState into the string-based Regs object used by the UI. */
function formatRegState(st: any) {
  if (!st) return undefined;
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  return {
    ax: hex(st.ax), bx: hex(st.bx), cx: hex(st.cx), dx: hex(st.dx),
    cs: hex(st.cs), ds: hex(st.ds), es: hex(st.es), ss: hex(st.ss),
    sp: hex(st.sp), bp: hex(st.bp), si: hex(st.si), di: hex(st.di),
    ip: hex(st.ip), flags: hex(st.flags),
  };
}

export default function IdePage() {
  const [vfs] = useState(() => new IndexedDbVfs());
  const [files, setFiles] = useState<VfsFileMeta[]>([]);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [mode, setMode] = useState<AppMode>('edit');
  const [status, setStatus] = useState('Write your program and press Compile');
  const [compileError, setCompileError] = useState<string | null>(null);
  const [finalView, setFinalView] = useState<FinalViewLine[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const [showImport, setShowImport] = useState(false);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set());
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [vimMode, setVimMode] = useState(false);
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [mobileView, setMobileView] = useState<'code' | 'debug'>('code');
  const lineToAddrRef = useRef<Map<number, number>>(new Map());
  const [vfsLoading, setVfsLoading] = useState(true);

  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetExecution = useCallback(() => {
    setMode('edit');
    setController(null);
    controllerRef.current = null;
  }, []);

  /** Creates a file, retrying with a "name (2).asm", "name (3).asm"... suffix on collision. */
  const createUniqueFile = useCallback(async (baseName: string, content: string): Promise<VfsFile> => {
    const dot = baseName.lastIndexOf('.');
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot > 0 ? baseName.slice(dot) : '';
    let name = baseName;
    let n = 2;
    for (;;) {
      const result = await vfs.create(name, content);
      if (result.ok) return result.value;
      if (result.error !== VfsErrorCode.NAME_TAKEN) throw new Error(result.error);
      name = `${stem} (${n++})${ext}`;
    }
  }, [vfs]);

  const applyFile = useCallback((file: VfsFile) => {
    setCurrentFileId(file.id);
    setSource(file.content);
    localStorage.setItem(LAST_FILE_KEY, file.id);
    resetExecution();
  }, [resetExecution]);

  // ── Initial load: reopen the last file, or seed a default one on first run ──
  useEffect(() => {
    (async () => {
      const list = await vfs.list();
      const lastId = localStorage.getItem(LAST_FILE_KEY);
      const target = (lastId && list.find(f => f.id === lastId)) ?? list[0];

      if (!target) {
        const created = await createUniqueFile('main.asm', DEFAULT_SOURCE);
        setFiles([created]);
        applyFile(created);
      } else {
        const read = await vfs.read(target.id);
        setFiles(list);
        setCurrentFileId(target.id);
        if (read.ok) setSource(read.value.content);
        localStorage.setItem(LAST_FILE_KEY, target.id);
      }
      loadedRef.current = true;
      setVfsLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced autosave of the active file ──
  useEffect(() => {
    if (!loadedRef.current || !currentFileId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      vfs.write(currentFileId, source);
      setFiles(prev => prev.map(f => f.id === currentFileId ? { ...f, updatedAt: Date.now() } : f));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [source, currentFileId, vfs]);

  // ── Flush immediately when the tab is hidden/closed, so a mid-debounce edit isn't lost ──
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (currentFileId) vfs.write(currentFileId, source);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
    };
  }, [source, currentFileId, vfs]);

  const switchFile = useCallback(async (id: string) => {
    if (id === currentFileId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentFileId) await vfs.write(currentFileId, source);
    const result = await vfs.read(id);
    if (result.ok) applyFile(result.value);
  }, [currentFileId, source, vfs, applyFile]);

  const handleCreateFile = useCallback(async () => {
    if (currentFileId) await vfs.write(currentFileId, source);
    const created = await createUniqueFile('untitled.asm', NEW_FILE_TEMPLATE);
    setFiles(prev => [created, ...prev]);
    applyFile(created);
  }, [currentFileId, source, vfs, createUniqueFile, applyFile]);

  const handleRenameFile = useCallback(async (id: string, name: string) => {
    const result = await vfs.rename(id, name);
    if (result.ok) setFiles(prev => prev.map(f => (f.id === id ? { ...f, name } : f)));
  }, [vfs]);

  const handleDeleteFile = useCallback(async (id: string) => {
    const remaining = files.filter(f => f.id !== id);
    await vfs.delete(id);
    setFiles(remaining);
    if (id === currentFileId && remaining.length > 0) {
      const read = await vfs.read(remaining[0].id);
      if (read.ok) applyFile(read.value);
    }
  }, [files, currentFileId, vfs, applyFile]);

  const handleImportLoad = useCallback(async (src: string, suggestedName: string) => {
    if (currentFileId) await vfs.write(currentFileId, source);
    const created = await createUniqueFile(withAsmExt(suggestedName), src);
    setFiles(prev => [created, ...prev]);
    applyFile(created);
    setShowImport(false);
  }, [currentFileId, source, vfs, createUniqueFile, applyFile]);

  const handleResetAll = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await vfs.clear();
    localStorage.removeItem(LAST_FILE_KEY);
    const created = await createUniqueFile('main.asm', DEFAULT_SOURCE);
    setFiles([created]);
    applyFile(created);
  }, [vfs, createUniqueFile, applyFile]);

  useEffect(() => {
    const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (saved >= MIN_FONT_SIZE && saved <= MAX_FONT_SIZE) setFontSize(saved);
    if (localStorage.getItem(VIM_MODE_KEY) === 'true') setVimMode(true);
  }, []);

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
      localStorage.setItem(FONT_SIZE_KEY, String(next));
      return next;
    });
  }, []);

  const toggleVimMode = useCallback(() => {
    setVimMode(prev => {
      const next = !prev;
      localStorage.setItem(VIM_MODE_KEY, String(next));
      return next;
    });
  }, []);

  const editorViewRef = useRef<EditorView | null>(null);
  const keyProviderRef = useRef<DomKeyProvider | null>(null);
  const controllerRef = useRef<EmulatorController | null>(null);
  const [controller, setController] = useState<EmulatorController | null>(null);

  useEffect(() => {
    keyProviderRef.current = new DomKeyProvider();
  }, []);

  const { tick, refresh } = useEmulatorLoop(controller);
  const regs = useRegisters(controller, tick);
  const prevRegs = controller && mode !== 'edit' ? formatRegState(controller.getRegStateAt((controller.t || 0) - 1)) : undefined;
  const consoleState = useConsoleOutput(controller, tick);
  const { currentLineIdx } = useSourceHighlight(finalView, regs.ipNum, regs.csNum);

  const handleBreakpointToggle = useCallback((lineIdx: number) => {
    if (mode === 'edit') return; // no compiled program yet — nothing to break on
    // Sync to emulator BEFORE the setState updater — StrictMode calls updaters twice,
    // which would double-toggle the address (on then off) leaving the emulator with no breakpoint.
    const ctrl = controllerRef.current;
    const addr = ctrl ? lineToAddrRef.current.get(lineIdx) : undefined;
    if (ctrl && addr != null) ctrl.toggleBreakpoint(addr);
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(lineIdx)) next.delete(lineIdx);
      else next.add(lineIdx);
      return next;
    });
  }, [mode]);

  const closeModal = useCallback(() => setExpandedPanel(null), []);

  const doStop = useCallback(() => {
    controllerRef.current?.stopRun();
    setMode('idle');
    setStatus('Stopped.');
  }, []);

  useEffect(() => {
    if (!controller || mode === 'edit') return;
    const handler = (e: KeyboardEvent) => {
      if (expandedPanel) return; // don't fire shortcuts while a modal is open
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if (target.closest?.('.cm-editor')) return; // CodeMirror's contenteditable surface isn't a TEXTAREA/INPUT
      if (e.key === 'ArrowRight' && mode === 'idle') { doStep(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { doStepBack(); e.preventDefault(); }
      if (e.key === ' ' && mode === 'running') { doStop(); e.preventDefault(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, mode, expandedPanel]);

  const doCompile = useCallback(() => {
    if (!keyProviderRef.current) return;
    const result = createCompiler().compile(source);
    if (!result.status || !result.finalView || result.origin === null) {
      setCompileError(result.message);
      setMode('edit');
      return;
    }
    setCompileError(null);
    const fv = result.finalView;
    setFinalView(fv);

    const lineToAddr = buildLineToAddrMap(fv);
    lineToAddrRef.current = lineToAddr;

    const program: LoadableProgram = {
      origin: result.origin,
      instructions: fv
        .filter((l: FinalViewLine) => l.executableLine)
        .map((l: FinalViewLine) => ({ addr: l.instructionAddr, opcodes: l.opcodes })),
      initialRegs: result.initialRegs,
    };

    let ctrl = controllerRef.current;
    if (!ctrl) {
      ctrl = new EmulatorController(keyProviderRef.current);
      controllerRef.current = ctrl;
    }
    ctrl.loadProgram(program);

    // Re-apply breakpoints after load (addresses may have changed if source changed)
    ctrl.clearBreakpoints();
    setBreakpoints(prev => {
      for (const lineIdx of prev) {
        const addr = lineToAddr.get(lineIdx);
        if (addr != null) ctrl!.addBreakpoint(addr);
      }
      return prev;
    });

    setController(ctrl);
    setMode('idle');
    setStatus('Compiled. →=step  ←=step back  Space=stop');
  }, [source]);

  const doStep = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || mode !== 'idle') return;
    const result = ctrl.singleStep();
    refresh();
    if (result.done) {
      setMode('done');
      setStatus(`Done: ${result.endReason ?? 'execution ended'}`);
    }
  }, [mode, refresh]);

  const doStepBack = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || mode === 'edit' || mode === 'running') return;
    ctrl.stepBack();
    refresh();
    if (mode === 'done') setMode('idle');
  }, [mode, refresh]);

  const doRun = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || mode !== 'idle') return;
    setMode('running');
    setStatus('Running... Space to stop');
    ctrl.startRun(
      () => refresh(),
      (reason) => {
        refresh();
        if (reason === ExecutionStopReason.BREAKPOINT_HIT) {
          setMode('idle');
          setStatus('Breakpoint hit. →=step  ←=step back  Space=stop');
        } else {
          setMode('done');
          setStatus(`Done: ${reason}`);
        }
      },
    );
  }, [mode, refresh]);

  const doReset = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    ctrl.stopRun();
    ctrl.reset();
    refresh();
    setMode('idle');
    setStatus('Reset.');
  }, [refresh]);

  const editorSection = (
    <div className="flex flex-col h-full min-h-0">
      <FileExplorer
        files={files}
        currentId={currentFileId}
        onSelect={switchFile}
        onCreate={handleCreateFile}
        onRename={handleRenameFile}
        onDelete={handleDeleteFile}
        onResetAll={handleResetAll}
      />
      <div className="flex-1 min-h-0">
        <EditorPane
          source={source}
          onChange={setSource}
          currentLineIdx={currentLineIdx}
          onEditorReady={(view) => { editorViewRef.current = view; }}
          readOnly={mode === 'running'}
          breakpoints={breakpoints}
          onBreakpointToggle={handleBreakpointToggle}
          breakpointsEnabled={mode !== 'edit'}
          fontSize={fontSize}
          vimMode={vimMode}
        />
      </div>
    </div>
  );

  if (vfsLoading) return <LoadingScreen />;

  return (
    <TooltipProvider delay={200}>
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100 overflow-hidden">
      <Toolbar
        mode={mode}
        status={status}
        compileError={compileError}
        waiting={consoleState.waiting}
        waitingForChar={consoleState.waitingForChar}
        onImport={() => setShowImport(true)}
        onCompile={doCompile}
        onStep={doStep}
        onStepBack={doStepBack}
        onRun={doRun}
        onStop={doStop}
        onReset={doReset}
        stepCount={controller?.t ?? 0}
        fontSize={fontSize}
        onIncreaseFontSize={() => adjustFontSize(1)}
        onDecreaseFontSize={() => adjustFontSize(-1)}
        vimMode={vimMode}
        onToggleVimMode={toggleVimMode}
        isMobile={isMobile}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />

      {isMobile ? (
        <div className="flex-1 min-h-0">
          {/* Both views stay mounted so switching tabs never resets editor/CodeMirror
              state (breakpoints, execution highlight) or panel scroll positions —
              only visibility toggles. */}
          <div className={mobileView === 'code' ? 'h-full min-h-0' : 'hidden'}>
            {editorSection}
          </div>
          <div className={mobileView === 'debug' ? 'flex flex-col h-full min-h-0' : 'hidden'}>
            <RegisterPanel regs={regs} prev={prevRegs} className="flex-shrink-0" onExpand={() => setExpandedPanel('registers')} />
            <FlagsPanel flagsHex={regs.flags} prevFlagsHex={prevRegs?.flags} onExpand={() => setExpandedPanel('flags')} />
            <Tabs defaultValue="console" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="h-10 rounded-none border-b border-zinc-800 bg-zinc-900 justify-start px-2 flex-shrink-0 overflow-x-auto">
                <TabsTrigger value="console" className="text-xs h-8 px-3">Console</TabsTrigger>
                <TabsTrigger value="ram" className="text-xs h-8 px-3">RAM</TabsTrigger>
                <TabsTrigger value="stack" className="text-xs h-8 px-3">Stack</TabsTrigger>
                <TabsTrigger value="history" className="text-xs h-8 px-3">History</TabsTrigger>
              </TabsList>
              <TabsContent value="console" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <ConsolePanel
                  chars={consoleState.chars}
                  waiting={consoleState.waiting}
                  waitingForChar={consoleState.waitingForChar}
                  className="h-full"
                  onExpand={() => setExpandedPanel('console')}
                />
              </TabsContent>
              <TabsContent value="ram" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <RamPanel controller={controller} regs={regs} tick={tick} onExpand={() => setExpandedPanel('ram')} />
              </TabsContent>
              <TabsContent value="stack" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <StackPanel controller={controller} tick={tick} standalone onExpand={() => setExpandedPanel('stack')} />
              </TabsContent>
              <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <MemoryHistoryPanel controller={controller} tick={tick} standalone onExpand={() => setExpandedPanel('history')} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      ) : (
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Left: Editor */}
        <ResizablePanel defaultSize={55} minSize={30}>
          {editorSection}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right column */}
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex flex-col h-full min-h-0">

            {/* Registers */}
            <RegisterPanel
              regs={regs}
              prev={prevRegs}
              className="flex-shrink-0"
              onExpand={() => setExpandedPanel('registers')}
            />

            {/* Flags */}
            <FlagsPanel
              flagsHex={regs.flags}
              prevFlagsHex={prevRegs?.flags}
              onExpand={() => setExpandedPanel('flags')}
            />

            {/* Console + RAM/Stack/History — vertically resizable */}
            <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
              <ResizablePanel defaultSize={60} minSize={20}>
                <ConsolePanel
                  chars={consoleState.chars}
                  waiting={consoleState.waiting}
                  waitingForChar={consoleState.waitingForChar}
                  className="h-full"
                  onExpand={() => setExpandedPanel('console')}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={40} minSize={15}>
                <div className="h-full border-t border-zinc-800">
                  <Tabs defaultValue="ram" className="h-full flex flex-col">
                    <TabsList className="h-8 rounded-none border-b border-zinc-800 bg-zinc-900 justify-start px-2 flex-shrink-0">
                      <TabsTrigger value="ram" className="text-xs h-6">RAM</TabsTrigger>
                      <TabsTrigger value="stack" className="text-xs h-6">Stack</TabsTrigger>
                      <TabsTrigger value="history" className="text-xs h-6">Mem History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="ram" className="flex-1 min-h-0 mt-0 overflow-hidden">
                      <RamPanel
                        controller={controller}
                        regs={regs}
                        tick={tick}
                        onExpand={() => setExpandedPanel('ram')}
                      />
                    </TabsContent>
                    <TabsContent value="stack" className="flex-1 min-h-0 mt-0 overflow-hidden">
                      <StackPanel
                        controller={controller}
                        tick={tick}
                        standalone
                        onExpand={() => setExpandedPanel('stack')}
                      />
                    </TabsContent>
                    <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-hidden">
                      <MemoryHistoryPanel
                        controller={controller}
                        tick={tick}
                        standalone
                        onExpand={() => setExpandedPanel('history')}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      )}

      {/* ── Import / examples modal ── */}
      {showImport && (
        <ImportModal
          onLoad={handleImportLoad}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Expanded panel modals ── */}
      {expandedPanel === 'registers' && (
        <PanelModal
          title="Registers"
          description="Live snapshot of all 14 8086 registers, refreshed after every step. A yellow card shows a register that just changed."
          onClose={closeModal}
        >
          <RegisterPanel regs={regs} prev={prevRegs} expanded />
        </PanelModal>
      )}
      {expandedPanel === 'flags' && (
        <PanelModal
          title="Flags"
          description="Status bits set automatically by arithmetic and logic operations. Conditional jumps (JE, JG, JC...) branch based on these."
          onClose={closeModal}
        >
          <FlagsPanel flagsHex={regs.flags} prevFlagsHex={prevRegs?.flags} expanded />
        </PanelModal>
      )}
      {expandedPanel === 'console' && (
        <PanelModal
          title="Console"
          description="Text output from INT 10h (video) and INT 21h (DOS) interrupts. Execution pauses here whenever a program waits for keyboard input."
          onClose={closeModal}
        >
          <ConsolePanel
            chars={consoleState.chars}
            waiting={consoleState.waiting}
            waitingForChar={consoleState.waitingForChar}
            className="h-full"
          />
        </PanelModal>
      )}
      {expandedPanel === 'ram' && (
        <PanelModal
          title="RAM"
          description="The full 1MB (20-bit) address space as raw bytes, 16 per row. The tinted row tracks CS:IP, the instruction about to run."
          onClose={closeModal}
        >
          <RamPanel controller={controller} regs={regs} tick={tick} />
        </PanelModal>
      )}
      {expandedPanel === 'stack' && (
        <PanelModal
          title="Stack"
          description="The stack lives at the top of SS and grows downward: PUSH decreases SP and writes there, POP reads from SP and increases it. SP always points at the most recently pushed word."
          onClose={closeModal}
        >
          <StackPanel controller={controller} tick={tick} standalone />
        </PanelModal>
      )}
      {expandedPanel === 'history' && (
        <PanelModal
          title="Memory Write History"
          description="A chronological log of every byte written to RAM during execution, oldest at the bottom. Useful for catching a write to the wrong address."
          onClose={closeModal}
        >
          <MemoryHistoryPanel controller={controller} tick={tick} standalone />
        </PanelModal>
      )}
    </div>
    </TooltipProvider>
  );
}
