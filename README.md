<div align="center">
<img width="1200" height="475" alt="TBM Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# TBM (Tap-Beat-Machine) - Professional Web Audio Sampler & Sequencer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-✓-green)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Electron](https://img.shields.io/badge/Electron-29.0-blue)](https://www.electronjs.org/)
[![VST3](https://img.shields.io/badge/VST3-Compatible-orange)](https://www.steinberg.net/vst3/)

**A professional-grade audio sampler, sequencer, and beat production environment built with modern web technologies.**

</div>

## 🎯 Overview

TBM (Tap-Beat-Machine) is a sophisticated audio production tool that combines the power of hardware samplers with modern web technology. It features a complete 16-pad sampler, step sequencer, piano roll, effects processing, and VST3 integration capabilities.

### Key Features

- **16-Pad Sampler** with ADSR envelope control and polyphonic playback
- **Step Sequencer** with pattern recording and automation lanes
- **Piano Roll** with MIDI recording and note editing
- **Real-time Effects** (Reverb, Delay, Filter, Compression)
- **VST3 Plugin Support** via Electron integration
- **Stem Separation** powered by AI audio processing
- **Professional Mixing Console** with sidechain compression
- **Modulation Matrix** for advanced sound design
- **Comprehensive Testing Suite** with 23+ unit tests

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- **For Stem Separation**: Python 3.8+ and demucs package (optional)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd TBM---Tap-Beat-Machine-main

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Desktop App (Electron)

```bash
# Install Electron dependencies
npm install --save-dev electron concurrently cross-env

# Run as desktop app
npm run dev:desktop

# Build desktop executable
npm run build:desktop
```

### Stem Separation Setup (Optional)

TBM includes AI-powered stem separation using Facebook's Demucs. To use this feature:

1. **Install Python 3.8+** from [python.org](https://www.python.org/downloads/)
2. **Install demucs package**:
   ```bash
   pip install demucs
   ```
3. **Verify installation**:
   ```bash
   python -m demucs --help
   ```
4. **Start TBM server** (included in dev mode):
   ```bash
   npm run dev
   ```

The stem separator will automatically detect if demucs is installed. You can check the health status at `http://localhost:3000/api/stems/health`.

**Note**: First-time use will download model weights (~4GB) which are cached in `~/.cache/torch/hub/checkpoints/`.

### VST Host Integration

TBM can host VST plugins in the desktop (Electron) version. The integration uses a native Node.js addon bridge:

1. **Build the native addon** (requires Node.js native build tools):
   ```bash
   npm install --save-dev node-gyp
   npm run rebuild
   ```

2. **VST scanning** is automatic on first launch in desktop mode
3. **Plugin validation** happens via the VSTManager component
4. **Audio processing** is handled through the native bridge with low latency

For detailed VST3 plugin development, see [VST3_INTEGRATION.md](VST3_INTEGRATION.md).

## 📖 User Guide

### Getting Started

1. **Load Samples**: Drag and drop audio files onto any pad
2. **Create Patterns**: Use the step sequencer to program beats
3. **Record MIDI**: Connect a MIDI controller or use the virtual keyboard
4. **Apply Effects**: Add reverb, delay, and filtering to your sounds
5. **Mix & Export**: Use the mixer to balance levels and export your track

### Core Components

#### 🥁 Drum Machine
- 16-step sequencer with pattern copy/delete
- Note repeat and automation lanes
- Swing and humanization controls
- Pattern A/B switching

#### 🎹 Piano Roll
- Multi-track MIDI recording
- Note editing with velocity control
- Quantization and grid snapping
- Track duplication and sequencing

#### 🔊 Audio Engine
- Web Audio API-based processing
- Real-time effects chain
- Sample key detection
- Poly/mono/legato playback modes

#### 🎚️ Mixer Console
- 8-channel mixer with pan controls
- RMS/LUFS metering
- Sidechain compression
- Master bus processing

### Advanced Features

#### VST3 Integration
TBM can be compiled as a VST3 plugin using the included Electron wrapper. See [VST3_INTEGRATION.md](VST3_INTEGRATION.md) for details.

#### Stem Separation
Upload a mixed track and separate it into stems (drums, bass, vocals, other) using AI processing.

#### Modulation Matrix
Create complex modulation routings between LFOs, envelopes, and audio parameters.

## 🛠️ Development

### Project Structure

```
src/
├── components/          # React components
│   ├── DrumMachine.tsx # Step sequencer
│   ├── PianoRoll.tsx   # MIDI editor
│   ├── WaveformVisualizer.tsx # Sample editor
│   └── ...
├── lib/                # Core libraries
│   ├── TBMAudioEngine.ts # Audio processing
│   ├── keyDetection.ts # Pitch detection
│   ├── logger.ts       # Production logging
│   └── ...
├── contexts/           # React contexts
│   └── TBMAudioContext.tsx # Audio state management
├── test/              # Test utilities
│   └── setup.ts       # Test environment setup
└── App.tsx            # Main application
```

### Key Implementation Details

#### Audio Engine (`TBMAudioEngine.ts`)
- Manages Web Audio API nodes and connections
- Handles sample loading and playback
- Implements ADSR envelopes and filtering
- Provides polyphonic voice management

#### State Management
- React Context for global audio state
- Local storage for project persistence
- Real-time parameter updates

#### Error Handling
- React Error Boundary for UI errors
- Structured logging system
- Graceful audio context recovery

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Tests cover:
- Audio engine functionality
- Key detection algorithms
- Component rendering
- State management

## 🚀 Production Readiness

### Current Status: 8/10

**✅ Completed:**
- Core audio engine with Web Audio API
- Complete UI with all major components
- Error handling and logging system
- Comprehensive test suite (23+ tests)
- Key detection for samples
- Build system and type checking

**🔧 In Progress:**
- State persistence and recovery
- Performance optimizations
- Additional component tests

**📋 Remaining:**
- Advanced performance monitoring
- Additional documentation examples

### Build Verification

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build verification
npm run build
```

## 🔧 Troubleshooting

### Common Issues

1. **No Audio Output**
   - Check browser permissions for microphone/audio
   - Verify Web Audio API is supported
   - Check console for error messages

2. **MIDI Not Working**
   - Ensure MIDI device is connected
   - Check browser MIDI permissions
   - Verify MIDI mapping in settings

3. **Performance Issues**
   - Reduce buffer size in settings
   - Close other audio applications
   - Use fewer simultaneous voices

### Debugging

Enable debug logging by setting `DEBUG=true` in your environment:

```bash
DEBUG=true npm run dev
```

Check the browser console for detailed logs from the audio engine.

## 📚 API Reference

### TBMAudioEngine

```typescript
// Core methods
triggerPad(padIndex: number, velocity: number): void
loadSample(padIndex: number, buffer: AudioBuffer): void
setPadADSR(padIndex: number, adsr: ADSRParams): void
setPadFilter(padIndex: number, cutoff: number, resonance: number): void

// State management
dispose(): void
getAnalyser(): AnalyserNode
```

### Context API

```typescript
const { engine, pads, audioContext, projectKey } = useTBMAudio()
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Development Guidelines

- Follow TypeScript strict mode
- Use functional React components with hooks
- Maintain 80%+ test coverage
- Document new features
- Follow existing code style

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Web Audio API team for the powerful browser audio capabilities
- React team for the component architecture
- Electron team for desktop app framework
- Steinberg for VST3 SDK

## 📞 Support

For issues and feature requests, please use the GitHub Issues page.

---

<div align="center">
<sub>Built with ❤️ by the TBM development team</sub>
</div>