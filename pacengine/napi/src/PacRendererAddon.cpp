#include <napi.h>
#include <memory>
#include "PacRenderer.h"
#include "PacDataWorld.h"

namespace {

static std::unique_ptr<pac::render::PacRenderer> g_renderer;
static bool     g_initialized = false;
static uint64_t g_frameCount  = 0;

Napi::Value Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "initialize(width: number, height: number)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer) g_renderer = std::make_unique<pac::render::PacRenderer>();
    g_initialized = g_renderer->Initialize(nullptr,
        info[0].As<Napi::Number>().Uint32Value(),
        info[1].As<Napi::Number>().Uint32Value());
    g_frameCount = 0;
    return Napi::Boolean::New(env, g_initialized);
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    if (g_renderer) { g_renderer->Shutdown(); g_initialized = false; g_frameCount = 0; }
    return info.Env().Undefined();
}

Napi::Value ImportExport(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "importExport(folderPath: string)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer || !g_initialized) {
        Napi::Error::New(env, "Renderer not initialized").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    bool ok = g_renderer->ImportPacAiExport(info[0].As<Napi::String>().Utf8Value());
    Napi::Object result = Napi::Object::New(env);
    result.Set("success",      Napi::Boolean::New(env, ok));
    result.Set("entities",     Napi::Number::New(env, static_cast<double>(g_renderer->GetEntityCount())));
    result.Set("staticMeshes", Napi::Number::New(env, static_cast<double>(g_renderer->GetStaticMeshCount())));
    return result;
}

Napi::Value BeginFrame(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) g_renderer->BeginFrame();
    return info.Env().Undefined();
}

Napi::Value Render(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) g_renderer->Render();
    return info.Env().Undefined();
}

Napi::Value EndFrame(const Napi::CallbackInfo& info) {
    if (g_renderer && g_initialized) { g_renderer->EndFrame(); ++g_frameCount; }
    return info.Env().Undefined();
}

Napi::Value Resize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "resize(width: number, height: number)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (g_renderer) g_renderer->Resize(info[0].As<Napi::Number>().Uint32Value(),
                                        info[1].As<Napi::Number>().Uint32Value());
    return env.Undefined();
}

Napi::Value SetViewportMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setViewportMode(use3D: boolean)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (g_renderer) g_renderer->SetViewportMode(info[0].As<Napi::Boolean>().Value());
    return env.Undefined();
}

// updateSimulationState({ entityCount, tickIndex }) → undefined
// Constructs a minimal PacDataWorld and forwards to PacRenderer::UpdateSimulationState.
// Full entity data sync is M3 (PacCore integration).
Napi::Value UpdateSimulationState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "updateSimulationState({ entityCount, tickIndex })")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer || !g_initialized) return env.Undefined();

    Napi::Object obj = info[0].As<Napi::Object>();
    int entityCount = obj.Has("entityCount") ? obj.Get("entityCount").As<Napi::Number>().Int32Value() : 0;
    (void)entityCount; // used by M3 when PacDataWorld carries real entity data

    pac::PacDataWorld world{};
    g_renderer->UpdateSimulationState(world);
    return env.Undefined();
}

// setCamera({ position: [x,y,z], target: [x,y,z], fov?: number }) → undefined
Napi::Value SetCamera(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "setCamera({ position, target, fov? })")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer || !g_initialized) return env.Undefined();

    Napi::Object obj = info[0].As<Napi::Object>();
    auto readVec = [&](const char* key) -> pac::render::PacVec3 {
        if (!obj.Has(key)) return {0.f, 0.f, 0.f};
        Napi::Array arr = obj.Get(key).As<Napi::Array>();
        return { arr.Get(0u).As<Napi::Number>().FloatValue(),
                 arr.Get(1u).As<Napi::Number>().FloatValue(),
                 arr.Get(2u).As<Napi::Number>().FloatValue() };
    };
    float fov = obj.Has("fov") ? obj.Get("fov").As<Napi::Number>().FloatValue() : 60.f;
    g_renderer->SetCamera(readVec("position"), readVec("target"), fov);
    return env.Undefined();
}

Napi::Value GetFrameCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(g_frameCount));
}

Napi::Value IsInitialized(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_initialized);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initialize",             Napi::Function::New(env, Initialize));
    exports.Set("shutdown",               Napi::Function::New(env, Shutdown));
    exports.Set("importExport",           Napi::Function::New(env, ImportExport));
    exports.Set("beginFrame",             Napi::Function::New(env, BeginFrame));
    exports.Set("render",                 Napi::Function::New(env, Render));
    exports.Set("endFrame",               Napi::Function::New(env, EndFrame));
    exports.Set("resize",                 Napi::Function::New(env, Resize));
    exports.Set("setViewportMode",        Napi::Function::New(env, SetViewportMode));
    exports.Set("updateSimulationState",  Napi::Function::New(env, UpdateSimulationState));
    exports.Set("setCamera",              Napi::Function::New(env, SetCamera));
    exports.Set("getFrameCount",          Napi::Function::New(env, GetFrameCount));
    exports.Set("isInitialized",          Napi::Function::New(env, IsInitialized));
    return exports;
}

} // namespace

NODE_API_MODULE(pacrenderer, Init)
