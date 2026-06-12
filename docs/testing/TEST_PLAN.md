# TBM Tap Beat Machine — Test Plan

## Test Strategy

TBM is a browser-based audio workstation. Testing is layered:

| Layer | Tool | Scope | Owner |
|-------|------|-------|-------|
| **Unit** | vitest | Pure functions, helpers, mappers, serializers, audio math | Engine team |
| **Integration** | vitest + RTL | Module interactions: hooks→context→engine, state flow across components | Integration team |
| **E2E** | Playwright | Full user journeys: mount→compose→play→save→export→reload | QA team |
| **Server** | vitest + supertest | API routes, validation, error handling, Demucs interaction | Backend team |
| **Performance** | vitest + Playwright | Startup time, playback latency, export duration, memory | Performance team |
| **Security** | vitest + manual | Input validation, path traversal, SSRF, oversized payloads | Security team |
| **Accessibility** | Playwright + manual | Keyboard nav, ARIA labels, focus management, screen reader | QA team |

## Test File Layout

```
tests/unit/              Pure logic: midiMapping, constants, serializers
tests/integration/       Module interaction: DrumMachine→engine, save→load
tests/e2e/               Playwright: full user journeys
tests/performance/       Baseline perf: startup, playback, export
tests/security/          Input validation, SSRF, path traversal
tests/accessibility/     Keyboard, ARIA, focus, screen reader
```

Currently tests live alongside source (`src/**/*.test.ts`) for close proximity. This is acceptable for the 25% phase.

## 25% Phase — Architecture Validation

### Unit (src/lib/, src/engine/)
- [x] midiMapping: pad/note mapping, duplicate resolution, remap persistence
- [x] statePersistence: serialize, deserialize, migration, corruption recovery
- [x] logger: format, level gating, redaction
- [x] api.test.ts: URL construction, field names, error handling
- [x] sequencer: pattern management, play/stop, swing, selectPattern
- [x] modMatrix: register, evaluate, clamping
- [x] busFxRack: lifecycle, send gain tracking
- [x] trackRouter: assign, release, connectAudio disposal
- [x] useSongManager: CRUD operations

### Integration (src/engine/tbm-integration.test.ts)
- [x] Audio engine boot (TBMAudioContext lifecycle)
- [x] Playback path: pad trigger → engine routing
- [x] Save/load round-trip: serialize → deserialize → field equality
- [x] API handshake: stem separation POST field/URL correctness

### E2E (e2e/)
- [x] App boots (sidebar, header, status bar render)
- [x] Primary editors load (Drums, Mixer tabs)
- [x] Transport: play/stop toggles
- [x] Workspace mode: Ideas ↔ Arranger switching
- [x] Panic button interactive
- [x] No critical console errors

### Static Verification
- [x] Typecheck passes (tsc --noEmit)
- [x] Lint passes (eslint, 0 errors)
- [x] Dependency scan: 0 vulnerabilities
- [x] Build passes (vite build)

## 50% Phase — Workflow Confidence

### Unit Coverage Expansion
- [ ] TBMAudioEngine: scheduling helpers, state transitions, edge cases
- [ ] trackRouter: all slot operations, edge cases
- [ ] midiHandler: input normalization, device connect/disconnect
- [ ] useAutoSave: timing, dirty detection, failure
- [ ] useBounceEngine: render, cancel, retry
- [ ] useFileOperations: save/load/import/export error paths
- [ ] statePersistence: version migrations

### Integration Expansion
- [ ] DrumMachine → engine playback flow
- [ ] PianoRoll → note timeline → render
- [ ] SongEditor → section arrangement → playback order
- [ ] ConsoleMixer → trackRouter channel updates
- [ ] useAutoSave → persistence write timing
- [ ] useBounceEngine → export artifact
- [ ] api.ts → stem endpoints (timeout, unavailable)

### E2E Expansion
- [ ] Full composition: create beat, arrange, mix, save, reload
- [ ] MIDI: connect device, trigger pads, disconnect, recover
- [ ] Export: bounce audio, success/failure messaging
- [ ] File: import project, edit, save as, reopen
- [ ] Recovery: reload after interrupted autosave

### Regression
- [ ] Every resolved bug gets a regression test
- [ ] Regression log maintained in REGRESSION_LOG.md

### Security
- [ ] Invalid file import: malformed .tbm, oversized, wrong type
- [ ] Unsafe path/file names in stem upload
- [ ] Oversized uploads to stem separation
- [ ] Server-side input validation (all routes)
- [ ] Sensitive data leakage in logs/errors

### Performance Baselines
- [ ] Startup time < 3s cold, < 1s warm
- [ ] Pattern playback latency < 50ms trigger-to-sound
- [ ] Export latency: 2min project < 30s
- [ ] Memory: 1hr editing < 500MB

### Accessibility Smoke
- [ ] Keyboard navigation: step sequencer, piano roll, mixer
- [ ] ARIA labels on all interactive controls
- [ ] Focus order: logical tab sequence
- [ ] Screen reader: basic readback of pad state

## 100% Phase — Release Readiness

### Full Automated Coverage
- [ ] First-run startup → sample load → play
- [ ] Piano roll: multi-track note editing
- [ ] Song: full arrangement with sections
- [ ] Mixer: all channels, sends, FX
- [ ] Save/reload/reopen (all project shapes)
- [ ] Export/bounce (all formats)
- [ ] Stem separation: request → progress → completion
- [ ] MIDI: full input workflow

### Failure & Recovery
- [ ] Audio engine init failure
- [ ] Suspended AudioContext resume
- [ ] Corrupt project file recovery
- [ ] Partial autosave recovery
- [ ] Export cancellation mid-process
- [ ] Demucs unavailable/restore
- [ ] Long-running separation timeout
- [ ] Resource cleanup after failure

### Nonfunctional
- [ ] 1hr soak: looping playback + editing
- [ ] CPU stable < 20% during playback
- [ ] Security review: import/export boundaries
- [ ] Browser support: Chrome, Firefox, Edge, Safari
- [ ] OS support: Windows, macOS, Linux

### Operational
- [ ] Export/stem job monitoring
- [ ] Structured logging with redaction
- [ ] Known limitations documented
- [ ] Zero open criticals, zero data-loss defects
