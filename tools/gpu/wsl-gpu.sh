# Let headless Chrome inside WSL2 draw on the Windows GPU. Source it before rendering:
#
#   source tools/gpu/wsl-gpu.sh
#
# Chrome reaches the GPU through ANGLE → OpenGL (EGL) → Mesa's d3d12 driver → Direct3D 12 → the Windows
# driver. Besides these variables it needs the flags
#   --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu-rasterization
# (papermotion's `render-parallel.ts --gpu` sets everything itself; other renderers can read
# EXTRA_CHROME_FLAGS below). Without the variables Chrome silently falls back to software rendering
# (llvmpipe or SwiftShader): check with `node tools/gpu/probe.mjs`.
export LD_LIBRARY_PATH="/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GALLIUM_DRIVER=d3d12
export MESA_D3D12_DEFAULT_ADAPTER_NAME="${MESA_D3D12_DEFAULT_ADAPTER_NAME:-NVIDIA}"
export EXTRA_CHROME_FLAGS="${EXTRA_CHROME_FLAGS:---use-gl=angle}"
