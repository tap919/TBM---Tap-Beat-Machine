<div align="center">
<img width="1200" height="475" alt="TBM Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# TBM (Tap-Beat-Machine) — Web Audio Sampler & Sequencer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-blue)](https://reactjs.org/)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-✓-green)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-134%20passing-brightgreen)]()

**A browser-based audio sampler, step sequencer, and beat production environment.**

</div>

## Overview

TBM is a web-based music production tool featuring a 16-pad sampler, step sequencer, piano roll, mixer, and effects processing — all running in the browser via the Web Audio API. An optional Electron shell provides desktop integration with additional features like VST3 hosting.

### Key Features

- **16-Pad Sampler** with ADSR envelope control and polyphonic playback
- **Step Sequencer** with pattern recording, automation lanes, and A/B switching
- **Piano Roll** with MIDI recording and note editing
- **Real-time Effects** (Reverb, Delay, Filter, Compression, Sidechain)
- **DJ Mode** with dual decks, crossfader, scratch, and vinyl simulation
- **Modulation Matrix** for LFO/envelope routing
- **Song Editor** for chaining patterns into arrangements
- **AI-assisted Analysis** via configurable LLM backends
- **Stem Separation** offline using Demucs (optional Python backend)
- **Macro Controls** with snapshot morphing
- **Export** to WAV/MP3 with configurable bit depth and stem isolation

## Quick Start

### Prerequisites
- Node.js 18+

### Installation

```bash
git clone <repository-url>
cd TBM---Tap-Beat-Machine-main
npm install
npm run dev       # Start dev server at http://localhost:3000
```

### Other Commands

```bash
npm test                      # Run unit tests (134 tests, 10 test files)
npm run test:server           # Run backend integration tests
npm run test:coverage         # Generate coverage report
npm run lint                  # TypeScript typecheck + ESLint
npm run build                 # Production build to dist/
npm run server                # Start backend server only
```

### Advanced / Experimental Features

#### Desktop App (Electron)

```bash
npm run build && npm run electron
npm run electron:build        # Package as desktop executable
```

#### VST3 Hosting (Desktop Only)

TBM can host VST3 plugins via a native Node addon bridge in the Electron build:

```bash
npm install --save-dev node-gyp
npm run build:native
```

#### Stem Separation (Requires Python + Demucs)

For AI-powered stem separation:

```bash
pip install demucs
```

The server auto-detects Demucs on startup. Check status at `http://localhost:3000/api/stems/health`.

## Project Structure

```
src/
├── components/          React UI components
│   ├── DrumMachine.tsx  Step sequencer
│   ├── PianoRoll.tsx    MIDI editor
│   ├── WaveformVisualizer.tsx
│   ├── SongEditor.tsx   Arrangement builder
│   ├── ConsoleMixer.tsx Mixer with metering
│   └── ... (~40+ component files)
├── engine/              Audio runtime layer
│   ├── TBMAudioEngine.ts  Core sampler/effects engine
│   ├── trackRouter.ts     Mixer channel routing
│   ├── midiHandler.ts     Global MIDI I/O
│   └── midiMapping.ts     MIDI → pad mapping
├── hooks/               Custom React hooks
│   ├── useSongManager.ts    Song/section state
│   ├── useAutoSave.ts       Periodic auto-save
│   ├── useBounceEngine.ts   Audio export
│   ├── useFileOperations.ts Project save/load
│   ├── useProjectUndoRedo.ts
│   └── ... (~15+ hooks)
├── contexts/            React context providers
│   └── TBMAudioContext.tsx  Audio engine lifecycle
├── lib/                 Shared utilities
│   ├── audio/              Sub-modules (sequencer, synth, FX, DJ, etc.)
│   ├── statePersistence.ts Project serialization
│   ├── logger.ts           Structured logging
│   ├── api.ts              Server API client
│   └── constants.ts        App-wide constants
├── types/               TypeScript declarations
└── main.tsx             App entry point
```

## Testing

```bash
# Run all client tests
npm test

# Run server tests
npm run test:server

# Coverage report
npm run test:coverage
```

Test coverage includes:
- Audio engine sample export/restore, routing, resource cleanup (TBMAudioEngine)
- ModMatrix correct clamping of NaN/Infinity values
- Pad serialization round-trip (all fields preserved)
- TrackRouter slot assignment, release, and node lifecycle
- Sequencer pattern and transport behavior
- Key detection algorithms
- LocalStorage quota and error recovery
- Server routes for export, stems, health
- DrumMachine rendering and interaction

## Build Verification

```bash
npm run lint    # TypeScript check + ESLint (zero errors)
npm test        # All client tests pass
npm run build   # Vite production build
```

## Current Status

**Completed:**
- Core audio engine with Web Audio API
- 16-pad sampler with ADSR, filtering, polyphony
- Step sequencer with automation, swing, humanize
- Piano roll with MIDI recording
- Song editor for sectional arrangement
- Mixer with EQ, sidechain, metering
- DJ mode with dual decks and effects
- Project save/load with file export (.tbm format)
- Macro controls with snapshot morphing
- AI-backed music theory analysis
- Lint/typecheck/test CI pipeline

**Experimental:**
- VST3 hosting (Electron only)
- Stem separation (requires Python backend)
- ASIO/WASAPI native audio output
- Turntable scratch emulation
- Band synthesis engine

## Troubleshooting

| Issue | Check |
|-------|-------|
| No audio output | Browser audio permissions, Web Audio API support, console errors |
| MIDI not working | Device permissions, MIDI mapping settings |
| Audio glitches | Reduce buffer size, close other apps, reduce voice count |
| Stem separation fails | Python 3.8+, Demucs installed, internet access for model download |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `npm run lint` (zero errors) and `npm test` (all green)
6. Submit a pull request

## License

MIT License — see LICENSE file for details.
