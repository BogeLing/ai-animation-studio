# Cloud rendering: when it's worth it and how to size it

All numbers below were measured on a 50 s film (1200–1500 frames, 1080p) unless marked as an estimate. Prices were checked in September 2026; re-check before quoting them.

## The workload

- **One page (one headless Chrome tab) renders on one core.** Canvas 2D software rasterization is
  single-threaded: ~1.2–1.4 s per frame whether the page gets 1 or 6 vCPUs.
  - Extra vCPUs only speed up startup: launch plus load went from 2.3 s to 0.7 s.
- **Memory is never the limit.** The first page peaks at ~0.56 GB, and each extra page in the same
  browser adds ~0.25 GB.
- **Pages = vCPUs is optimal.** More pages than vCPUs is slower (4 vCPU: 4 pages 1.89 fps, 8 pages
  1.44 fps), and 2 pages on 1 vCPU gain nothing.
- **Seeking is free**: simulating 1190 steps without drawing takes 30–80 ms. So any worker can start
  anywhere, and a film splits into contiguous chunks that are concatenated with `-c copy`.
- **Encoding**: x264 `slow` costs ~0.45 s/frame at 1 vCPU, and `veryfast` ~0.1 s at the same size. Use
  `veryfast` for chunks in the cloud.
- **For comparison, the local laptop** (a 6 GB RTX 3060 through WSL, 6 GPU workers) does ~16 fps, so 50 s
  of video takes ~2 min. Matching it takes about 20 cloud vCPUs.

## Platforms

| | Lambda | Cloud Run Jobs | Modal | Spot VM / Salad |
| --- | --- | --- | --- | --- |
| Compute sizing | memory buys CPU: 1769 MB = 1 vCPU, up to 10240 MB ≈ 6 vCPU | CPU and memory separate (4 vCPU needs ≥ 2 GiB) | per physical core (= 2 vCPU) | whole VMs / community PCs |
| ≈ $/vCPU-hour | ~0.104 (x86) | ~0.07 | ~0.024 + memory | Spot C4 ~0.026; Salad 0.005 |
| Free | 400k GB-s/month (≈ 120 renders) | 240k vCPU-s + 450k GiB-s/month (≈ 100 renders) | $30/month credit (≈ 1000 renders) | none |
| Startup | a few seconds (≈ 1.8 s to unpack Chromium) | **~74 s** warm, 3.5 min the first time (image pull) | 3–5 s (10–30 s the first time) | 30–90 s boot / minutes; can be preempted |
| Minimum billing | 1 ms | **1 min per instance** | per second | GCE 1 min; Salad per second, and startup is free |
| Caveats | new accounts may be capped at **10 concurrent** executions and 3008 MB | **x86 only**; GPU jobs need non-zonal L4 quota (only new projects get it automatically) | Starter plan: 100 containers, 10 GPUs | Salad runs on others' machines (privacy); GCE is 1 vCPU = hyperthread |

Measured on Cloud Run (AMD EPYC 7B13, Chrome 154): 1 vCPU = 1.17–1.20 s/frame, about the same as the
laptop, and 4 vCPU × 4 pages = 3.28 fps (3.9×).

Lambda specifics, validated in the official image:

- `@sparticuz/chromium` (v153) needs graphics mode **off**; the package default is ~25× slower here.
- It runs `--single-process`, so all pages of one browser share one thread. Use one browser per vCPU.
- The arm64 layer exists (since v135). The same JS function zip serves both architectures.

## Estimates for one 1200-frame render

| Plan | Wall time | Cost |
| --- | --- | --- |
| Local, 6 GPU workers | ~1.5–2 min | free |
| Lambda: 10 × 10240 MB × 6 browsers (fits concurrency 10) | ~66 s | ~$0.10 |
| Lambda: 100 × 1769 MB × 1 page | ~35 s | ~$0.08 |
| Cloud Run: 10 tasks × 4 vCPU | ~2 min (startup-bound) | ~$0.05 |
| Modal: 100 containers × 1 core | ~25 s (estimate) | ~$0.03 |
| Modal: 100 × 4 cores (400 pages) | ~15 s (estimate) | ~$0.07 |

Adding hardware stops helping below ~10–15 s. Container start, Chrome launch, the heaviest frames (~3 s
each) and the final stitch are fixed costs (Amdahl).

## Decision

- A few renders a month of a short film: local. The Lambda and Cloud Run free tiers also work if the laptop
  is busy.
- Fast turnaround for others, or bursts: Modal (seconds to start, wide `.map()` fan-out, and the credit covers it).
- Big batches that can be retried: Spot VMs. Salad only for content that isn't sensitive.
- GPU in the cloud: an L4 is about $0.67–0.80/h. It is only worth it if Chrome can use it headless (not yet
  verified) and one GPU replaces ~20 vCPUs.

## Emulate before deploying

`corepack pnpm bench <example> 1769 3008 4096 6144 10240` (from `engines/papermotion/`) runs one render
page under `systemd-run`
with CPUQuota = mem/1769 × 100%, MemoryMax = mem and no swap. It prints the per-frame time, CPU use and
throttling, and peak memory. This is how the single-thread and memory findings were found without any
cloud account. It can't tell you the cloud CPU's absolute speed, or anything about Arm.

## Account hygiene

- Ask which account and region before creating anything. The default local credentials may belong to a
  CI identity or another project.
- A GCP billing account may be capped at 5 linked projects. Reusing an existing project with a
  `papermotion-` prefix on every resource worked.
- Delete the test resources (jobs, image repositories, uploaded build sources, functions, layers, buckets,
  roles) and confirm by listing them.
