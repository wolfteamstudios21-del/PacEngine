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
};

const addon    = native ?? stub;
const isNative = native !== null;

module.exports = { addon, isNative };
