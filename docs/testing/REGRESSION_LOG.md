# TBM Tap Beat Machine — Regression Log

Each entry: `DATE | FIX-ID | AREA | BUG | TEST | STATUS`

| Date | Fix ID | Area | Bug | Test | Status |
|------|--------|------|-----|------|--------|
| 2026-06-12 | C1 | Engine reinit | All loaded samples lost after reinitializeEngine() | `TBMAudioEngine.test.ts` — exportSampleBuffers + restoreSampleBuffers cycle | ✅ |
| 2026-06-12 | C2 | Macro controls | Uncancellable rAF morph loop, no cleanup on unmount | `tbm-integration.test.ts` — macro handleMorphToSnapshot cleanup | ✅ |
| 2026-06-12 | C3 | Drum machine | Unbounded setTimeout creation in note-repeat, orphaned on unmount | `DrumMachine.ts` — schedulePadFlash timer registry | ✅ |
| 2026-06-12 | H1 | Song playback | handlePlaySong ignored song BPM/swing/sections, only called stop+play | `tbm-integration.test.ts` — song BPM/swing/pattern verification | ✅ |
| 2026-06-12 | H2 | Stem API | Client posted wrong field name "file" → "audio", wrong URL `/stems` → `/stems/separate` | `api.test.ts` — field name + URL verification | ✅ |
| 2026-06-12 | H3 | Vinyl sim | Dead audio graph: noiseGain, rumbleHP, rumbleGain never connected to output | `vinylSimulator.ts` — wired noiseGain + rumble chain to output | ✅ |
| 2026-06-12 | H4 | Bus FX | setSendLevel creates orphaned GainNodes on every call, never disposed | `busFxRack.test.ts` — send gain tracking + disconnect verification | ✅ |
| 2026-06-12 | H5 | Drum machine | sequencer.setOnStep callback closes over stale `engine` value | `DrumMachine.ts` — local engineRef with useEffect sync | ✅ |
| 2026-06-12 | H6 | State persistence | timeStretch, pitchShift, chokeGroup, swing, start, end, loop, reverse not saved | `statePersistence.test.ts` — extended field round-trip + legacy defaults | ✅ |
| 2026-06-12 | H7 | Track router | connectAudio() creates new nodes without disconnecting old ones | `trackRouter.test.ts` — disconnect verification on reconnect | ✅ |
| 2026-06-12 | H12/H13 | File ops | SSRF via unsanitized dataUri fetch in useFileOperations + useAutoSave | `useFileOperations.ts` — data: scheme guard | ✅ |
| 2026-06-12 | H14 | Server errors | Internal errors leaked provider name + upstream message to client | `analyze.ts` — generic error response | ✅ |
| 2026-06-12 | M2 | Mod matrix | NaN/Infinity written directly to AudioParam with no clamping | `modMatrix.test.ts` — NaN/Infinity/-Infinity clamping tests | ✅ |
| 2026-06-12 | M3 | Sequencer swing | Swing off-by-one: delayed even steps instead of odd steps | `sequencer.test.ts` — swing timing verification | ✅ |
| 2026-06-12 | M4 | Track router | releaseBySource ignores source param, always releases first occupied slot | `trackRouter.test.ts` — source-matched release verification | ✅ |
| 2026-06-12 | M5 | MIDI | MIDI permanently dead after engine reinit — dispose called without re-initialize | `TBMAudioContext.tsx` — initializeGlobalMidiHandler in reinit | ✅ |
| 2026-06-12 | Spacebar race | Audio context | audioContext.resume() not awaited before sequencer.play() | `App.tsx` — await resume before play | ✅ |
| 2026-06-12 | Panic timer | App shell | setTimeout(() => setIsPanic(false), 1000) never tracked or cleaned up | `App.tsx` — panicTimerRef + unmount cleanup | ✅ |
| 2026-06-12 | ADSR stub | Engine | updatePadADSR only debug-logged, never stored or applied | `TBMAudioEngine.ts` — padAdsrValues store + triggerPad voice gain | ✅ |
| 2026-06-12 | setPadStartOffset | Engine | Method accepted args, stored nothing | `TBMAudioEngine.ts` — padStartOffsets Map + triggerPad consume | ✅ |
