/**
 * audio-backend.cpp — N-API native addon for low-latency audio output via
 * RtAudio 6.x.  Supports ASIO, WASAPI, DirectSound (Windows), CoreAudio
 * (macOS), ALSA/PulseAudio (Linux).
 *
 * Exported N-API functions:
 *   getApis()                        → string[]  (e.g. ["WASAPI","DirectSound"])
 *   getDevices(apiName?: string)     → DeviceInfo[]
 *   openStream(config)               → { ok, actualSampleRate, actualBufferSize, api, device }
 *   closeStream()                    → { ok }
 *   startStream()                    → { ok }
 *   stopStream()                     → { ok }
 *   writeBlock(leftF32, rightF32)    → { ok }
 *   getStreamInfo()                  → { isOpen, isRunning, sampleRate, bufferSize, api, device }
 *
 * Architecture:
 *   The renderer captures Web Audio output via an AudioWorklet and sends
 *   stereo float blocks through Electron IPC to this addon.
 *   writeBlock() copies interleaved samples into a lock-free ring buffer;
 *   the RtAudio callback reads from the ring buffer to feed the hardware.
 */

#define NAPI_VERSION 8
#include <napi.h>

#include <cstring>
#include <cmath>
#include <string>
#include <vector>
#include <atomic>
#include <mutex>
#include <algorithm>

// ─────────────────────────────────────────────────────────────────────────────
// RtAudio — compiled as a single translation unit alongside this file.
// Backend selection macros are set in binding.gyp per-platform.
// ─────────────────────────────────────────────────────────────────────────────

#include "../deps/RtAudio.h"

// ─────────────────────────────────────────────────────────────────────────────
// Lock-free SPSC ring buffer (power-of-two, single producer / single consumer)
// ─────────────────────────────────────────────────────────────────────────────

class RingBuffer {
public:
  explicit RingBuffer(size_t capacity = 131072)
    : capacity_(nextPow2(capacity))
    , mask_(capacity_ - 1)
    , buf_(new float[capacity_])
    , head_(0)
    , tail_(0)
  {
    std::memset(buf_, 0, capacity_ * sizeof(float));
  }

  ~RingBuffer() { delete[] buf_; }

  size_t available() const {
    return head_.load(std::memory_order_acquire) - tail_.load(std::memory_order_relaxed);
  }

  size_t space() const {
    return capacity_ - available();
  }

  size_t write(const float* data, size_t n) {
    const size_t avail = space();
    const size_t toWrite = std::min(n, avail);
    const size_t h = head_.load(std::memory_order_relaxed);
    for (size_t i = 0; i < toWrite; ++i) {
      buf_[(h + i) & mask_] = data[i];
    }
    head_.store(h + toWrite, std::memory_order_release);
    return toWrite;
  }

  size_t read(float* data, size_t n) {
    const size_t avail = available();
    const size_t toRead = std::min(n, avail);
    const size_t t = tail_.load(std::memory_order_relaxed);
    for (size_t i = 0; i < toRead; ++i) {
      data[i] = buf_[(t + i) & mask_];
    }
    if (toRead < n) {
      std::memset(data + toRead, 0, (n - toRead) * sizeof(float));
    }
    tail_.store(t + toRead, std::memory_order_release);
    return toRead;
  }

  void reset() {
    head_.store(0, std::memory_order_relaxed);
    tail_.store(0, std::memory_order_relaxed);
  }

private:
  static size_t nextPow2(size_t v) {
    v--;
    v |= v >> 1;  v |= v >> 2;  v |= v >> 4;
    v |= v >> 8;  v |= v >> 16;
#if SIZE_MAX > 0xFFFFFFFF
    v |= v >> 32;
#endif
    return v + 1;
  }

  size_t capacity_;
  size_t mask_;
  float* buf_;
  std::atomic<size_t> head_;
  std::atomic<size_t> tail_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Global state
// ─────────────────────────────────────────────────────────────────────────────

static RtAudio* g_rtAudio = nullptr;
static RingBuffer g_ring(262144);  // ~3 seconds at 44100 stereo
static std::mutex g_mutex;

static uint32_t g_sampleRate = 44100;
static uint32_t g_bufferSize = 256;
static std::string g_apiName;
static std::string g_deviceName;
static std::string g_lastError;

// ─────────────────────────────────────────────────────────────────────────────
// RtAudio callback — reads interleaved stereo from ring buffer
// ─────────────────────────────────────────────────────────────────────────────

static int rtAudioCallback(void* outputBuffer, void* /*inputBuffer*/,
                           unsigned int nFrames,
                           double /*streamTime*/,
                           RtAudioStreamStatus /*status*/,
                           void* /*userData*/)
{
  float* out = static_cast<float*>(outputBuffer);
  g_ring.read(out, nFrames * 2);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: RtAudio::Api from string name
// ─────────────────────────────────────────────────────────────────────────────

static RtAudio::Api apiFromName(const std::string& name) {
  if (name == "ASIO")          return RtAudio::WINDOWS_ASIO;
  if (name == "WASAPI")        return RtAudio::WINDOWS_WASAPI;
  if (name == "DirectSound")   return RtAudio::WINDOWS_DS;
  if (name == "CoreAudio")     return RtAudio::MACOSX_CORE;
  if (name == "ALSA")          return RtAudio::LINUX_ALSA;
  if (name == "PulseAudio")    return RtAudio::LINUX_PULSE;
  if (name == "JACK")          return RtAudio::UNIX_JACK;
  return RtAudio::UNSPECIFIED;
}

static std::string nameFromApi(RtAudio::Api api) {
  switch (api) {
    case RtAudio::WINDOWS_ASIO:   return "ASIO";
    case RtAudio::WINDOWS_WASAPI: return "WASAPI";
    case RtAudio::WINDOWS_DS:     return "DirectSound";
    case RtAudio::MACOSX_CORE:    return "CoreAudio";
    case RtAudio::LINUX_ALSA:     return "ALSA";
    case RtAudio::LINUX_PULSE:    return "PulseAudio";
    case RtAudio::UNIX_JACK:      return "JACK";
    default:                      return "Unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error callback for RtAudio v6
// ─────────────────────────────────────────────────────────────────────────────

static void rtAudioErrorCallback(RtAudioErrorType /*type*/, const std::string& errorText) {
  g_lastError = errorText;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: getApis() → string[]
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value GetApis(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::vector<RtAudio::Api> apis;
  RtAudio::getCompiledApi(apis);

  auto arr = Napi::Array::New(env, apis.size());
  for (size_t i = 0; i < apis.size(); ++i) {
    arr.Set(static_cast<uint32_t>(i), Napi::String::New(env, nameFromApi(apis[i])));
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: getDevices(apiName?: string) → DeviceInfo[]
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value GetDevices(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  RtAudio::Api api = RtAudio::UNSPECIFIED;
  if (info.Length() > 0 && info[0].IsString()) {
    api = apiFromName(info[0].As<Napi::String>().Utf8Value());
  }

  RtAudio probe(api, std::move(rtAudioErrorCallback));
  std::vector<unsigned int> ids = probe.getDeviceIds();

  auto arr = Napi::Array::New(env);
  uint32_t idx = 0;

  for (unsigned int devId : ids) {
    RtAudio::DeviceInfo di = probe.getDeviceInfo(devId);
    if (di.outputChannels > 0) {
      auto obj = Napi::Object::New(env);
      obj.Set("id",              Napi::Number::New(env, devId));
      obj.Set("name",            Napi::String::New(env, di.name));
      obj.Set("outputChannels",  Napi::Number::New(env, di.outputChannels));
      obj.Set("inputChannels",   Napi::Number::New(env, di.inputChannels));
      obj.Set("duplexChannels",  Napi::Number::New(env, di.duplexChannels));
      obj.Set("isDefaultOutput", Napi::Boolean::New(env, di.isDefaultOutput));
      obj.Set("isDefaultInput",  Napi::Boolean::New(env, di.isDefaultInput));
      obj.Set("api",             Napi::String::New(env, nameFromApi(
        api != RtAudio::UNSPECIFIED ? api : probe.getCurrentApi())));

      // Supported sample rates
      auto srArr = Napi::Array::New(env, di.sampleRates.size());
      for (size_t s = 0; s < di.sampleRates.size(); ++s) {
        srArr.Set(static_cast<uint32_t>(s), Napi::Number::New(env, di.sampleRates[s]));
      }
      obj.Set("sampleRates", srArr);
      obj.Set("preferredSampleRate", Napi::Number::New(env, di.preferredSampleRate));

      arr.Set(idx++, obj);
    }
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: openStream({ api, deviceId, sampleRate, bufferSize })
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value OpenStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  // Close existing stream if open
  if (g_rtAudio) {
    if (g_rtAudio->isStreamRunning()) g_rtAudio->stopStream();
    if (g_rtAudio->isStreamOpen())    g_rtAudio->closeStream();
    delete g_rtAudio;
    g_rtAudio = nullptr;
  }

  // Parse config
  RtAudio::Api api = RtAudio::UNSPECIFIED;
  unsigned int deviceId = 0;
  bool useDefaultDevice = true;
  uint32_t sampleRate = 44100;
  uint32_t bufferSize = 256;

  if (info.Length() > 0 && info[0].IsObject()) {
    auto cfg = info[0].As<Napi::Object>();
    if (cfg.Has("api") && cfg.Get("api").IsString()) {
      api = apiFromName(cfg.Get("api").As<Napi::String>().Utf8Value());
    }
    if (cfg.Has("deviceId") && cfg.Get("deviceId").IsNumber()) {
      deviceId = cfg.Get("deviceId").As<Napi::Number>().Uint32Value();
      useDefaultDevice = false;
    }
    if (cfg.Has("sampleRate") && cfg.Get("sampleRate").IsNumber()) {
      sampleRate = cfg.Get("sampleRate").As<Napi::Number>().Uint32Value();
    }
    if (cfg.Has("bufferSize") && cfg.Get("bufferSize").IsNumber()) {
      bufferSize = cfg.Get("bufferSize").As<Napi::Number>().Uint32Value();
    }
  }

  g_lastError.clear();
  g_rtAudio = new RtAudio(api, std::move(rtAudioErrorCallback));

  // Pick output device
  RtAudio::StreamParameters outParams;
  if (useDefaultDevice) {
    outParams.deviceId = g_rtAudio->getDefaultOutputDevice();
  } else {
    outParams.deviceId = deviceId;
  }
  outParams.nChannels = 2;
  outParams.firstChannel = 0;

  // Store the device name
  RtAudio::DeviceInfo devInfo = g_rtAudio->getDeviceInfo(outParams.deviceId);
  g_deviceName = devInfo.name;
  g_apiName = nameFromApi(g_rtAudio->getCurrentApi());

  unsigned int bufFrames = bufferSize;
  g_ring.reset();

  // Use MINIMIZE_LATENCY for ASIO-like behavior
  RtAudio::StreamOptions opts;
  opts.flags = RTAUDIO_MINIMIZE_LATENCY;

  RtAudioErrorType err = g_rtAudio->openStream(
    &outParams,       // output
    nullptr,          // no input
    RTAUDIO_FLOAT32,
    sampleRate,
    &bufFrames,       // may be modified by driver
    rtAudioCallback,
    nullptr,          // userData
    &opts
  );

  if (err != RTAUDIO_NO_ERROR) {
    std::string errMsg = g_lastError.empty() ? "openStream failed" : g_lastError;
    delete g_rtAudio;
    g_rtAudio = nullptr;
    Napi::Error::New(env, errMsg).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Store the actual sample rate / buffer size as negotiated by the driver.
  // RtAudio may adjust the requested values — getStreamSampleRate() returns
  // the true rate, and bufFrames was updated in-place by openStream().
  g_sampleRate = g_rtAudio->getStreamSampleRate();
  g_bufferSize = bufFrames;

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  result.Set("actualSampleRate", Napi::Number::New(env, g_sampleRate));
  result.Set("actualBufferSize", Napi::Number::New(env, bufFrames));
  result.Set("api", Napi::String::New(env, g_apiName));
  result.Set("device", Napi::String::New(env, g_deviceName));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: closeStream()
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value CloseStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  if (g_rtAudio) {
    if (g_rtAudio->isStreamRunning()) g_rtAudio->stopStream();
    if (g_rtAudio->isStreamOpen())    g_rtAudio->closeStream();
    delete g_rtAudio;
    g_rtAudio = nullptr;
  }
  g_ring.reset();

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: startStream()
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value StartStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  if (!g_rtAudio || !g_rtAudio->isStreamOpen()) {
    Napi::Error::New(env, "No stream open").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!g_rtAudio->isStreamRunning()) {
    RtAudioErrorType err = g_rtAudio->startStream();
    if (err != RTAUDIO_NO_ERROR) {
      std::string errMsg = g_lastError.empty() ? "startStream failed" : g_lastError;
      Napi::Error::New(env, errMsg).ThrowAsJavaScriptException();
      return env.Null();
    }
  }

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: stopStream()
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value StopStream(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(g_mutex);

  if (g_rtAudio && g_rtAudio->isStreamOpen() && g_rtAudio->isStreamRunning()) {
    RtAudioErrorType err = g_rtAudio->stopStream();
    if (err != RTAUDIO_NO_ERROR) {
      std::string errMsg = g_lastError.empty() ? "stopStream failed" : g_lastError;
      Napi::Error::New(env, errMsg).ThrowAsJavaScriptException();
      return env.Null();
    }
  }

  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: writeBlock(leftF32, rightF32)
// Interleaves L/R channels and pushes into the ring buffer.
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value WriteBlock(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "writeBlock(leftF32, rightF32)")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  const float* leftData = nullptr;
  const float* rightData = nullptr;
  size_t leftLen = 0, rightLen = 0;

  if (info[0].IsArrayBuffer()) {
    auto ab = info[0].As<Napi::ArrayBuffer>();
    leftData = static_cast<const float*>(ab.Data());
    leftLen = ab.ByteLength() / sizeof(float);
  } else if (info[0].IsTypedArray()) {
    auto ta = info[0].As<Napi::Float32Array>();
    leftData = ta.Data();
    leftLen = ta.ElementLength();
  } else {
    Napi::TypeError::New(env, "writeBlock: left must be Float32Array or ArrayBuffer")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info[1].IsArrayBuffer()) {
    auto ab = info[1].As<Napi::ArrayBuffer>();
    rightData = static_cast<const float*>(ab.Data());
    rightLen = ab.ByteLength() / sizeof(float);
  } else if (info[1].IsTypedArray()) {
    auto ta = info[1].As<Napi::Float32Array>();
    rightData = ta.Data();
    rightLen = ta.ElementLength();
  } else {
    Napi::TypeError::New(env, "writeBlock: right must be Float32Array or ArrayBuffer")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  const size_t frames = std::min(leftLen, rightLen);
  if (frames == 0) {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, true));
    return result;
  }

  // Interleave L/R into temporary buffer and write to ring
  constexpr size_t STACK_LIMIT = 8192;
  float stackBuf[STACK_LIMIT * 2];
  float* interleaved = frames <= STACK_LIMIT ? stackBuf : new float[frames * 2];

  for (size_t i = 0; i < frames; ++i) {
    interleaved[i * 2]     = leftData[i];
    interleaved[i * 2 + 1] = rightData[i];
  }

  size_t written = g_ring.write(interleaved, frames * 2);

  if (frames > STACK_LIMIT) delete[] interleaved;

  size_t droppedSamples = (frames * 2) - written;
  auto result = Napi::Object::New(env);
  result.Set("ok", Napi::Boolean::New(env, true));
  result.Set("framesWritten", Napi::Number::New(env, static_cast<double>(written / 2)));
  result.Set("framesDropped", Napi::Number::New(env, static_cast<double>(droppedSamples / 2)));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: getStreamInfo()
// ─────────────────────────────────────────────────────────────────────────────

static Napi::Value GetStreamInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto result = Napi::Object::New(env);
  if (!g_rtAudio) {
    result.Set("isOpen", Napi::Boolean::New(env, false));
    result.Set("isRunning", Napi::Boolean::New(env, false));
    result.Set("sampleRate", Napi::Number::New(env, 0));
    result.Set("bufferSize", Napi::Number::New(env, 0));
    result.Set("api", Napi::String::New(env, ""));
    result.Set("device", Napi::String::New(env, ""));
    return result;
  }

  result.Set("isOpen",      Napi::Boolean::New(env, g_rtAudio->isStreamOpen()));
  result.Set("isRunning",   Napi::Boolean::New(env, g_rtAudio->isStreamRunning()));
  result.Set("sampleRate",  Napi::Number::New(env, g_sampleRate));
  result.Set("bufferSize",  Napi::Number::New(env, g_bufferSize));
  result.Set("api",         Napi::String::New(env, g_apiName));
  result.Set("device",      Napi::String::New(env, g_deviceName));
  result.Set("ringAvailable", Napi::Number::New(env, static_cast<double>(g_ring.available())));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module init
// ─────────────────────────────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getApis",       Napi::Function::New(env, GetApis));
  exports.Set("getDevices",    Napi::Function::New(env, GetDevices));
  exports.Set("openStream",    Napi::Function::New(env, OpenStream));
  exports.Set("closeStream",   Napi::Function::New(env, CloseStream));
  exports.Set("startStream",   Napi::Function::New(env, StartStream));
  exports.Set("stopStream",    Napi::Function::New(env, StopStream));
  exports.Set("writeBlock",    Napi::Function::New(env, WriteBlock));
  exports.Set("getStreamInfo", Napi::Function::New(env, GetStreamInfo));
  return exports;
}

NODE_API_MODULE(audio_backend, Init)
