# Changelog

All notable changes to TBM (Tap Beat Machine) are documented here.

## [Unreleased]

### Fixed (Critical / High — Session 1)
- **stopAll() listener leak** — `activeSources` changed from `Set` to `Map<source, cleanup>` using typed `removeEventListener` to prevent accumulating stale ended-event listeners.
- **loadSampleFromFile() unbounded memory** — Added 50 MB file-size guard before reading into memory.
- **setBpm() NaN vulnerability** — Added `Number.isFinite` guard; non-finite input is rejected.
- **BounceEngine.render() BPM zero/NaN guard** — Prevents division-by-zero when rendering to audio.
- **Orphaned rAF callbacks** — `pendingRafId` is now tracked and cancelled in `stop()`.
- **midiHandler.ts hardcoded pad count** — Replaced hardcoded `64` with `TOTAL_PADS` constant and added lower-bound `idx >= 0` check.
- **MidiContext.tsx velocity division** — Velocity now divides by 127 (MIDI max) not 128.
- **ErrorBoundary reset retry limit** — Capped at 3 retries within a 10-second window to prevent infinite reset loops.
- **ErrorBoundary unhandled rejections** — Added `unhandledrejection` window listener so async errors are caught by the boundary.
- **statePersistence.loadState() validation** — Added runtime structural validation and BPM/swing sanitization.
- **statePersistence.migrateState() sanitization** — Added numeric sanitization for migrated BPM/swing values.

### Fixed (Medium — Session 2)
- **package.json lint script** — `"lint"` now runs `tsc --noEmit && eslint src --ext .ts,.tsx --max-warnings 0` instead of TypeScript alone.
- **index.html CSP** — Added `Content-Security-Policy` meta tag covering `default-src`, `script-src`, `style-src`, `connect-src`, `media-src`, `worker-src`, and `img-src`.
- **Silent .catch(() => {}) in App.tsx** — `audioContext.resume()` failure on spacebar now logs a warning via the structured logger.
- **Silent .catch(() => {}) in FXMacros.tsx** — `unloadPluginNative` and `setPluginParamNative` failures now log warnings via the structured logger.
- **`(window as any).webkitAudioContext`** — Replaced unsafe cast with a typed `declare global { interface Window { webkitAudioContext?: typeof AudioContext } }` augmentation.
- **Raw console.* calls in TBMAudioEngine.ts** — All 11 `console.error`/`console.warn` calls replaced with the structured `logger`.
- **Raw console.* calls in TBMAudioContext.tsx** — All 9 `console.error`/`console.warn` calls replaced with the structured `logger`.

### Fixed (Low — Session 2)
- **ADSR sliders missing a11y attributes** (`WaveformVisualizer.tsx`) — Added `aria-label`, `min`, `max`, `step`, and radix-10 `parseInt`.
- **Swing slider missing a11y attributes** (`DrumMachine.tsx`) — Added `aria-label` and `step={1}`.
- **EQ sliders missing `aria-label`** (`Mixer808.tsx`) — Added `aria-label` to Freq, Gain, and Q sliders.
- **Volume fader missing a11y attributes** (`MiniMixer.tsx`) — Added `aria-label` and `step={1}`.
- **Mod-amount slider missing a11y attributes** (`ModMatrix.tsx`) — Added `aria-label`, `step={1}`, and radix-10 `parseInt`.
- **Unused `request<T>()` in api.ts** — Marked `@deprecated`; all callers already use the safer `validatedRequest()`.
- **Missing LICENSE** — Added Apache 2.0 `LICENSE` file (matching existing `SPDX-License-Identifier: Apache-2.0` header in `App.tsx`).
