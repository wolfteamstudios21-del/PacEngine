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
            "<!@(node -e \"const fs=require('fs'),path=require('path');const env=process.env.PACENGINE_BUILD_DIR;const candidates=[env&&path.resolve(env,'render/libpacengine_render.a'),'../build/render/libpacengine_render.a','../build_smoke/render/libpacengine_render.a'].filter(Boolean);process.stdout.write(candidates.find(p=>fs.existsSync(p))||candidates[1])\")",
            "<!@(node -e \"const fs=require('fs'),path=require('path');const env=process.env.PACENGINE_BUILD_DIR;const candidates=[env&&path.resolve(env,'_deps/fastgltf-build/libfastgltf.a'),'../build/_deps/fastgltf-build/libfastgltf.a','../build_smoke/_deps/fastgltf-build/libfastgltf.a'].filter(Boolean);process.stdout.write(candidates.find(p=>fs.existsSync(p))||candidates[1])\")",
            "-lstdc++fs"
          ],
          "cflags_cc": ["-std=c++20", "-DHAVE_FASTGLTF=0", "-DHAVE_VULKAN=0"]
        }]
      ]
    }
  ]
}
