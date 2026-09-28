# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Flag single-frame glitches in a rendered frame folder: a frame that differs from both neighbours while
the neighbours match each other (e.g. a stale GPU texture drawn for one frame). Camera moves and cuts
change both pairs, so they don't trip it.

    uv run glitch_scan.py out/frames/<name> [--threshold 2.0] [--ratio 3.0]
"""
import argparse
import glob

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--threshold', type=float, default=2.0, help='min mean abs difference (0-255) to both neighbours')
ap.add_argument('--ratio', type=float, default=3.0, help='how much larger than the neighbours-to-each-other difference')
a = ap.parse_args()
files = sorted(glob.glob(a.dir + '/f*.jpg'))
small = [np.asarray(Image.open(f).convert('L').resize((320, 180)), dtype=np.float32) for f in files]
diff = lambda i, j: float(np.mean(np.abs(small[i] - small[j])))
flags = []
for n in range(1, len(small) - 1):
    before, after, across = diff(n - 1, n), diff(n, n + 1), diff(n - 1, n + 1)
    if min(before, after) > a.threshold and min(before, after) > a.ratio * max(across, 0.5):
        flags.append(f'frame {n} ({files[n].split("/")[-1]}): {before:.1f}/{after:.1f} vs {across:.1f}')
print(f'{len(files)} frames scanned; suspicious: ' + ('none' if not flags else '\n  ' + '\n  '.join(flags)))
