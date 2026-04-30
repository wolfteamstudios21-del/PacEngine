// pacengine/napi/index.js
// Tries to load the compiled native addon; falls back to a pure-JS stub so
// the API server starts cleanly even when node-gyp has not been run.
"use strict";

let native = null;

const candidates = [
  // Built by `pnpm --filter @workspace/pacengine-napi run build` (node-gyp)
  `${__dirname}/build/Release/pacrenderer.node`,
];

for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // not built yet — continue
  }
}

const stub = {
  initialize:      (_w, _h) => false,
  shutdown:        ()        => {},
  importExport:    (_p)      => ({ success: false, entities: 0, staticMeshes: 0 }),
  beginFrame:      ()        => {},
  render:          ()        => {},
  endFrame:        ()        => {},
  resize:          (_w, _h)  => {},
  setViewportMode: (_use3D)  => {},
  getFrameCount:   ()        => 0,
  isInitialized:   ()        => false,
};

/** @type {typeof stub} */
const addon  = native ?? stub;
const isNative = native !== null;

module.exports = { addon, isNative };
