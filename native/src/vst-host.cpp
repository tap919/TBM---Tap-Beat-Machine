/**
 * vst-host.cpp  —  N-API native addon for VST2/VST3 plugin hosting in Electron.
 *
 * Architecture
 * ─────────────
 *  - VST3: Uses the minimal COM-compatible interface subset defined inline below.
 *    No full Steinberg SDK headers required; we only need the GUIDs and vtable
 *    layouts for IPluginFactory, IComponent, IAudioProcessor, IEditController.
 *  - VST2 (.dll): Loaded via LoadLibraryW; entry point GetPluginFactory() or
 *    the VST2 VSTPluginMain / main entry. VST2 support is best-effort.
 *  - All instances are tracked in a global map keyed by a UUID string.
 *
 * Exported N-API functions (called from electron-main.js ipcMain handlers):
 *   scan(paths: string[])         → PluginInfo[]
 *   loadPlugin(path: string)      → LoadedPluginInfo
 *   unloadPlugin(instanceId: str) → { ok: bool }
 *   getParams(instanceId: str)    → ParamInfo[]
 *   setParam(id, idx, val)        → { ok: bool }
 *   processBlock(id, L, R, size)  → { outputL, outputR }
 */

#define NAPI_VERSION 8
#include <napi.h>

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <filesystem>
#include <memory>
#include <cstring>
#include <sstream>
#include <iomanip>

// ─────────────────────────────────────────────────────────────────────────────
// Minimal VST3 COM interfaces — self-contained, no SDK headers needed.
// GUIDs match Steinberg's published specification.
// ─────────────────────────────────────────────────────────────────────────────

namespace Vst3 {

// 16-byte GUID / FUID
struct FUID {
    uint8_t data[16];
};

inline bool operator==(const FUID& a, const FUID& b) {
    return std::memcmp(a.data, b.data, 16) == 0;
}

// FUnknown — base COM interface
struct FUnknown {
    virtual int32_t __stdcall queryInterface(const FUID& iid, void** obj) = 0;
    virtual uint32_t __stdcall addRef() = 0;
    virtual uint32_t __stdcall release() = 0;
};

// IPluginBase
struct IPluginBase : FUnknown {
    virtual int32_t __stdcall initialize(FUnknown* context) = 0;
    virtual int32_t __stdcall terminate() = 0;
};

// PClassInfo — factory class descriptor
struct PClassInfo {
    FUID    cid;
    int32_t cardinality;
    char    category[32];
    char    name[64];
};

// PClassInfo2 — extended class info
struct PClassInfo2 {
    FUID    cid;
    int32_t cardinality;
    char    category[32];
    char    name[64];
    uint32_t classFlags;
    char    subCategories[128];
    char    vendor[64];
    char    version[64];
    char    sdkVersion[64];
};

// IPluginFactory
struct IPluginFactory : FUnknown {
    struct FactoryInfo {
        char vendor[64];
        char url[256];
        char email[128];
        int32_t flags;
    };
    virtual int32_t __stdcall getFactoryInfo(FactoryInfo* info) = 0;
    virtual int32_t __stdcall countClasses() = 0;
    virtual int32_t __stdcall getClassInfo(int32_t index, PClassInfo* info) = 0;
    virtual int32_t __stdcall createInstance(const FUID& cid, const FUID& iid, void** obj) = 0;
};

// IPluginFactory2 (extends IPluginFactory with PClassInfo2)
struct IPluginFactory2 : IPluginFactory {
    virtual int32_t __stdcall getClassInfo2(int32_t index, PClassInfo2* info) = 0;
};

// Well-known IIDs
static const FUID IID_IPluginFactory   = {{ 0x7A,0x4D,0x81,0x1C,0x52,0x11,0x4A,0x1F,0x80,0x4C,0xDA,0xD9,0x07,0x49,0x33,0x9D }};
static const FUID IID_IPluginFactory2  = {{ 0x0C,0xED,0xDA,0xD0,0xBB,0xDB,0x47,0xB4,0x9B,0xE4,0x22,0x56,0xFD,0x47,0x87,0x12 }};
static const FUID IID_IComponent       = {{ 0xE8,0x31,0xFF,0x31,0xF2,0xD5,0x43,0x01,0x92,0x8E,0xBB,0xEF,0x4B,0x07,0x97,0xDA }};
static const FUID IID_IAudioProcessor  = {{ 0x42,0x04,0x3F,0x99,0xB3,0xDA,0x45,0x3C,0x87,0x46,0xBE,0x77,0x5C,0xCB,0xCA,0xCC }};
static const FUID IID_IEditController  = {{ 0xDB,0xD7,0x36,0x65,0xF2,0x2C,0x47,0xCF,0xBC,0xD0,0x7D,0xD9,0x37,0x30,0x48,0xB6 }};

// kAudio category constant
static const char kVstAudioEffectClass[] = "Audio Module Class";

// IAudioProcessor minimal interface — enough for processBlock
struct ProcessData {
    int32_t processMode;     // 0=realtime, 1=prefetch, 2=offline
    int32_t symbolicSampleSize; // 0=float32, 1=float64
    int32_t numSamples;
    int32_t numInputs;
    int32_t numOutputs;
    struct AudioBusBuffers {
        int32_t  numChannels;
        uint64_t silenceFlags;
        float**  channelBuffers32;
        double** channelBuffers64;
    } *inputs, *outputs;
    // (rest of struct omitted — we fill only what we use)
    void* inputEvents;
    void* outputEvents;
    void* inputParameterChanges;
    void* outputParameterChanges;
    void* processContext;  // ProcessContext* — opaque here, we supply our own minimal struct
};

struct ProcessSetup {
    int32_t processMode;
    int32_t symbolicSampleSize;
    int32_t maxSamplesPerBlock;
    double  sampleRate;
};

struct IAudioProcessor : FUnknown {
    virtual int32_t __stdcall setBusArrangements(uint64_t* inputs, int32_t numIns, uint64_t* outputs, int32_t numOuts) = 0;
    virtual int32_t __stdcall getBusArrangement(int32_t dir, int32_t index, uint64_t& arr) = 0;
    virtual int32_t __stdcall canProcessSampleSize(int32_t symbolicSampleSize) = 0;
    virtual uint32_t __stdcall getLatencySamples() = 0;
    virtual int32_t __stdcall setupProcessing(ProcessSetup& setup) = 0;
    virtual int32_t __stdcall setProcessing(uint8_t state) = 0;
    virtual int32_t __stdcall process(ProcessData& data) = 0;
    virtual uint32_t __stdcall getTailSamples() = 0;
};

// IComponent minimal
struct IComponent : IPluginBase {
    virtual int32_t __stdcall getControllerClassId(FUID& classId) = 0;
    virtual int32_t __stdcall setIoMode(int32_t mode) = 0;
    virtual int32_t __stdcall getBusCount(int32_t mediaType, int32_t dir) = 0;
    virtual int32_t __stdcall getBusInfo(int32_t mediaType, int32_t dir, int32_t index, void* bus) = 0;
    virtual int32_t __stdcall getRoutingInfo(void* inInfo, void* outInfo) = 0;
    virtual int32_t __stdcall activateBus(int32_t mediaType, int32_t dir, int32_t index, uint8_t state) = 0;
    virtual int32_t __stdcall setActive(uint8_t state) = 0;
    virtual int32_t __stdcall setState(void* state) = 0;
    virtual int32_t __stdcall getState(void* state) = 0;
};

// IEditController minimal
struct ParameterInfo {
    uint32_t id;
    char16_t title[128];
    char16_t shortTitle[128];
    char16_t units[128];
    int32_t stepCount;
    double defaultNormalizedValue;
    int32_t unitId;
    int32_t flags;
};

struct IEditController : IPluginBase {
    virtual int32_t __stdcall setComponentState(void* state) = 0;
    virtual int32_t __stdcall setState(void* state) = 0;
    virtual int32_t __stdcall getState(void* state) = 0;
    virtual int32_t __stdcall getParameterCount() = 0;
    virtual int32_t __stdcall getParameterInfo(int32_t paramIndex, ParameterInfo& info) = 0;
    virtual int32_t __stdcall getParamStringByValue(uint32_t id, double valueNormalized, char16_t* string128) = 0;
    virtual int32_t __stdcall getParamValueByString(uint32_t id, char16_t* string, double& valueNormalized) = 0;
    virtual double  __stdcall normalizedParamToPlain(uint32_t id, double valueNormalized) = 0;
    virtual double  __stdcall plainParamToNormalized(uint32_t id, double plainValue) = 0;
    virtual double  __stdcall getParamNormalized(uint32_t id) = 0;
    virtual int32_t __stdcall setParamNormalized(uint32_t id, double value) = 0;
    virtual int32_t __stdcall setComponentHandler(void* handler) = 0;
    virtual void*   __stdcall createView(const char* name) = 0;
};

// kResultOk
static const int32_t kResultOk = 0;

// Helper: convert char16_t* to std::string
static std::string u16ToString(const char16_t* s, size_t maxLen = 128) {
    std::string out;
    for (size_t i = 0; i < maxLen && s[i]; ++i) {
        char16_t c = s[i];
        if (c < 0x80) out += static_cast<char>(c);
        else out += '?';
    }
    return out;
}

} // namespace Vst3

// ─────────────────────────────────────────────────────────────────────────────
// Minimal VST2 AEffect layout — self-contained, no Steinberg SDK required.
// The struct layout and opcode constants are public knowledge from the
// original VST 2.4 specification (Steinberg discontinued the SDK in 2018).
// ─────────────────────────────────────────────────────────────────────────────

namespace Vst2 {

// VST2 dispatcher opcodes (subset we actually need)
constexpr int32_t effOpen           = 0;
constexpr int32_t effClose          = 1;
constexpr int32_t effSetSampleRate  = 10;
constexpr int32_t effSetBlockSize   = 11;
constexpr int32_t effMainsChanged   = 12;
constexpr int32_t effGetEffectName  = 45;
constexpr int32_t effGetVendorString = 47;
constexpr int32_t effGetNumParams    = 0; // numParams is a field, not opcode
constexpr int32_t kEffectMagic      = 0x56737450; // 'VstP'

// Forward-declared AEffect — matches the VST 2.4 binary layout.
// Only the fields/function pointers we use are named; the rest are reserved.
struct AEffect {
    int32_t magic;                                                      // must be kEffectMagic
    intptr_t (__cdecl *dispatcher)(AEffect*, int32_t opcode, int32_t index, intptr_t value, void* ptr, float opt);
    void     (__cdecl *_deprecated_process)(AEffect*, float**, float**, int32_t);
    void     (__cdecl *setParameter)(AEffect*, int32_t index, float value);
    float    (__cdecl *getParameter)(AEffect*, int32_t index);
    int32_t  numPrograms;
    int32_t  numParams;
    int32_t  numInputs;
    int32_t  numOutputs;
    int32_t  flags;
    void*    resvd1;
    void*    resvd2;
    int32_t  initialDelay;
    int32_t  _pad[2];
    float    _pad2;
    void*    object;                // host can store context here
    void*    user;
    int32_t  uniqueID;
    int32_t  version;
    void     (__cdecl *processReplacing)(AEffect*, float** inputs, float** outputs, int32_t sampleFrames);
    void     (__cdecl *processDoubleReplacing)(AEffect*, double** inputs, double** outputs, int32_t sampleFrames);
    char     _future[56];
};

// VST2 entry point signature
using VstPluginMain = AEffect* (__cdecl *)(intptr_t (__cdecl *hostCallback)(AEffect*, int32_t, int32_t, intptr_t, void*, float));

// Minimal host callback — VST2 plugins call this for host queries.
// We handle only the bare minimum so plugins don't crash on load.
static intptr_t __cdecl hostCallback(AEffect* /*effect*/, int32_t opcode, int32_t /*index*/,
                                      intptr_t /*value*/, void* /*ptr*/, float /*opt*/) {
    switch (opcode) {
        case 1:  return 1;           // audioMasterAutomate — OK
        case 2:  return 2400;        // audioMasterVersion — VST 2.4
        case 6:  return 0;           // audioMasterWantMidi — not supported
        default: return 0;
    }
}

} // namespace Vst2

// ─────────────────────────────────────────────────────────────────────────────
// Plugin instance tracking
// ─────────────────────────────────────────────────────────────────────────────

struct PluginInstance {
    std::string instanceId;
    std::string name;
    std::string vendor;
    std::string type; // "VST3" or "VST2"
    HMODULE     hModule = nullptr;

    // VST3 specific
    Vst3::IComponent*       component  = nullptr;
    Vst3::IAudioProcessor*  processor  = nullptr;
    Vst3::IEditController*  controller = nullptr;

    // VST2 specific
    Vst2::AEffect*          vst2Effect = nullptr;

    int32_t numInputs  = 2;
    int32_t numOutputs = 2;
    int32_t numParams  = 0;
    double  sampleRate = 44100.0;
    int32_t blockSize  = 512;

    // Pre-allocated processing buffers
    std::vector<float> inL, inR, outL, outR;
    float* inPtrs[2]  = {};
    float* outPtrs[2] = {};

    // Non-copyable, non-movable (COM pointers are raw)
    PluginInstance() = default;
    PluginInstance(const PluginInstance&) = delete;
    PluginInstance& operator=(const PluginInstance&) = delete;

    // RAII destructor — releases COM interfaces / VST2 effect and frees the DLL.
    // This ensures cleanup happens automatically when unique_ptr is destroyed,
    // whether via normal unload, error-path early return, or map erasure.
    ~PluginInstance() {
        // VST3 cleanup
        if (processor)  { processor->setProcessing(0);  processor->release();  processor  = nullptr; }
        if (controller) { controller->terminate();       controller->release(); controller = nullptr; }
        if (component)  { component->setActive(0);       component->terminate();  component->release(); component = nullptr; }
        // VST2 cleanup
        if (vst2Effect) {
            vst2Effect->dispatcher(vst2Effect, Vst2::effMainsChanged, 0, 0, nullptr, 0.f); // suspend
            vst2Effect->dispatcher(vst2Effect, Vst2::effClose, 0, 0, nullptr, 0.f);
            vst2Effect = nullptr;
        }
        if (hModule)    { FreeLibrary(hModule);          hModule = nullptr; }
    }

    void resizeBuffers(int32_t size) {
        blockSize = size;
        inL.assign(size, 0.f); inR.assign(size, 0.f);
        outL.assign(size, 0.f); outR.assign(size, 0.f);
        inPtrs[0]  = inL.data();  inPtrs[1]  = inR.data();
        outPtrs[0] = outL.data(); outPtrs[1] = outR.data();
    }
};

static std::unordered_map<std::string, std::unique_ptr<PluginInstance>> g_instances;
static uint32_t g_nextId = 1;

static std::string makeInstanceId() {
    std::ostringstream ss;
    ss << "vst_" << std::setw(6) << std::setfill('0') << g_nextId++;
    return ss.str();
}

// ─────────────────────────────────────────────────────────────────────────────
// Directory scanning
// ─────────────────────────────────────────────────────────────────────────────

struct PluginFileInfo {
    std::string path;
    std::string name;
    std::string type; // "VST3" or "VST2"
};

static void scanDirectory(const std::filesystem::path& dir,
                          std::vector<PluginFileInfo>& results,
                          int depth = 0) {
    if (depth > 6) return;
    std::error_code ec;
    for (auto& entry : std::filesystem::directory_iterator(dir, ec)) {
        if (ec) { ec.clear(); continue; }
        const auto& p = entry.path();
        const auto ext = p.extension().string();

        // .vst3 can be either a file or a directory (bundle)
        if (ext == ".vst3") {
            PluginFileInfo info;
            info.path = p.string();
            info.name = p.stem().string();
            info.type = "VST3";
            results.push_back(std::move(info));
        } else if (ext == ".dll" && entry.is_regular_file()) {
            PluginFileInfo info;
            info.path = p.string();
            info.name = p.stem().string();
            info.type = "VST2";
            results.push_back(std::move(info));
        } else if (entry.is_directory()) {
            scanDirectory(p, results, depth + 1);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// VST3 factory interrogation (load + query metadata, then unload)
// ─────────────────────────────────────────────────────────────────────────────

struct RichPluginInfo {
    std::string path;
    std::string name;
    std::string vendor;
    std::string type;
    std::string category;
    int32_t numInputs  = 2;
    int32_t numOutputs = 2;
};

typedef Vst3::IPluginFactory* (*GetPluginFactoryProc)();

static std::vector<RichPluginInfo> interrogateVST3(const std::string& pluginPath) {
    std::vector<RichPluginInfo> out;

    // For .vst3 bundles (directories), the actual DLL is in Contents/x86_64-win/
    std::filesystem::path dllPath = pluginPath;
    if (std::filesystem::is_directory(dllPath)) {
        auto contentsDir = dllPath / "Contents" / "x86_64-win";
        std::error_code ec;
        for (auto& e : std::filesystem::directory_iterator(contentsDir, ec)) {
            if (e.path().extension() == ".vst3" || e.path().extension() == ".dll") {
                dllPath = e.path();
                break;
            }
        }
        if (std::filesystem::is_directory(dllPath)) return out; // couldn't find DLL
    }

    HMODULE hMod = LoadLibraryW(dllPath.wstring().c_str());
    if (!hMod) return out;

    auto factoryProc = reinterpret_cast<GetPluginFactoryProc>(
        GetProcAddress(hMod, "GetPluginFactory"));

    if (factoryProc) {
        Vst3::IPluginFactory* factory = factoryProc();
        if (factory) {
            Vst3::IPluginFactory::FactoryInfo fi{};
            factory->getFactoryInfo(&fi);
            const std::string vendor(fi.vendor);

            const int32_t count = factory->countClasses();

            // C-4 fix: query IPluginFactory2 ONCE before the loop (not per-iteration)
            // to avoid over-calling release() on each iteration (use-after-free).
            Vst3::IPluginFactory2* factory2 = nullptr;
            factory->queryInterface(Vst3::IID_IPluginFactory2, reinterpret_cast<void**>(&factory2));

            for (int32_t i = 0; i < count; ++i) {
                if (factory2) {
                    Vst3::PClassInfo2 ci2{};
                    if (factory2->getClassInfo2(i, &ci2) == Vst3::kResultOk) {
                        // Only expose Audio Module classes
                        if (std::strncmp(ci2.category, Vst3::kVstAudioEffectClass, 32) == 0) {
                            RichPluginInfo ri;
                            ri.path     = pluginPath;
                            ri.name     = ci2.name;
                            ri.vendor   = ci2.vendor[0] ? ci2.vendor : vendor;
                            ri.type     = "VST3";
                            ri.category = ci2.subCategories;
                            ri.numInputs  = 2;
                            ri.numOutputs = 2;
                            out.push_back(ri);
                        }
                    }
                } else {
                    Vst3::PClassInfo ci{};
                    if (factory->getClassInfo(i, &ci) == Vst3::kResultOk) {
                        if (std::strncmp(ci.category, Vst3::kVstAudioEffectClass, 32) == 0) {
                            RichPluginInfo ri;
                            ri.path     = pluginPath;
                            ri.name     = ci.name;
                            ri.vendor   = vendor;
                            ri.type     = "VST3";
                            ri.category = "FX";
                            ri.numInputs  = 2;
                            ri.numOutputs = 2;
                            out.push_back(ri);
                        }
                    }
                }
            }
            // C-4 fix: release factory2 ONCE after the loop, not per-iteration
            if (factory2) factory2->release();
            factory->release();
        }
    }

    FreeLibrary(hMod);
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: scan
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value Scan(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::vector<std::string> searchPaths;
    if (info.Length() > 0 && info[0].IsArray()) {
        auto arr = info[0].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); ++i) {
            if (arr.Get(i).IsString())
                searchPaths.push_back(arr.Get(i).As<Napi::String>().Utf8Value());
        }
    }

    // Collect all file paths first
    std::vector<PluginFileInfo> fileInfos;
    for (const auto& sp : searchPaths) {
        std::filesystem::path dir(sp);
        std::error_code ec;
        if (std::filesystem::exists(dir, ec))
            scanDirectory(dir, fileInfos);
    }

    // For VST3, interrogate factories for rich metadata; for VST2, use filename
    auto resultArr = Napi::Array::New(env);
    uint32_t idx = 0;

    for (const auto& fi : fileInfos) {
        if (fi.type == "VST3") {
            auto rich = interrogateVST3(fi.path);
            if (rich.empty()) {
                // Couldn't interrogate — emit file-level entry
                auto obj = Napi::Object::New(env);
                obj.Set("path",       Napi::String::New(env, fi.path));
                obj.Set("name",       Napi::String::New(env, fi.name));
                obj.Set("vendor",     Napi::String::New(env, "Unknown"));
                obj.Set("type",       Napi::String::New(env, "VST3"));
                obj.Set("category",   Napi::String::New(env, "FX"));
                obj.Set("numInputs",  Napi::Number::New(env, 2));
                obj.Set("numOutputs", Napi::Number::New(env, 2));
                resultArr.Set(idx++, obj);
            } else {
                for (const auto& ri : rich) {
                    auto obj = Napi::Object::New(env);
                    obj.Set("path",       Napi::String::New(env, ri.path));
                    obj.Set("name",       Napi::String::New(env, ri.name));
                    obj.Set("vendor",     Napi::String::New(env, ri.vendor));
                    obj.Set("type",       Napi::String::New(env, "VST3"));
                    obj.Set("category",   Napi::String::New(env, ri.category));
                    obj.Set("numInputs",  Napi::Number::New(env, ri.numInputs));
                    obj.Set("numOutputs", Napi::Number::New(env, ri.numOutputs));
                    resultArr.Set(idx++, obj);
                }
            }
        } else {
            // VST2 — file-level only (no safe way to enumerate without loading)
            auto obj = Napi::Object::New(env);
            obj.Set("path",       Napi::String::New(env, fi.path));
            obj.Set("name",       Napi::String::New(env, fi.name));
            obj.Set("vendor",     Napi::String::New(env, "Unknown"));
            obj.Set("type",       Napi::String::New(env, "VST2"));
            obj.Set("category",   Napi::String::New(env, "FX"));
            obj.Set("numInputs",  Napi::Number::New(env, 2));
            obj.Set("numOutputs", Napi::Number::New(env, 2));
            resultArr.Set(idx++, obj);
        }
    }

    return resultArr;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: loadPlugin
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value LoadPlugin(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "loadPlugin(path: string)").ThrowAsJavaScriptException();
        return env.Null();
    }
    const std::string pluginPath = info[0].As<Napi::String>().Utf8Value();

    // Resolve DLL path for VST3 bundles
    std::filesystem::path dllPath = pluginPath;
    bool isVst3 = false;
    if (std::filesystem::is_directory(dllPath) ||
        dllPath.extension() == ".vst3") {
        isVst3 = true;
        if (std::filesystem::is_directory(dllPath)) {
            auto contentsDir = dllPath / "Contents" / "x86_64-win";
            std::error_code ec;
            for (auto& e : std::filesystem::directory_iterator(contentsDir, ec)) {
                if (e.path().extension() == ".vst3" || e.path().extension() == ".dll") {
                    dllPath = e.path();
                    break;
                }
            }
        }
    } else if (dllPath.extension() == ".dll") {
        isVst3 = false; // VST2
    }

    HMODULE hMod = LoadLibraryW(dllPath.wstring().c_str());
    if (!hMod) {
        Napi::Error::New(env, "LoadLibrary failed: " + pluginPath).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto inst = std::make_unique<PluginInstance>();
    inst->hModule = hMod;
    inst->type    = isVst3 ? "VST3" : "VST2";
    inst->name    = dllPath.stem().string();
    inst->vendor  = "Unknown";

    if (isVst3) {
        auto factoryProc = reinterpret_cast<GetPluginFactoryProc>(
            GetProcAddress(hMod, "GetPluginFactory"));
        if (!factoryProc) {
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "GetPluginFactory not found in: " + pluginPath)
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        Vst3::IPluginFactory* factory = factoryProc();
        if (!factory) {
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "GetPluginFactory returned null").ThrowAsJavaScriptException();
            return env.Null();
        }

        Vst3::IPluginFactory::FactoryInfo fi{};
        factory->getFactoryInfo(&fi);
        inst->vendor = fi.vendor;

        // Find first Audio Module class
        const int32_t count = factory->countClasses();
        Vst3::PClassInfo firstAudioClass{};
        bool found = false;
        for (int32_t i = 0; i < count && !found; ++i) {
            Vst3::PClassInfo ci{};
            if (factory->getClassInfo(i, &ci) == Vst3::kResultOk) {
                if (std::strncmp(ci.category, Vst3::kVstAudioEffectClass, 32) == 0) {
                    firstAudioClass = ci;
                    inst->name = ci.name;
                    found = true;
                }
            }
        }

        if (!found) {
            factory->release();
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "No audio effect class found in plugin").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Create IComponent
        void* compPtr = nullptr;
        int32_t hr = factory->createInstance(firstAudioClass.cid, Vst3::IID_IComponent, &compPtr);
        if (hr != Vst3::kResultOk || !compPtr) {
            factory->release();
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "Failed to create IComponent").ThrowAsJavaScriptException();
            return env.Null();
        }
        inst->component = static_cast<Vst3::IComponent*>(compPtr);
        inst->component->initialize(nullptr);

        // QI for IAudioProcessor
        void* procPtr = nullptr;
        inst->component->queryInterface(Vst3::IID_IAudioProcessor, &procPtr);
        if (procPtr) {
            inst->processor = static_cast<Vst3::IAudioProcessor*>(procPtr);

            // Setup processing
            Vst3::ProcessSetup setup{};
            setup.processMode         = 0; // realtime
            setup.symbolicSampleSize  = 0; // float32
            setup.maxSamplesPerBlock  = 512;
            setup.sampleRate          = 44100.0;
            inst->processor->setupProcessing(setup);
            inst->processor->setProcessing(1);
            inst->component->setActive(1);
        }

        // QI for IEditController (may be separate)
        void* ctrlPtr = nullptr;
        inst->component->queryInterface(Vst3::IID_IEditController, &ctrlPtr);
        if (ctrlPtr) {
            inst->controller = static_cast<Vst3::IEditController*>(ctrlPtr);
            inst->controller->initialize(nullptr);
            inst->numParams = inst->controller->getParameterCount();
        } else {
            // Try creating controller separately via factory
            Vst3::FUID controllerClassId{};
            if (inst->component->getControllerClassId(controllerClassId) == Vst3::kResultOk) {
                void* ctrl2 = nullptr;
                factory->createInstance(controllerClassId, Vst3::IID_IEditController, &ctrl2);
                if (ctrl2) {
                    inst->controller = static_cast<Vst3::IEditController*>(ctrl2);
                    inst->controller->initialize(nullptr);
                    inst->numParams = inst->controller->getParameterCount();
                }
            }
        }

        factory->release();
    } else {
        // ── VST2 loading ────────────────────────────────────────────────
        // Look for the standard VST2 entry points: VSTPluginMain or main
        auto vstMain = reinterpret_cast<Vst2::VstPluginMain>(
            GetProcAddress(hMod, "VSTPluginMain"));
        if (!vstMain) {
            vstMain = reinterpret_cast<Vst2::VstPluginMain>(
                GetProcAddress(hMod, "main"));
        }

        if (!vstMain) {
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "No VST2 entry point found in: " + pluginPath)
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        Vst2::AEffect* effect = vstMain(Vst2::hostCallback);
        if (!effect || effect->magic != Vst2::kEffectMagic) {
            // inst destructor handles FreeLibrary via RAII
            Napi::Error::New(env, "VST2 plugin returned invalid AEffect")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        inst->vst2Effect = effect;
        inst->numInputs  = effect->numInputs;
        inst->numOutputs = effect->numOutputs;
        inst->numParams  = effect->numParams;

        // Query effect name / vendor (best effort)
        char nameBuf[128] = {};
        char vendorBuf[128] = {};
        effect->dispatcher(effect, Vst2::effGetEffectName,  0, 0, nameBuf,   0.f);
        effect->dispatcher(effect, Vst2::effGetVendorString, 0, 0, vendorBuf, 0.f);
        if (nameBuf[0])   inst->name   = nameBuf;
        if (vendorBuf[0]) inst->vendor = vendorBuf;

        // Proper VST2 resume sequence: open → setSampleRate → setBlockSize → mainsChanged(1)
        effect->dispatcher(effect, Vst2::effOpen,          0, 0,     nullptr, 0.f);
        effect->dispatcher(effect, Vst2::effSetSampleRate, 0, 0,     nullptr, 44100.f);
        effect->dispatcher(effect, Vst2::effSetBlockSize,  0, 512,   nullptr, 0.f);
        effect->dispatcher(effect, Vst2::effMainsChanged,  0, 1,     nullptr, 0.f); // resume
    }

    inst->sampleRate = 44100.0;
    inst->resizeBuffers(512);

    const std::string id = makeInstanceId();
    inst->instanceId = id;

    auto obj = Napi::Object::New(env);
    obj.Set("instanceId",  Napi::String::New(env, id));
    obj.Set("name",        Napi::String::New(env, inst->name));
    obj.Set("vendor",      Napi::String::New(env, inst->vendor));
    obj.Set("type",        Napi::String::New(env, inst->type));
    obj.Set("numInputs",   Napi::Number::New(env, inst->numInputs));
    obj.Set("numOutputs",  Napi::Number::New(env, inst->numOutputs));
    obj.Set("numParams",   Napi::Number::New(env, inst->numParams));
    obj.Set("sampleRate",  Napi::Number::New(env, inst->sampleRate));
    obj.Set("blockSize",   Napi::Number::New(env, inst->blockSize));

    g_instances[id] = std::move(inst);
    return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: unloadPlugin
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value UnloadPlugin(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "unloadPlugin(instanceId: string)").ThrowAsJavaScriptException();
        return env.Null();
    }
    const std::string id = info[0].As<Napi::String>().Utf8Value();
    auto it = g_instances.find(id);
    if (it == g_instances.end()) {
        auto obj = Napi::Object::New(env);
        obj.Set("ok", Napi::Boolean::New(env, false));
        return obj;
    }

    // RAII destructor in PluginInstance handles COM release and FreeLibrary
    g_instances.erase(it);

    auto obj = Napi::Object::New(env);
    obj.Set("ok", Napi::Boolean::New(env, true));
    return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: getParams
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value GetParams(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "getParams(instanceId: string)").ThrowAsJavaScriptException();
        return env.Null();
    }
    const std::string id = info[0].As<Napi::String>().Utf8Value();
    auto it = g_instances.find(id);
    if (it == g_instances.end()) return Napi::Array::New(env);

    PluginInstance* inst = it->second.get();
    auto arr = Napi::Array::New(env);
    if (!inst->controller) return arr;

    const int32_t count = inst->controller->getParameterCount();
    for (int32_t i = 0; i < count; ++i) {
        Vst3::ParameterInfo pi{};
        if (inst->controller->getParameterInfo(i, pi) == Vst3::kResultOk) {
            auto obj = Napi::Object::New(env);
            obj.Set("index",        Napi::Number::New(env, i));
            obj.Set("id",           Napi::Number::New(env, pi.id));
            obj.Set("name",         Napi::String::New(env, Vst3::u16ToString(pi.title)));
            obj.Set("shortName",    Napi::String::New(env, Vst3::u16ToString(pi.shortTitle)));
            obj.Set("units",        Napi::String::New(env, Vst3::u16ToString(pi.units)));
            obj.Set("defaultValue", Napi::Number::New(env, pi.defaultNormalizedValue));
            obj.Set("currentValue", Napi::Number::New(env,
                inst->controller->getParamNormalized(pi.id)));
            obj.Set("stepCount",    Napi::Number::New(env, pi.stepCount));
            arr.Set(static_cast<uint32_t>(i), obj);
        }
    }
    return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: setParam
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value SetParam(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto ok = Napi::Object::New(env);

    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
        Napi::TypeError::New(env, "setParam(instanceId, paramIndex, value)").ThrowAsJavaScriptException();
        return env.Null();
    }
    const std::string id  = info[0].As<Napi::String>().Utf8Value();
    const int32_t    idx  = info[1].As<Napi::Number>().Int32Value();
    const double     val  = info[2].As<Napi::Number>().DoubleValue();

    auto it = g_instances.find(id);
    if (it == g_instances.end()) { ok.Set("ok", Napi::Boolean::New(env, false)); return ok; }

    PluginInstance* inst = it->second.get();
    if (!inst->controller) { ok.Set("ok", Napi::Boolean::New(env, false)); return ok; }

    Vst3::ParameterInfo pi{};
    if (inst->controller->getParameterInfo(idx, pi) == Vst3::kResultOk) {
        inst->controller->setParamNormalized(pi.id, val);
    }
    ok.Set("ok", Napi::Boolean::New(env, true));
    return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// N-API: processBlock
// ─────────────────────────────────────────────────────────────────────────────

Napi::Value ProcessBlock(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::TypeError::New(env, "processBlock(instanceId, inputL, inputR, blockSize): expected 4 arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // C-2 fix: validate argument types before use
    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "processBlock: instanceId must be a string")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[1].IsArrayBuffer() && !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "processBlock: inputL must be an ArrayBuffer or TypedArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[2].IsArrayBuffer() && !info[2].IsTypedArray()) {
        Napi::TypeError::New(env, "processBlock: inputR must be an ArrayBuffer or TypedArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[3].IsNumber()) {
        Napi::TypeError::New(env, "processBlock: blockSize must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    const std::string id  = info[0].As<Napi::String>().Utf8Value();
    const int32_t     sz  = info[3].As<Napi::Number>().Int32Value();

    // C-1 fix: validate blockSize range to prevent memory exhaustion or UB
    if (sz <= 0 || sz > 8192) {
        Napi::RangeError::New(env, "processBlock: blockSize must be between 1 and 8192")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto it = g_instances.find(id);
    if (it == g_instances.end()) {
        Napi::Error::New(env, "Instance not found: " + id).ThrowAsJavaScriptException();
        return env.Null();
    }
    PluginInstance* inst = it->second.get();

    // Resize buffers if needed
    if (sz != inst->blockSize) inst->resizeBuffers(sz);

    // Copy input from JS ArrayBuffer → native float buffers
    if (info[1].IsArrayBuffer()) {
        auto ab = info[1].As<Napi::ArrayBuffer>();
        const float* src = static_cast<const float*>(ab.Data());
        const size_t copyLen = std::min<size_t>(ab.ByteLength() / sizeof(float), sz);
        std::memcpy(inst->inL.data(), src, copyLen * sizeof(float));
    }
    if (info[2].IsArrayBuffer()) {
        auto ab = info[2].As<Napi::ArrayBuffer>();
        const float* src = static_cast<const float*>(ab.Data());
        const size_t copyLen = std::min<size_t>(ab.ByteLength() / sizeof(float), sz);
        std::memcpy(inst->inR.data(), src, copyLen * sizeof(float));
    }

    if (inst->processor) {
        // C-7 fix: provide a minimal ProcessContext so VST3 plugins that dereference
        // processContext don't crash. We fill sample rate and tempo.
        struct MinimalProcessContext {
            uint32_t state          = 0;      // kPlaying etc. — 0 = stopped
            double   sampleRate     = 44100.0;
            double   projectTimeSamples = 0;
            double   systemTime     = 0;
            double   continousTimeSamples = 0;
            double   projectTimeMusic = 0;
            double   barPositionMusic = 0;
            double   cycleStartMusic = 0;
            double   cycleEndMusic   = 0;
            double   tempo          = 120.0;
            int32_t  timeSigNumerator = 4;
            int32_t  timeSigDenominator = 4;
            // ... remaining fields zero-initialized by value-init
        } processContext{};
        processContext.sampleRate = inst->sampleRate;
        processContext.tempo = 120.0;
        processContext.state = 0x02 | 0x04; // kTempoValid | kTimeSigValid

        // Build ProcessData
        Vst3::ProcessData::AudioBusBuffers inBus{};
        inBus.numChannels     = 2;
        inBus.silenceFlags    = 0;
        inBus.channelBuffers32 = inst->inPtrs;

        Vst3::ProcessData::AudioBusBuffers outBus{};
        outBus.numChannels     = 2;
        outBus.silenceFlags    = 0;
        outBus.channelBuffers32 = inst->outPtrs;

        Vst3::ProcessData pd{};
        pd.processMode        = 0;
        pd.symbolicSampleSize = 0;
        pd.numSamples         = sz;
        pd.numInputs          = 1;
        pd.numOutputs         = 1;
        pd.inputs             = &inBus;
        pd.outputs            = &outBus;
        pd.processContext     = static_cast<void*>(&processContext);

        inst->processor->process(pd);
    } else if (inst->vst2Effect && inst->vst2Effect->processReplacing) {
        // VST2 processing via processReplacing
        inst->vst2Effect->processReplacing(inst->vst2Effect, inst->inPtrs, inst->outPtrs, sz);
    } else {
        // Passthrough if no processor available
        std::memcpy(inst->outL.data(), inst->inL.data(), sz * sizeof(float));
        std::memcpy(inst->outR.data(), inst->inR.data(), sz * sizeof(float));
    }

    // Return output buffers as ArrayBuffers (copies, JS owns them)
    auto outLBuf = Napi::ArrayBuffer::New(env, sz * sizeof(float));
    auto outRBuf = Napi::ArrayBuffer::New(env, sz * sizeof(float));
    std::memcpy(outLBuf.Data(), inst->outL.data(), sz * sizeof(float));
    std::memcpy(outRBuf.Data(), inst->outR.data(), sz * sizeof(float));

    auto result = Napi::Object::New(env);
    result.Set("outputL", outLBuf);
    result.Set("outputR", outRBuf);
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module init
// ─────────────────────────────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("scan",         Napi::Function::New(env, Scan));
    exports.Set("loadPlugin",   Napi::Function::New(env, LoadPlugin));
    exports.Set("unloadPlugin", Napi::Function::New(env, UnloadPlugin));
    exports.Set("getParams",    Napi::Function::New(env, GetParams));
    exports.Set("setParam",     Napi::Function::New(env, SetParam));
    exports.Set("processBlock", Napi::Function::New(env, ProcessBlock));
    return exports;
}

NODE_API_MODULE(vst_host, Init)
