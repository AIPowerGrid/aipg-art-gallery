// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package videosource

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestPreparedSoundPreservesSelectedPCMWindow(t *testing.T) {
	source := make([]byte, 44+96000*4)
	copy(source, "RIFF")
	binary.LittleEndian.PutUint32(source[4:], uint32(len(source)-8))
	copy(source[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(source[16:], 16)
	binary.LittleEndian.PutUint16(source[20:], 1)
	binary.LittleEndian.PutUint16(source[22:], 2)
	binary.LittleEndian.PutUint32(source[24:], 48000)
	binary.LittleEndian.PutUint32(source[28:], 192000)
	binary.LittleEndian.PutUint16(source[32:], 4)
	binary.LittleEndian.PutUint16(source[34:], 16)
	copy(source[36:], "data")
	binary.LittleEndian.PutUint32(source[40:], uint32(len(source)-44))
	for frame := 0; frame < 96000; frame++ {
		binary.LittleEndian.PutUint16(source[44+frame*4:], uint16(frame%16000))
		binary.LittleEndian.PutUint16(source[46+frame*4:], uint16(16000-frame%16000))
	}
	result, err := Prepare(context.Background(), bytes.NewReader(source), Options{Mode: "audio", Frames: 33, Width: 512, Height: 512, StartSeconds: 0.25})
	if err != nil {
		t.Fatal(err)
	}
	normalized, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(result.Audio, "data:audio/wav;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	for offset := 12; offset+8 <= len(normalized); {
		size := int(binary.LittleEndian.Uint32(normalized[offset+4:]))
		start := offset + 8
		if size > len(normalized)-start {
			t.Fatal("invalid WAV chunk")
		}
		if string(normalized[offset:offset+4]) == "data" {
			if !bytes.Equal(normalized[start:start+size], source[44+12000*4:44+(12000+66000)*4]) {
				t.Fatal("selected source sound was shifted, padded or altered")
			}
			return
		}
		offset = start + size + size%2
	}
	t.Fatal("no normalized soundtrack")
}

func fixture(t *testing.T, video, sound bool) []byte {
	t.Helper()
	if !Available() {
		t.Fatal("FFmpeg and ffprobe are required for source preparation verification")
	}
	path := filepath.Join(t.TempDir(), "fixture.wav")
	args := []string{"-nostdin", "-v", "error", "-y"}
	if video {
		path = filepath.Join(t.TempDir(), "fixture.mp4")
		args = append(args, "-f", "lavfi", "-i", "testsrc2=size=128x96:rate=24:duration=2")
	}
	if sound {
		args = append(args, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2")
	}
	if video {
		args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p")
	}
	if sound {
		if video {
			args = append(args, "-c:a", "aac")
		} else {
			args = append(args, "-c:a", "pcm_s16le")
		}
	}
	args = append(args, path)
	if output, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture generation: %v %s", err, output)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestPrepareExactAudioAndVideo(t *testing.T) {
	for _, mode := range []string{"audio", "video"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("TMPDIR", root)
			source := fixture(t, mode == "video", true)
			options := Options{Mode: mode, Frames: 33, Width: 512, Height: 512, StartSeconds: 0.25}
			result, err := Prepare(context.Background(), bytes.NewReader(source), options)
			if err != nil {
				t.Fatal(err)
			}
			audio, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(result.Audio, "data:audio/wav;base64,"))
			if err != nil || !exactWAV(audio, 66000) {
				t.Fatal("soundtrack not exact stereo48k PCM16")
			}
			if result.Frames != 33 || result.StartSeconds != 0.25 || result.Width != 512 || result.Height != 512 {
				t.Fatal("preparation commitments changed")
			}
			if mode == "video" {
				if !strings.HasPrefix(result.Video, "data:video/mp4;base64,") {
					t.Fatal("missing normalized motion")
				}
			} else if result.Video != "" {
				t.Fatal("audio mode invented a video guide")
			}
			files, _ := filepath.Glob(filepath.Join(root, "gallery-video-source-*"))
			if len(files) != 0 {
				t.Fatal("private source temp files retained")
			}
		})
	}
}

func TestPrepareRejectsShortSilentInvalidAndRemoteSources(t *testing.T) {
	audio := fixture(t, false, true)
	videoWithoutAudio := fixture(t, true, false)
	for _, item := range []struct {
		name  string
		data  []byte
		mode  string
		start float64
	}{
		{"short-audio", audio, "audio", 1},
		{"silent-video", videoWithoutAudio, "video", 0},
		{"malformed", []byte("not media"), "audio", 0},
		{"playlist", []byte("#EXTM3U\nhttp://127.0.0.1:9/private\n"), "video", 0},
	} {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("TMPDIR", root)
			result, err := Prepare(context.Background(), bytes.NewReader(item.data), Options{Mode: item.mode, Frames: 33, Width: 512, Height: 512, StartSeconds: item.start})
			if err == nil || result.Audio != "" || result.Video != "" {
				t.Fatal("invalid/short source admitted or partial private output returned")
			}
			files, _ := filepath.Glob(filepath.Join(root, "gallery-video-source-*"))
			if len(files) != 0 {
				t.Fatal("failed preparation retained private media")
			}
		})
	}
}

func TestOptionsRejectNonfiniteAndUnsupportedGeometry(t *testing.T) {
	valid := Options{Mode: "video", Frames: 33, Width: 512, Height: 512}
	if !valid.Valid() {
		t.Fatal("valid source rejected")
	}
	for _, change := range []func(*Options){
		func(o *Options) { o.StartSeconds = math.NaN() }, func(o *Options) { o.StartSeconds = math.Inf(1) },
		func(o *Options) { o.StartSeconds = -1 }, func(o *Options) { o.StartSeconds = 601 },
		func(o *Options) { o.Width = 960; o.Height = 544 }, func(o *Options) { o.Frames = 32 },
		func(o *Options) { o.Mode = "url" }, func(o *Options) { o.Width = 4096 },
	} {
		copy := valid
		change(&copy)
		if copy.Valid() {
			t.Fatal("invalid preparation settings accepted")
		}
	}
}

func TestPreparationConcurrencyAndCancellation(t *testing.T) {
	slots <- struct{}{}
	slots <- struct{}{}
	_, err := Prepare(context.Background(), strings.NewReader("x"), Options{Mode: "audio", Frames: 33, Width: 512, Height: 512})
	<-slots
	<-slots
	if err != ErrBusy {
		t.Fatal("busy preparation not rejected")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = Prepare(ctx, strings.NewReader("x"), Options{Mode: "audio", Frames: 33, Width: 512, Height: 512})
	if err == nil {
		t.Fatal("cancelled preparation accepted")
	}
}
