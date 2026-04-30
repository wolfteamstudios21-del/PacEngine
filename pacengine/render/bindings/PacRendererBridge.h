#pragma once
// C++ ↔ TypeScript bridge header.
// Phase 2.5.3 — implement using Node-API (node_api.h) or WebAssembly (Emscripten).
//
// Exposes a minimal surface to the JS engine:
//   pacrenderer_initialize(width, height)   → bool
//   pacrenderer_import(exportPath)          → bool
//   pacrenderer_set_camera(px,py,pz, tx,ty,tz, fov)
//   pacrenderer_begin_frame()
//   pacrenderer_render()
//   pacrenderer_end_frame()
//   pacrenderer_resize(w, h)
//   pacrenderer_shutdown()

#include <cstdint>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

bool     pacrenderer_initialize(uint32_t width, uint32_t height);
bool     pacrenderer_import(const char* exportPath);
void     pacrenderer_set_camera(float px, float py, float pz,
                                float tx, float ty, float tz, float fov);
void     pacrenderer_begin_frame(void);
void     pacrenderer_render(void);
void     pacrenderer_end_frame(void);
void     pacrenderer_resize(uint32_t width, uint32_t height);
void     pacrenderer_shutdown(void);

#ifdef __cplusplus
} // extern "C"
#endif
