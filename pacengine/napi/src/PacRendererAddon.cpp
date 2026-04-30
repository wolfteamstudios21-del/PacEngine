// PacRendererAddon.cpp — N-API bridge: Node.js ↔ PacEngine C++ render layer
//
// Exposes PacRenderer as a Node.js native addon (M2.5.3).
//
// On Replit (no GPU/display): windowHandle is nullptr, the stub Vulkan backend
// is active, and BeginFrame/Render/EndFrame are no-ops — but the entire call
// boundary, object lifecycle, and error propagation paths are exercised.
//
// Methods exposed to JS:
//   initialize(width, height)          → boolean
//   shutdown()                         → undefined
//   importExport(folderPath)           → { entities: number, staticMeshes: number }
//   beginFrame()                       → undefined
//   render()                           → undefined
//   endFrame()                         → undefined
//   resize(width, height)              → undefined
//   setViewportMode(use3D)             → undefined
//   getFrameCount()                    → number
//   isInitialized()                    → boolean

#include <napi.h>
#include <memory>
#include "PacRenderer.h"

namespace {

// Singleton renderer owned by this addon instance.
// A real multi-window editor would hold one per window; single-window suffices for M2.5.
static std::unique_ptr<pac::render::PacRenderer> g_renderer;
static bool  g_initialized  = false;
static uint64_t g_frameCount = 0;

// ── initialize(width: number, height: number) → boolean ──────────────────────
Napi::Value Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "initialize(width: number, height: number)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    uint32_t w = info[0].As<Napi::Number>().Uint32Value();
    uint32_t h = info[1].As<Napi::Number>().Uint32Value();

    if (!g_renderer) {
        g_renderer = std::make_unique<pac::render::PacRenderer>();
    }
    // windowHandle = nullptr → headless (Vulkan stub path on Replit)
    g_initialized = g_renderer->Initialize(nullptr, w, h);
    g_frameCount  = 0;
    return Napi::Boolean::New(env, g_initialized);
}

// ── shutdown() → undefined ────────────────────────────────────────────────────
Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    if (g_renderer) {
        g_renderer->Shutdown();
        g_initialized = false;
        g_frameCount  = 0;
    }
    return info.Env().Undefined();
}

// ── importExport(folderPath: string) → { entities: number, staticMeshes: number }
Napi::Value ImportExport(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "importExport(folderPath: string)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer || !g_initialized) {
        Napi::Error::New(env, "Renderer not initialized — call initialize() first")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string folder = info[0].As<Napi::String>().Utf8Value();
    bool ok = g_renderer->ImportPacAiExport(folder);

    int entities     = static_cast<int>(g_renderer->GetEntityCount());
    int staticMeshes = static_cast<int>(g_renderer->GetStaticMeshCount());

    Napi::Object result = Napi::Object::New(env);
    result.Set("success",      Napi::Boolean::New(env, ok));
    result.Set("entities",     Napi::Number::New(env, entities));
    result.Set("staticMeshes", Napi::Number::New(env, staticMeshes));
    return result;
}

// ── beginFrame() → undefined ─────────────────────────────────────────────────
Napi::Value BeginFrame(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) g_renderer->BeginFrame();
    return info.Env().Undefined();
}

// ── render() → undefined ─────────────────────────────────────────────────────
Napi::Value Render(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) g_renderer->Render();
    return info.Env().Undefined();
}

// ── endFrame() → undefined ────────────────────────────────────────────────────
Napi::Value EndFrame(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) {
        g_renderer->EndFrame();
        ++g_frameCount;
    }
    return info.Env().Undefined();
}

// ── resize(width: number, height: number) → undefined ────────────────────────
Napi::Value Resize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "resize(width: number, height: number)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (g_renderer) {
        g_renderer->Resize(info[0].As<Napi::Number>().Uint32Value(),
                           info[1].As<Napi::Number>().Uint32Value());
    }
    return env.Undefined();
}

// ── setViewportMode(use3D: boolean) → undefined ───────────────────────────────
Napi::Value SetViewportMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setViewportMode(use3D: boolean)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (g_renderer) {
        g_renderer->SetViewportMode(info[0].As<Napi::Boolean>().Value());
    }
    return env.Undefined();
}

// ── getFrameCount() → number ─────────────────────────────────────────────────
Napi::Value GetFrameCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(g_frameCount));
}

// ── isInitialized() → boolean ────────────────────────────────────────────────
Napi::Value IsInitialized(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_initialized);
}

// ── Module init ───────────────────────────────────────────────────────────────
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initialize",      Napi::Function::New(env, Initialize));
    exports.Set("shutdown",        Napi::Function::New(env, Shutdown));
    exports.Set("importExport",    Napi::Function::New(env, ImportExport));
    exports.Set("beginFrame",      Napi::Function::New(env, BeginFrame));
    exports.Set("render",          Napi::Function::New(env, Render));
    exports.Set("endFrame",        Napi::Function::New(env, EndFrame));
    exports.Set("resize",          Napi::Function::New(env, Resize));
    exports.Set("setViewportMode", Napi::Function::New(env, SetViewportMode));
    exports.Set("getFrameCount",   Napi::Function::New(env, GetFrameCount));
    exports.Set("isInitialized",   Napi::Function::New(env, IsInitialized));
    return exports;
}

} // namespace

NODE_API_MODULE(pacrenderer, Init)
