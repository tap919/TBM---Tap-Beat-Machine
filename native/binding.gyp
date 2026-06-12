{
  "targets": [
    {
      "target_name": "vst-host",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [
        "src/vst-host.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "../vst3sdk"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NOMINMAX",
        "WIN32_LEAN_AND_MEAN"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeTypeInfo": "true",
              "AdditionalOptions": [ "/std:c++17", "/EHsc" ]
            }
          },
          "libraries": []
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": [ "-std=c++17", "-fexceptions" ]
        }]
      ]
    },
    {
      "target_name": "audio-backend",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [
        "src/audio-backend.cpp",
        "deps/RtAudio.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NOMINMAX",
        "WIN32_LEAN_AND_MEAN"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "__WINDOWS_WASAPI__",
            "__WINDOWS_DS__"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeTypeInfo": "true",
              "AdditionalOptions": [ "/std:c++17", "/EHsc" ]
            }
          },
          "libraries": [
            "-lole32",
            "-lwinmm",
            "-lksuser",
            "-lmfplat",
            "-lmfuuid",
            "-lwmcodecdspuuid",
            "-ldsound"
          ]
        }],
        ["OS=='mac'", {
          "defines": [
            "__MACOSX_CORE__"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          },
          "libraries": [
            "-framework CoreAudio",
            "-framework CoreFoundation"
          ]
        }],
        ["OS=='linux'", {
          "defines": [
            "__LINUX_ALSA__",
            "__LINUX_PULSE__"
          ],
          "cflags_cc": [ "-std=c++17", "-fexceptions" ],
          "libraries": [
            "-lasound",
            "-lpulse-simple",
            "-lpulse",
            "-lpthread"
          ]
        }]
      ]
    }
  ]
}
