#version 450

// Unlit vertex shader (M2.5.1 triangle pipeline)
// Inputs mirror the Vertex struct in Mesh.h: position (0), normal (1), uv (2).

layout(location = 0) in  vec3 inPosition;
layout(location = 1) in  vec3 inNormal;
layout(location = 2) in  vec2 inUV;

layout(location = 0) out vec3 outColor;
layout(location = 1) out vec2 outUV;

// Push constant: combined model-view-projection matrix (column-major, row 0..3)
layout(push_constant) uniform PC {
    mat4 mvp;
} pc;

void main() {
    gl_Position = pc.mvp * vec4(inPosition, 1.0);
    // Pass normal-as-colour for quick visual debugging (no lighting yet)
    outColor = inNormal * 0.5 + 0.5;
    outUV    = inUV;
}
