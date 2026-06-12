import React, { useState, useEffect, Suspense, useCallback } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logger } from "./lib/logger";
import { useTBMAudio } from "./contexts/TBMAudioContext";
import { useNotifications } from "./hooks/useNotifications";
import { usePerformanceMeter } from "./hooks/usePerformanceMeter";
import { useProjectUndoRedo } from "./hooks/useProjectUndoRedo";
import { useAutoSave } from "./hooks/useAutoSave";
import { useBounceEngine } from "./hooks/useBounceEngine";
import { useFileOperations } from "./hooks/useFileOperations";
import { useDeckLoader } from "./hooks/useDeckLoader";
import { useMacroControls } from "./hooks/useMacroControls";
import { useSongManager } from "./hooks/useSongManager";
import { HeaderBar } from "./components/HeaderBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { NotificationToast } from "./components/NotificationToast";
import { ExportModal } from "./components/ExportModal";
import { VirtualKeyboardSection } from "./components/VirtualKeyboardSection";
import { ControllerPanel } from "./components/ControllerPanel";

const WaveformVisualizer = React.lazy(() => import("./components/WaveformVisualizer").then((m) => ({ default: m.WaveformVisualizer })));
const Mixer808 = React.lazy(() => import("./components/Mixer808").then((m) => ({ default: m.Mixer808 })));
const FXMacros = React.lazy(() => import("./components/FXMacros").then((m) => ({ default: m.FXMacros })));
const ChordBuilder = React.lazy(() => import("./components/ChordBuilder").then((m) => ({ default: m.ChordBuilder })));
const ConsoleMixer = React.lazy(() => import("./components/ConsoleMixer").then((m) => ({ default: m.ConsoleMixer })));
const SettingsView = React.lazy(() => import("./components/SettingsView").then((m) => ({ default: m.SettingsView })));
const DrumMachine = React.lazy(() => import("./components/DrumMachine").then((m) => ({ default: m.DrumMachine })));
const SpectrumAnalyzer = React.lazy(() => import("./components/SpectrumAnalyzer").then((m) => ({ default: m.SpectrumAnalyzer })));
const HatSequencer = React.lazy(() => import("./components/HatSequencer").then((m) => ({ default: m.HatSequencer })));
const VSTManager = React.lazy(() => import("./components/VSTManager").then((m) => ({ default: m.VSTManager })));
const VSTChainManager = React.lazy(() => import("./components/VSTChainManager").then((m) => ({ default: m.VSTChainManager })));
const PianoRoll = React.lazy(() => import("./components/PianoRoll").then((m) => ({ default: m.PianoRoll })));
const SessionMusician = React.lazy(() => import("./components/SessionMusician").then((m) => ({ default: m.SessionMusician })));
const VinylScratchPro = React.lazy(() => import("./components/VinylScratchPro").then((m) => ({ default: m.VinylScratchPro })));
const StemSeparator = React.lazy(() => import("./components/StemSeparator").then((m) => ({ default: m.StemSeparator })));
const MusicLibrary = React.lazy(() => import("./components/MusicLibrary").then((m) => ({ default: m.MusicLibrary })));
const SongEditor = React.lazy(() => import("./components/SongEditor").then((m) => ({ default: m.SongEditor })));
const MacroControls = React.lazy(() => import("./components/MacroControls").then((m) => ({ default: m.MacroControls })));
const TurntableSampler = React.lazy(() => import("./components/TurntableSampler").then((m) => ({ default: m.TurntableSampler })));
const MixerDetailMeters = React.lazy(() => import("./components/AudioMeters").then((m) => ({ default: m.MixerDetailMeters })));

function TabSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-300 rounded-full animate-spin" />
        <span className="text-[13px] font-mono text-neutral-600 uppercase tracking-wider">Loading module...</span>
      </div>
    </div>
  );
}

const patterns = [
  { id: "main", name: "Pattern A" },
  { id: "pattern-1", name: "Pattern B" },
  { id: "pattern-2", name: "Pattern C" },
  { id: "pattern-3", name: "Pattern D" },
];

interface TabContentProps {
  activeTab: string;
  analyserNode: AnalyserNode | null;
  externalBufferA: AudioBuffer | null;
  externalBufferB: AudioBuffer | null;
  externalNameA: string;
  externalNameB: string;
  songs: any[];
  snapshots: { id: string; name: string; values: number[] }[];
  macroValues: number[];
  sequencer: any;
  onSetActiveTab: (tab: string) => void;
  onLoadDeckA: (url: string, name: string) => Promise<void>;
  onLoadDeckB: (url: string, name: string) => Promise<void>;
  onMacroChange: (index: number, value: number) => void;
  onSaveSnapshot: (name: string) => void;
  onLoadSnapshot: (id: string) => void;
  onMorphToSnapshot: (id: string, duration: number) => void;
  onSaveSong: (song: any) => void;
  onDeleteSong: (id: string) => void;
  onPlaySection: (section: any) => void;
  onPlaySong: (song: any) => void;
  onExport: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

function TabContent({
  activeTab, analyserNode,
  externalBufferA, externalBufferB, externalNameA, externalNameB,
  songs, snapshots, macroValues, sequencer,
  onSetActiveTab, onLoadDeckA, onLoadDeckB,
  onMacroChange, onSaveSnapshot, onLoadSnapshot, onMorphToSnapshot,
  onSaveSong, onDeleteSong, onPlaySection, onPlaySong, onExport, showNotification,
}: TabContentProps) {
  const [vinylMode, setVinylMode] = useState<"decks" | "sampler">("decks");
  const [musicDrawerOpen, setMusicDrawerOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(true);

  switch (activeTab) {
    case "sampler":
      return (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="h-[55%] border-b border-border-main bg-bg-main/30 p-5 min-h-0"><WaveformVisualizer /></div>
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="w-1/2 border-r border-border-main p-5 overflow-y-auto custom-scrollbar"><Mixer808 /></div>
            <div className="w-1/2 p-5 overflow-y-auto custom-scrollbar"><FXMacros /></div>
          </div>
        </div>
      );
    case "library":
      return <div className="flex-1 flex flex-col overflow-hidden"><div className="flex-1 min-h-0"><MusicLibrary onLoadDeckA={onLoadDeckA} onLoadDeckB={onLoadDeckB} /></div></div>;
    case "plugins":
      return <div className="flex-1 p-5 overflow-hidden"><VSTManager /></div>;
    case "chains":
      return <div className="flex-1 p-5 overflow-hidden"><VSTChainManager /></div>;
    case "drums":
      return <div className="flex-1 p-5 overflow-hidden"><DrumMachine /></div>;
    case "hats":
      return <div className="flex-1 p-5 overflow-hidden"><HatSequencer /></div>;
    case "chords":
      return <div className="flex-1 p-5 overflow-y-auto custom-scrollbar"><ChordBuilder /></div>;
    case "mixer":
      return (
        <div className="flex-1 flex flex-col gap-2 overflow-hidden p-3">
          <div className="flex-1 bg-neutral-950/80 glass rounded-2xl border border-neutral-800/60 panel-inset overflow-hidden min-h-0"><ConsoleMixer /></div>
          <div className="flex gap-2 shrink-0" style={{ height: 120 }}>
            <div className="flex-1 bg-bg-surface/60 rounded-xl border border-border-main p-3 overflow-hidden"><MixerDetailMeters analyserNode={analyserNode!} /></div>
            <div className="flex-1 bg-bg-main/60 rounded-xl border border-border-main p-3 overflow-hidden"><SpectrumAnalyzer /></div>
          </div>
        </div>
      );
    case "pianoroll":
      return <div className="flex-1 p-5 overflow-hidden"><PianoRoll /></div>;
    case "session":
      return <div className="flex-1 p-5 overflow-y-auto custom-scrollbar"><SessionMusician /></div>;
    case "vinyl":
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface border-b border-border-main shrink-0">
            <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider mr-1">Mode</span>
            <button onClick={() => setVinylMode("decks")} className={`px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wider transition-all ${vinylMode === "decks" ? "bg-brand/15 text-brand border border-brand/40" : "text-neutral-500 hover:text-neutral-300 border border-transparent hover:border-neutral-700"}`}>DJ Decks</button>
            <button onClick={() => setVinylMode("sampler")} className={`px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wider transition-all ${vinylMode === "sampler" ? "bg-brand/15 text-brand border border-brand/40" : "text-neutral-500 hover:text-neutral-300 border border-transparent hover:border-neutral-700"}`}>TT Sampler</button>
          </div>
          {vinylMode === "decks" ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0 p-3 overflow-hidden">
                <VinylScratchPro
                  onSendToSampleEditor={() => { onSetActiveTab("sampler"); showNotification("success", "Sample sent to Sample Editor"); }}
                  externalBufferA={externalBufferA} externalBufferB={externalBufferB}
                  externalNameA={externalNameA} externalNameB={externalNameB}
                />
              </div>
              <div className={`border-t border-neutral-800 shrink-0 transition-all duration-300 ease-in-out ${musicDrawerOpen ? 'h-80' : 'h-0'} overflow-hidden`}>
                <MusicLibrary onLoadDeckA={onLoadDeckA} onLoadDeckB={onLoadDeckB} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden"><TurntableSampler onGoToDrums={() => onSetActiveTab('drums')} /></div>
          )}
        </div>
      );
    case "song":
      return (
        <div className="flex-1 overflow-hidden">
          <SongEditor
            patterns={patterns} songs={songs}
            onSaveSong={onSaveSong} onDeleteSong={onDeleteSong}
            onPlaySection={onPlaySection} onPlaySong={onPlaySong}
            onStop={() => sequencer?.stop()}
            onExport={onExport}
            isPlaying={sequencer?.getState()?.isPlaying ?? false}
          />
        </div>
      );
    case "macro":
      return (
        <div className="flex-1 overflow-hidden">
          <MacroControls
            onMacroChange={onMacroChange} snapshots={snapshots}
            onSaveSnapshot={onSaveSnapshot} onLoadSnapshot={onLoadSnapshot}
            onMorphToSnapshot={onMorphToSnapshot}
          />
        </div>
      );
    case "stems":
      return <div className="flex-1 p-5 overflow-hidden"><StemSeparator /></div>;
    case "settings":
      return <div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsView /></div>;
    default:
      return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("sampler");
  const [isPanic, setIsPanic] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"ideas" | "arranger">("ideas");

  const {
    audioError, resumeAudio, engine, sequencer, pads,
    audioContext, updatePad, setPads, loadSampleToPad,
    loadUrlToDeck, detectBpm, setDeckBpm, setBpm,
    getEngineAnalyser, setProjectKey: setContextProjectKey,
  } = useTBMAudio();

  const analyserNode = getEngineAnalyser();
  const { notification, showNotification } = useNotifications();
  const { cpuPct, ramStr } = usePerformanceMeter();

  const {
    projectKey, activeState, undoStack, redoStack,
    setSnapshot: setUndoSnapshot,
    pushSnapshot, setProjectKey, setActiveState,
    handleUndo, handleRedo, bSnapshotRef,
  } = useProjectUndoRedo({ sequencer, pads, setPads, setBpm });

  const { isAutoSaving, lastSavedAt } = useAutoSave({
    sequencer, engine, pads, projectKey, activeState, activeTab,
    setActiveTab, setBpm, updatePad, loadSampleToPad,
  });

  const {
    showExportModal, setShowExportModal,
    bouncePhase, bounceProgress, bounceResults, bounceError,
    bounceBars, setBounceBars, bounceBpm, setBounceBpm,
    bounceBitDepth, setBounceBitDepth, bounceStemMode, setBounceStemMode,
    bounceFormat, setBounceFormat, bounceMp3Kbps, setBounceMp3Kbps,
    sendingToStudio,
    openExportModal, handleBounce, downloadBounce, sendToStudio48,
    setBouncePhase,
  } = useBounceEngine();

  const { handleProjectSave, handleProjectOpen } = useFileOperations({
    sequencer, pads, projectKey, activeState, activeTab,
    setActiveTab, updatePad, loadSampleToPad, pushSnapshot,
  });

  const {
    externalBufferA, externalBufferB, externalNameA, externalNameB,
    handleLoadDeckA, handleLoadDeckB,
  } = useDeckLoader({ resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification });

  const {
    macroValues, snapshots: macroSnapshots,
    handleMacroChange, handleSaveSnapshot, handleLoadSnapshot, handleMorphToSnapshot,
  } = useMacroControls();

  const { songs, handleSaveSong, handleDeleteSong } = useSongManager();

  useEffect(() => {
    setContextProjectKey(projectKey);
  }, [projectKey, setContextProjectKey]);

  useEffect(() => {
    if (showExportModal && sequencer) setBounceBpm(sequencer.getBpm());
  }, [showExportModal, sequencer]);

  useEffect(() => {
    if (!sequencer) return;
    if (bSnapshotRef.current) {
      const snap = bSnapshotRef.current;
      sequencer.setPattern("main", snap.pattern);
      sequencer.setBpm(snap.bpm);
      bSnapshotRef.current = null;
    }
  }, [activeState]);

  const handlePanic = useCallback(() => {
    engine?.stopAll();
    sequencer?.stop();
    setIsPanic(true);
    showNotification("error", "AUDIO ENGINE RESET (PANIC)");
    setTimeout(() => setIsPanic(false), 1000);
  }, [engine, sequencer, showNotification]);

  useEffect(() => {
    const TAB_HOTKEYS: Record<string, string> = {
      "1": "sampler", "2": "drums", "3": "hats", "4": "pianoroll",
      "5": "chords", "6": "mixer", "7": "vinyl", "8": "library", "9": "settings",
    };
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (ctrl) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
        if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); handleRedo(); return; }
        if (e.key === "s") { e.preventDefault(); handleProjectSave(showNotification); return; }
        if (e.key === "e") { e.preventDefault(); openExportModal(); return; }
        return;
      }
      if (isInput) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (sequencer) {
          if (sequencer.getState().isPlaying) sequencer.stop();
          else {
            if (audioContext?.state === "suspended") audioContext.resume();
            sequencer.play();
          }
        }
        return;
      }
      const tab = TAB_HOTKEYS[e.key];
      if (tab) { e.preventDefault(); setActiveTab(tab); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo, handleProjectSave, openExportModal, sequencer, audioContext, showNotification]);

  const handlePlaySection = useCallback((section: any) => { sequencer?.stop(); sequencer?.play(); }, [sequencer]);
  const handlePlaySong = useCallback((song: any) => { if (sequencer && song.sections.length > 0) { sequencer.stop(); sequencer.play(); } }, [sequencer]);

  const handleNewProject = useCallback(() => {
    if (!window.confirm("Create a new project? Any unsaved changes will be lost.")) return;
    sequencer?.stop();
    engine?.stopAll();
    pushSnapshot({ key: "Cm", abState: "A" });
    setActiveTab("sampler");
    showNotification("success", "NEW PROJECT");
  }, [sequencer, engine, pushSnapshot, showNotification]);

  const handleCopyAToB = useCallback(() => {
    if (sequencer) {
      bSnapshotRef.current = { pattern: sequencer.getPattern() ?? [], bpm: sequencer.getBpm() };
    }
    pushSnapshot({ ...{ key: projectKey, abState: "B" }, abState: "B" });
    showNotification("success", "A → B COPIED");
  }, [sequencer, projectKey, bSnapshotRef, pushSnapshot, showNotification]);

  const instrumentTabs = ["sampler", "pianoroll", "drums", "hats", "chords", "session"];
  const showSidebar = workspaceMode === "ideas" && activeTab !== "settings";

  return (
    <ErrorBoundary
      componentName="App"
      onError={(error, errorInfo) => {
        logger.critical("App crashed", error, { componentStack: errorInfo.componentStack, activeTab, audioError, isPanic });
      }}
    >
      <div className={`h-full flex flex-col bg-bg-main font-sans text-text-main overflow-hidden transition-all duration-300 ${isPanic ? "opacity-60 grayscale" : ""}`}>
        {audioError && (
          <div className="bg-red-950/90 border-b border-red-700/60 px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-300 uppercase tracking-wider">Audio Engine Error: {audioError}</span>
            </div>
            <button onClick={() => resumeAudio()} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold uppercase rounded transition-colors">Resume Audio</button>
          </div>
        )}

        <HeaderBar
          projectKey={projectKey} activeState={activeState} workspaceMode={workspaceMode}
          cpuPct={cpuPct} ramStr={ramStr} isAutoSaving={isAutoSaving} lastSavedAt={lastSavedAt}
          activeTab={activeTab} undoStack={undoStack} redoStack={redoStack}
          bSnapshotRef={bSnapshotRef} analyserNode={analyserNode}
          onSetProjectKey={setProjectKey} onSetActiveState={setActiveState}
          onSetWorkspaceMode={setWorkspaceMode} onSetActiveTab={setActiveTab}
          onUndo={handleUndo} onRedo={handleRedo}
          onPanic={handlePanic} onExport={openExportModal}
          onNewProject={handleNewProject} onSave={() => handleProjectSave(showNotification)}
          onCopyAToB={handleCopyAToB}
        />

        <div className="flex-1 flex overflow-hidden min-h-0">
          {showSidebar && (
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onSave={() => handleProjectSave(showNotification)} onOpen={(file: File) => handleProjectOpen(file, showNotification)} />
          )}
          <Suspense fallback={<TabSpinner />}>
            {workspaceMode === "arranger" ? (
              <SongEditor
                patterns={patterns} songs={songs}
                onSaveSong={handleSaveSong} onDeleteSong={handleDeleteSong}
                onPlaySection={handlePlaySection} onPlaySong={handlePlaySong}
                onStop={() => sequencer?.stop()} onExport={openExportModal}
                isPlaying={sequencer?.getState()?.isPlaying ?? false}
              />
            ) : (
              <TabContent
                activeTab={activeTab} analyserNode={analyserNode}
                externalBufferA={externalBufferA} externalBufferB={externalBufferB}
                externalNameA={externalNameA} externalNameB={externalNameB}
                songs={songs} snapshots={macroSnapshots} macroValues={macroValues}
                sequencer={sequencer}
                onSetActiveTab={setActiveTab}
                onLoadDeckA={handleLoadDeckA} onLoadDeckB={handleLoadDeckB}
                onMacroChange={handleMacroChange} onSaveSnapshot={handleSaveSnapshot}
                onLoadSnapshot={handleLoadSnapshot} onMorphToSnapshot={handleMorphToSnapshot}
                onSaveSong={handleSaveSong} onDeleteSong={handleDeleteSong}
                onPlaySection={handlePlaySection} onPlaySong={handlePlaySong}
                onExport={openExportModal} showNotification={showNotification}
              />
            )}
          </Suspense>
        </div>

        <VirtualKeyboardSection />
        <StatusBar audioContext={audioContext} />
        <NotificationToast notification={notification} />

        <ExportModal
          show={showExportModal} phase={bouncePhase} progress={bounceProgress}
          results={bounceResults} error={bounceError}
          bounceBars={bounceBars} bounceBpm={bounceBpm}
          bounceBitDepth={bounceBitDepth} bounceStemMode={bounceStemMode}
          bounceFormat={bounceFormat} bounceMp3Kbps={bounceMp3Kbps}
          sendingToStudio={sendingToStudio}
          onClose={() => setShowExportModal(false)}
          onBounceBarsChange={setBounceBars} onBounceBpmChange={setBounceBpm}
          onBounceBitDepthChange={setBounceBitDepth} onBounceStemModeChange={setBounceStemMode}
          onBounceFormatChange={setBounceFormat} onBounceMp3KbpsChange={setBounceMp3Kbps}
          onBounce={() => handleBounce(engine, sequencer, pads)}
          onDownload={downloadBounce}
          onSendToStudio={() => sendToStudio48(showNotification)}
          onReset={() => { setBouncePhase("idle"); }}
        />
      </div>
      <ControllerPanel />
    </ErrorBoundary>
  );
}
