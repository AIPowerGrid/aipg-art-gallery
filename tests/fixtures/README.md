# Synthetic Video Fixture

`clip-81-frames.mp4` is a generated diagnostic pattern: 81 H.264 frames,
320x180, 24 fps, 3.375 seconds, without sound or user content. It tests decoded
browser playback and seeking, not model fidelity or a real paid generation.

Regenerate with FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=24:duration=3.375 -frames:v 81 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p -movflags +faststart clip-81-frames.mp4
```
