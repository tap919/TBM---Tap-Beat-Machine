# TBM User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Working with Samples](#working-with-samples)
4. [Creating Patterns](#creating-patterns)
5. [Recording MIDI](#recording-midi)
6. [Using Effects](#using-effects)
7. [Mixing and Exporting](#mixing-and-exporting)
8. [Advanced Features](#advanced-features)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Troubleshooting](#troubleshooting)

## Getting Started

### First Launch
1. Open TBM in your browser or as a desktop app
2. Allow microphone/MIDI permissions if prompted
3. The interface loads with default drum samples pre-loaded

### Loading Your First Project
1. Click "File" → "New Project" to start fresh
2. Or use one of the built-in template projects

## Interface Overview

### Main Sections

#### 1. **Pad Grid (Top-Left)**
- 16 sample pads arranged in 4x4 grid
- Click to trigger samples
- Drag and drop audio files to load samples
- Right-click for pad settings (ADSR, filter, etc.)

#### 2. **Step Sequencer (Top-Right)**
- 16-step pattern editor
- Click steps to activate/deactivate
- Select different patterns (A/B)
- Adjust swing and humanization

#### 3. **Piano Roll (Center)**
- MIDI note editor
- Draw notes with mouse
- Adjust velocity and duration
- Multiple track support

#### 4. **Mixer Console (Bottom)**
- 8-channel mixer
- Volume faders and pan knobs
- Metering (RMS/LUFS)
- Master bus controls

#### 5. **Effects Rack (Right Side)**
- Real-time effects processors
- Reverb, delay, filter, compression
- Macro controls for quick adjustments

### Navigation
- Use tabs to switch between different views
- Drag to resize panels
- Use mouse wheel to zoom in piano roll
- Right-click context menus available throughout

## Working with Samples

### Loading Samples
1. **Drag & Drop**: Drag audio files (.wav, .mp3, .aiff) onto any pad
2. **File Browser**: Click the folder icon on a pad to browse files
3. **Built-in Library**: Use the sample browser for included sounds

### Sample Editing
Each pad has these controls:

#### Basic Controls
- **Volume**: Adjust sample playback level
- **Pan**: Stereo position (-1 left to +1 right)
- **Pitch**: Transpose up/down in semitones
- **Reverse**: Play sample backwards

#### ADSR Envelope
- **Attack**: How quickly the sound reaches full volume
- **Decay**: How quickly it falls to sustain level
- **Sustain**: The held volume level
- **Release**: How quickly it fades after release

#### Filter
- **Cutoff**: Frequency where filter starts working
- **Resonance**: Emphasis at cutoff frequency
- **Type**: Low-pass, high-pass, band-pass

### Sample Management
- **Copy/Paste**: Right-click pad → Copy Settings/Paste Settings
- **Clear**: Right-click pad → Clear Sample
- **Save**: Right-click pad → Save Sample As...

## Creating Patterns

### Step Sequencer Basics
1. Select a pad (1-16) to edit its pattern
2. Click steps (1-16) to activate/deactivate
3. Adjust velocity per step by dragging vertically

### Pattern Operations
- **Copy**: Click copy button to duplicate current pattern
- **Paste**: Click paste to apply copied pattern
- **Clear**: Click trash button to clear all steps
- **Save**: Save pattern to library for reuse

### Advanced Sequencing

#### Automation Lanes
1. Select parameter (volume, pan, filter)
2. Draw automation curve in the lane
3. Automation applies in real-time during playback

#### Note Repeat
1. Hold a pad while note repeat is enabled
2. Pad triggers at selected subdivision rate
3. Great for hi-hat rolls and percussion fills

#### Swing and Humanization
- **Swing**: Shift even-numbered steps slightly late
- **Humanization**: Add random timing/velocity variations
- **Groove**: Apply pre-defined timing templates

## Recording MIDI

### Setting Up MIDI
1. Connect MIDI controller via USB
2. TBM should auto-detect the device
3. If not, check Settings → MIDI Devices

### Recording Process
1. Arm recording on piano roll track
2. Set count-in if desired (1-4 bars)
3. Click record or press shortcut
4. Play notes on your MIDI controller
5. Click stop when finished

### Editing MIDI
- **Select**: Click notes to select
- **Move**: Drag notes horizontally/vertically
- **Resize**: Drag edges to change duration
- **Delete**: Select and press Delete key
- **Quantize**: Align notes to grid (50-100% strength)

### Piano Roll Features
- **Multiple Tracks**: Add up to 8 simultaneous tracks
- **Different Instruments**: Assign different sounds per track
- **Step Input**: Click notes directly on the grid
- **Velocity Editing**: Adjust note strength per note

## Using Effects

### Available Effects

#### Reverb
- **Size**: Room size (small room to large hall)
- **Decay**: Reverb tail length
- **Mix**: Dry/wet balance
- **Pre-delay**: Time before reverb starts

#### Delay
- **Time**: Delay interval in milliseconds
- **Feedback**: Number of repeats
- **Mix**: Dry/wet balance
- **Sync**: Sync to BPM (1/4, 1/8, 1/16 notes)

#### Filter
- **Type**: Low-pass, high-pass, band-pass, notch
- **Cutoff**: Filter frequency
- **Resonance**: Emphasis at cutoff
- **Drive**: Add saturation before filter

#### Compression
- **Threshold**: Level where compression starts
- **Ratio**: Amount of compression (2:1 to ∞:1)
- **Attack**: How quickly compression engages
- **Release**: How quickly it disengages

### Effect Routing
- **Insert Effects**: Applied to individual pads/channels
- **Send Effects**: Shared across multiple channels via aux sends
- **Master Effects**: Applied to final output

### Macro Controls
- **Macro 1-4**: Assign multiple parameters to single knob
- **Save Presets**: Save effect settings as presets
- **A/B Compare**: Toggle between two settings

## Mixing and Exporting

### Mixer Console

#### Channel Strips
Each channel has:
- **Fader**: Volume control (-∞ to +12dB)
- **Pan**: Stereo position
- **Mute/Solo**: Isolate channels
- **Meter**: Visual level indicator

#### Master Section
- **Master Fader**: Overall output level
- **Limiter**: Prevent clipping on export
- **Spectrum Analyzer**: Frequency display
- **LUFS Metering**: Loudness measurement

### Sidechain Compression
1. Enable sidechain on a channel
2. Select source (usually kick drum)
3. Adjust amount and timing
4. Creates "pumping" effect common in electronic music

### Exporting Projects

#### Audio Export
1. Click "File" → "Export Audio"
2. Select format (WAV, MP3, AIFF)
3. Choose quality settings
4. Select time range (pattern, section, entire project)
5. Click export and choose save location

#### Project Files
- Save complete project as .tbm file
- Includes all samples, patterns, settings
- Can be shared with other TBM users

#### Stems Export
- Export each channel as separate file
- Useful for further mixing in DAW
- Maintains all effects and processing

## Advanced Features

### Modulation Matrix
Create dynamic sound changes by routing modulation sources to parameters:

#### Sources
- **LFO 1/2**: Low-frequency oscillators
- **Envelope 1/2**: ADSR envelopes
- **Velocity**: Note playing strength
- **Aftertouch**: MIDI pressure
- **Mod Wheel**: MIDI controller

#### Destinations
- **Pitch**: Sample playback speed
- **Filter Cutoff**: Filter frequency
- **Volume**: Amplitude
- **Pan**: Stereo position
- **Effect Parameters**: Any effect knob

### Stem Separation
1. Upload a mixed audio file
2. AI separates into stems:
   - Drums
   - Bass
   - Vocals
   - Other instruments
3. Load stems directly into pads
4. Remix or extract samples

### VST3 Integration
**Desktop App Only**
1. Scan for VST3 plugins
2. Load plugins into effect slots
3. Use native plugin interfaces
4. Save CPU by using efficient native code

### Template System
- Save complete setups as templates
- Includes samples, patterns, effects
- Quick start for different genres
- Share templates with community

## Keyboard Shortcuts

### Global Shortcuts
- **Space**: Play/Stop transport
- **Enter**: Record
- **Tab**: Next view
- **Shift+Tab**: Previous view
- **Ctrl+S**: Save project
- **Ctrl+O**: Open project
- **Ctrl+Z**: Undo
- **Ctrl+Shift+Z**: Redo

### Piano Roll
- **P**: Pencil tool
- **E**: Eraser tool
- **S**: Select tool
- **Q**: Quantize selection
- **Ctrl+A**: Select all notes
- **Delete**: Delete selection

### Step Sequencer
- **1-9**: Select pattern 1-9
- **Ctrl+C**: Copy pattern
- **Ctrl+V**: Paste pattern
- **Ctrl+X**: Cut pattern

### Pad Grid
- **Q,W,E,R**: Top row pads
- **A,S,D,F**: Second row pads
- **Z,X,C,V**: Third row pads
- **1,2,3,4**: Bottom row pads (numpad)

## Troubleshooting

### Common Issues

#### No Sound
1. Check volume faders are up
2. Verify audio output device in settings
3. Check browser/OS audio permissions
4. Ensure samples are loaded

#### MIDI Not Working
1. Check MIDI device is connected
2. Verify MIDI channel mapping
3. Check browser MIDI permissions
4. Try different USB port

#### Performance Issues
1. Reduce buffer size in settings
2. Close other audio applications
3. Use fewer simultaneous voices
4. Disable CPU-intensive effects

#### Crashes or Freezes
1. Save project frequently
2. Check console for error messages
3. Reduce project complexity
4. Update to latest version

### Getting Help
1. Check console for error messages
2. Consult this user guide
3. Visit online documentation
4. Contact support with error details

### Best Practices
1. **Save Often**: Use Ctrl+S frequently
2. **Backup Projects**: Keep copies of important work
3. **Organize Samples**: Use folders and naming conventions
4. **CPU Management**: Freeze tracks when not editing
5. **Version Control**: Save incremental versions

---

## Quick Reference Card

### Workflow Tips
1. **Start with drums** - Build rhythm foundation first
2. **Add bass** - Establish harmonic foundation
3. **Layer melodies** - Add chords and leads
4. **Arrange** - Create song structure
5. **Mix** - Balance levels and panning
6. **Effects** - Add space and character
7. **Master** - Final polish and loudness

### Recommended Settings
- **Buffer Size**: 256 samples for recording, 512 for mixing
- **Sample Rate**: 44.1kHz for compatibility, 48kHz for quality
- **Quantize Strength**: 75% for natural feel
- **Default Swing**: 55-60% for hip-hop/electronic

### Creative Techniques
- **Sample Chopping**: Load long samples and trigger different sections
- **Resampling**: Process sounds, then re-sample for new textures
- **Automation**: Animate parameters over time for movement
- **Layering**: Combine multiple samples for richer sounds
- **Reverse Reverb**: Create rising effects before drops

---

*For more detailed technical information, see the [Developer Documentation](../README.md)*