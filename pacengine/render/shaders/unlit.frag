#version 450

// Unlit fragment shader (M2.5.1 triangle pipeline)

layout(location = 0) in  vec3 inColor;
layout(location = 1) in  vec2 inUV;

layout(location = 0) out vec4 outFragColor;

void main() {
    outFragColor = vec4(inColor, 1.0);
}
