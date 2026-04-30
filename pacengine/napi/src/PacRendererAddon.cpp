#include <napi.h>
#include <memory>
#include "PacRenderer.h"
#include "PacDataWorld.h"
#include "PacWorldImporter.h"
#include "../../simulation/PacSimulation.h"

namespace {

static std::unique_ptr<pac::render::PacRenderer>   g_renderer;
static std::unique_ptr<pac::render::PacSimulation> g_simulation;
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
    if (!g_simulation) g_simulation = std::make_unique<pac::render::PacSimulation>();
    g_initialized = g_renderer->Initialize(nullptr,
        info[0].As<Napi::Number>().Uint32Value(),
        info[1].As<Napi::Number>().Uint32Value());
    g_frameCount = 0;
    return Napi::Boolean::New(env, g_initialized);
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    if (g_renderer) { g_renderer->Shutdown(); g_initialized = false; g_frameCount = 0; }
    g_simulation.reset();
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
    // Pass simulation pointer so importer calls m_simulation->LoadWorld()
    pac::render::PacWorldImporter importer(g_renderer.get(), g_simulation.get());
    bool ok = importer.Import(info[0].As<Napi::String>().Utf8Value());
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
// Fetches the current simulation snapshot and forwards it to the renderer.
Napi::Value UpdateSimulationState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "updateSimulationState({ entityCount, tickIndex })")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (!g_renderer || !g_initialized) return env.Undefined();

    if (g_simulation && g_simulation->IsLoaded()) {
        pac::render::PacDataWorld snap = g_simulation->GetEntitySnapshot();
        g_renderer->UpdateSimulationState(snap);
    } else {
        // Fallback: empty world (no-op visual update)
        pac::render::PacDataWorld world{};
        g_renderer->UpdateSimulationState(world);
    }
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

// ─── M3 tick bindings ─────────────────────────────────────────────────────────

// stepTick(dt?: number) → { tickCount, elapsedSeconds }
// Advances the simulation by dt seconds (default 1/20 = 50 ms).
Napi::Value StepTick(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    float dt = 0.05f; // default 20 Hz
    if (info.Length() >= 1 && info[0].IsNumber()) {
        dt = info[0].As<Napi::Number>().FloatValue();
    }

    if (g_simulation && g_simulation->IsLoaded()) {
        g_simulation->Tick(dt);

        // Immediately push the new state to the renderer so the frame loop
        // sees updated transforms without needing a separate updateState call.
        if (g_renderer && g_initialized) {
            pac::render::PacDataWorld snap = g_simulation->GetEntitySnapshot();
            g_renderer->UpdateSimulationState(snap);
        }
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("tickCount",      Napi::Number::New(env,
        g_simulation ? static_cast<double>(g_simulation->TickCount()) : 0.0));
    result.Set("elapsedSeconds", Napi::Number::New(env,
        g_simulation ? static_cast<double>(g_simulation->ElapsedSeconds()) : 0.0));
    result.Set("simLoaded",      Napi::Boolean::New(env,
        g_simulation ? g_simulation->IsLoaded() : false));
    return result;
}

// getEntitySnapshot() → { entities: Array<{id, x, y, z}>, tickCount, elapsedSeconds }
Napi::Value GetEntitySnapshot(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    if (!g_simulation || !g_simulation->IsLoaded()) {
        result.Set("entities",      Napi::Array::New(env, 0));
        result.Set("tickCount",     Napi::Number::New(env, 0));
        result.Set("elapsedSeconds",Napi::Number::New(env, 0));
        result.Set("simLoaded",     Napi::Boolean::New(env, false));
        return result;
    }

    const pac::render::PacDataWorld snap = g_simulation->GetEntitySnapshot();
    Napi::Array entities = Napi::Array::New(env, snap.entities.size());
    for (std::size_t i = 0; i < snap.entities.size(); ++i) {
        const auto& ent = snap.entities[i];
        Napi::Object e = Napi::Object::New(env);
        e.Set("id", Napi::Number::New(env, static_cast<double>(ent.id)));
        e.Set("x",  Napi::Number::New(env, ent.transform.position.x));
        e.Set("y",  Napi::Number::New(env, ent.transform.position.y));
        e.Set("z",  Napi::Number::New(env, ent.transform.position.z));
        entities.Set(i, e);
    }
    result.Set("entities",       entities);
    result.Set("tickCount",      Napi::Number::New(env, static_cast<double>(g_simulation->TickCount())));
    result.Set("elapsedSeconds", Napi::Number::New(env, static_cast<double>(g_simulation->ElapsedSeconds())));
    result.Set("simLoaded",      Napi::Boolean::New(env, true));
    return result;
}

// ─── startTick / stopTick ─────────────────────────────────────────────────────
// These are thin controls over a boolean flag; the actual interval loop lives
// in JavaScript (setInterval at the configured Hz).  They exist in the native
// layer so callers can interrogate the running state without a JS round-trip.

static bool g_tickRunning = false;

// startTick(hz?: number) → { running: true }
// Records that a tick loop has started (hz stored for diagnostic purposes).
Napi::Value StartTick(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    float hz = 20.f;
    if (info.Length() >= 1 && info[0].IsNumber())
        hz = info[0].As<Napi::Number>().FloatValue();
    g_tickRunning = true;
    std::printf("[PacSimulation] startTick — %.0f Hz\n", hz);
    Napi::Object result = Napi::Object::New(env);
    result.Set("running", Napi::Boolean::New(env, true));
    result.Set("hz",      Napi::Number::New(env, hz));
    return result;
}

// stopTick() → { running: false }
Napi::Value StopTick(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    g_tickRunning = false;
    std::printf("[PacSimulation] stopTick\n");
    Napi::Object result = Napi::Object::New(env);
    result.Set("running", Napi::Boolean::New(env, false));
    return result;
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
    // M3 tick bindings
    exports.Set("startTick",             Napi::Function::New(env, StartTick));
    exports.Set("stopTick",              Napi::Function::New(env, StopTick));
    exports.Set("stepTick",              Napi::Function::New(env, StepTick));
    exports.Set("getEntitySnapshot",     Napi::Function::New(env, GetEntitySnapshot));
    return exports;
}

} // namespace

NODE_API_MODULE(pacrenderer, Init)
