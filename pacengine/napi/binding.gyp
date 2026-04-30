{
  "targets": [
    {
      "target_name": "pacrenderer",
      "sources": ["src/PacRendererAddon.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "../render/core",
        "../render/vendor",
        "../render/importer"
      ],
      "cflags!":    ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc":  ["-std=c++20"],
      "defines":    ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='linux'", {
          "libraries": [
            "<(module_root_dir)/../build_smoke/render/libpacengine_render.a",
            "<(module_root_dir)/../build_smoke/_deps/fastgltf-build/libfastgltf.a",
            "-lstdc++fs"
          ],
          "cflags_cc": ["-std=c++20", "-DHAVE_FASTGLTF=0", "-DHAVE_VULKAN=0"]
        }]
      ]
    }
  ]
}
