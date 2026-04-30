"use strict";

let native = null;

try {
  native = require(`${__dirname}/build/Release/pacrenderer.node`);
} catch {
  // addon not compiled — stub mode
}

const stub = {
  initialize:             (_w, _h)  => false,
  shutdown:               ()        => {},
  importExport:           (_p)      => ({ success: false, entities: 0, staticMeshes: 0 }),
  beginFrame:             ()        => {},
  render:                 ()        => {},
  endFrame:               ()        => {},
  resize:                 (_w, _h)  => {},
  setViewportMode:        (_use3D)  => {},
  updateSimulationState:  (_state)  => {},
  setCamera:              (_params) => {},
  getFrameCount:          ()        => 0,
  isInitialized:          ()        => false,
  // M3 tick bindings
  startTick:              (_hz)     => ({ running: true, hz: _hz ?? 20 }),
  stopTick:               ()        => ({ running: false }),
  stepTick:               (_dt)     => ({ tickCount: 0, elapsedSeconds: 0, simLoaded: false }),
  getEntitySnapshot:      ()        => ({ entities: [], tickCount: 0, elapsedSeconds: 0, simLoaded: false }),
};

const addon    = native ?? stub;
const isNative = native !== null;

module.exports = { addon, isNative };
