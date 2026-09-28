#!/usr/bin/env python3
"""Count the frames already encoded into an MP4 that is still being written.

A render that pipes frames to ffmpeg shows no progress if its output is buffered, and the MP4 can't be
probed until it is finished. This walks the H.264 slices in the growing `mdat` box instead. The encoder
lags behind the renderer by its look-ahead (about 50–60 frames for x264 -preset slow).

It only reads video-only files written front to back (a render in progress). A finished file with sound
interleaves audio chunks in `mdat`; count those with `ffprobe -count_frames` instead.

    python3 tools/video/count_frames.py out/film.mp4
"""
import struct
import sys


def count(path: str) -> int:
    data = open(path, 'rb').read()
    i, mdat = 0, None
    while i + 8 <= len(data):
        size, kind = struct.unpack('>I4s', data[i:i + 8])
        if kind == b'mdat':
            mdat = i + (16 if size == 1 else 8)
            break
        if size < 8:
            break
        i += size
    if mdat is None:
        return 0
    p, frames = mdat, 0
    while p + 5 <= len(data):
        n = struct.unpack('>I', data[p:p + 4])[0]
        if n == 0 or p + 4 + n > len(data):
            break
        if data[p + 4] & 0x1F in (1, 5):   # a coded slice (x264 writes one per frame by default)
            frames += 1
        p += 4 + n
    return frames


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    n = count(sys.argv[1])
    print(n)
    if n < 5:
        print('(few or no slices found: if the file has sound or is finished, use ffprobe -count_frames)', file=sys.stderr)
