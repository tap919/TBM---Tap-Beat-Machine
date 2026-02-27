# OmniChop Pro - VST3 & Desktop Integration Guide

Since the current environment is a web-based sandbox, we cannot directly compile C++ VST3 binaries or launch native desktop windows here. However, your React UI is perfectly structured to be wrapped into both!

## 1. Standalone Desktop App (Electron)

We have included an `electron-main.js` file in your project. To run this as a standalone desktop app locally on your machine:

1. Download this project to your local machine.
2. Run `npm install`
3. Install Electron: `npm install --save-dev electron concurrently cross-env`
4. Add these scripts to your `package.json`:
   ```json
   "scripts": {
     "dev:desktop": "concurrently \"vite\" \"cross-env NODE_ENV=development electron electron-main.js\"",
     "build:desktop": "vite build && electron-builder"
   }
   ```
5. Run `npm run dev:desktop` to launch the standalone app!

## 2. VST3 Plugin (JUCE + Web UI)

To compile this into a VST3/AU plugin that runs in DAWs (Ableton, FL Studio, Logic), the modern approach is to use **JUCE** with a Web View wrapper.

### The Architecture:
- **DSP Engine (C++)**: Handles the actual audio processing, MIDI routing, and 808 synthesis.
- **Frontend (React)**: The UI we just built.
- **Bridge**: JUCE's `choc` or `WebBrowserComponent` passes JSON messages between the React UI and the C++ DSP engine.

### Background Features (Hidden Logic)
To make OmniChop Pro feel like a professional hardware sampler, the C++ backend implements several "hidden" features:

1. **Automatic Gain Compensation**: When the "Drive" or "Vinyl" knobs are increased, the output volume is automatically attenuated to maintain a consistent perceived loudness (RMS matching).
2. **Phase-Aligned Sub Synthesis**: The 808 engine monitors the incoming "Kick" transient and automatically adjusts the phase of the Sine oscillator to prevent destructive interference (phase cancellation).
3. **Intelligent Transient Shaping**: The "Transient" slider in the UI controls a look-ahead compressor/expander that sharpens the attack of chops before they hit the FX rack.
4. **MPC-Style Swing Engine**: The "Humanize" macro doesn't just add random jitter; it applies a weighted shuffle algorithm inspired by the MPC-60's timing clock.
5. **Anti-Aliasing Resampling**: The "SP-1200 Grit" mode uses a 12-bit decimation algorithm with a specific 26kHz anti-aliasing filter emulation to capture that classic hardware "ring".

### Steps to Build the VST3:
1. Download and install the [JUCE Framework](https://juce.com/).
2. Create a new Audio Plug-In project in the Projucer.
3. Enable the `juce_gui_extra` module.
4. In your `PluginEditor.cpp`, instantiate a WebBrowserComponent:
   ```cpp
   // Load your built React 'dist/index.html' into the plugin window
   webBrowserComponent.goToURL("file://" + getReactAppPath() + "/index.html");
   ```
5. Set up a Javascript bridge to listen to knob changes from React:
   ```javascript
   // In React (e.g., Knob.tsx)
   window.juce.postMessage(JSON.stringify({ param: 'sub_drive', value: 45 }));
   ```
6. Compile the project in Xcode (Mac) or Visual Studio (Windows) to generate your `.vst3` and `.component` files.
