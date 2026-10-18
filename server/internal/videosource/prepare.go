// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

// Package videosource prepares bounded local uploads, never remote media URLs.
package videosource

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"time"
)

const MaxUploadBytes int64 = 64 * 1024 * 1024
const MaxFrames = 625
const formats = "mov,mp4,m4a,3gp,3g2,mj2,mp3,wav,flac,ogg,aac,matroska,webm"

var slots = make(chan struct{}, 2)
var ErrBusy = errors.New("Source preparation is busy. Try preparing the upload again shortly.")
var invalid = errors.New("Choose a supported audio or video file with enough sound and picture for the selected window.")

type Options struct {
	Mode                  string
	Frames, Width, Height int
	StartSeconds          float64
}

type Prepared struct {
	Audio        string  `json:"audio"`
	Video        string  `json:"video,omitempty"`
	Frames       int     `json:"frames"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	StartSeconds float64 `json:"startSeconds"`
}

func Available() bool {
	_, audio := exec.LookPath("ffmpeg")
	_, probe := exec.LookPath("ffprobe")
	if audio != nil || probe != nil {
		return false
	}
	if runtime.GOOS == "linux" {
		_, sandbox := exec.LookPath("bwrap")
		_, limits := exec.LookPath("prlimit")
		return sandbox == nil && limits == nil
	}
	return runtime.GOOS == "darwin" && os.Geteuid() != 0
}

func (o Options) Valid() bool {
	multiple := 32
	if o.Mode == "video" {
		multiple = 64
	}
	return (o.Mode == "audio" || o.Mode == "video") && o.Frames >= 9 && o.Frames <= MaxFrames && o.Frames%8 == 1 &&
		o.Width >= 256 && o.Height >= 256 && o.Width <= 960 && o.Height <= 960 && o.Width%multiple == 0 && o.Height%multiple == 0 &&
		o.Width*o.Height <= 960*544 && !math.IsNaN(o.StartSeconds) && !math.IsInf(o.StartSeconds, 0) && o.StartSeconds >= 0 && o.StartSeconds <= 600
}

type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 64*1024 {
		return 0, errors.New("media tool output exceeded limit")
	}
	return b.Buffer.Write(p)
}

func run(ctx context.Context, program, directory string, args ...string) ([]byte, error) {
	command, err := codecCommand(ctx, program, directory, args)
	if err != nil {
		return nil, invalid
	}
	var output, diagnostic boundedOutput
	command.Stdout, command.Stderr = &output, &diagnostic
	command.WaitDelay = time.Second
	if command.Run() != nil || diagnostic.Len() != 0 {
		return nil, invalid
	}
	return output.Bytes(), nil
}

type mediaInfo struct {
	Streams []struct {
		Type        string `json:"codec_type"`
		Codec       string `json:"codec_name"`
		FPS         string `json:"avg_frame_rate"`
		Start       string `json:"start_time"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
		Channels    int    `json:"channels"`
		Frames      string `json:"nb_read_frames"`
		Duration    string `json:"duration"`
		Disposition struct {
			Attached int `json:"attached_pic"`
		} `json:"disposition"`
	} `json:"streams"`
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

func probe(ctx context.Context, path string, count bool) (mediaInfo, error) {
	args := []string{"-v", "error", "-max_alloc", "67108864", "-threads", "2", "-protocol_whitelist", "file,pipe", "-format_whitelist", formats}
	if count {
		args = append(args, "-count_frames")
	}
	args = append(args, "-show_entries", "stream=codec_type,codec_name,avg_frame_rate,start_time,width,height,channels,nb_read_frames,duration:stream_disposition=attached_pic:format=duration", "-of", "json", path)
	data, err := run(ctx, "ffprobe", filepath.Dir(path), args...)
	var info mediaInfo
	if err != nil || json.Unmarshal(data, &info) != nil || len(info.Streams) > 8 {
		return info, invalid
	}
	return info, nil
}

// Prepare trims rather than pads and returns only exact bounded inline sources.
// Temp files are owner-only and removed on every success, failure or cancellation.
func Prepare(ctx context.Context, upload io.Reader, o Options) (Prepared, error) {
	var result Prepared
	if !o.Valid() {
		return result, errors.New("Invalid source mode, exact frames, resolution or start time.")
	}
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		return result, ErrBusy
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	directory, err := os.MkdirTemp("", "gallery-video-source-")
	if err != nil {
		return result, errors.New("Source preparation is unavailable.")
	}
	defer os.RemoveAll(directory)
	input := filepath.Join(directory, "upload")
	file, err := os.OpenFile(input, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return result, invalid
	}
	size, copyErr := io.Copy(file, io.LimitReader(upload, MaxUploadBytes+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || size <= 0 || size > MaxUploadBytes {
		return result, errors.New("Source upload must be between 1 byte and 64 MB.")
	}
	info, err := probe(ctx, input, false)
	if err != nil {
		return result, invalid
	}
	audioCount, videoCount := 0, 0
	for _, stream := range info.Streams {
		if stream.Type == "audio" {
			audioCount++
			if stream.Channels < 1 || stream.Channels > 8 {
				return result, invalid
			}
		}
		if stream.Type == "video" && stream.Disposition.Attached == 0 {
			videoCount++
			if stream.Width <= 0 || stream.Height <= 0 || stream.Width > 4096 || stream.Height > 4096 {
				return result, invalid
			}
			if o.Mode == "video" {
				duration, durationErr := strconv.ParseFloat(stream.Duration, 64)
				if durationErr != nil {
					duration, durationErr = strconv.ParseFloat(info.Format.Duration, 64)
				}
				if durationErr != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration+0.000001 < o.StartSeconds+float64(o.Frames)/24 {
					return result, invalid
				}
			}
		}
	}
	if audioCount != 1 || (o.Mode == "video" && videoCount != 1) {
		return result, invalid
	}
	duration := strconv.FormatFloat(float64(o.Frames)/24, 'f', 9, 64)
	start := strconv.FormatFloat(o.StartSeconds, 'f', 6, 64)
	common := []string{"-nostdin", "-v", "error", "-y", "-max_alloc", "67108864", "-threads", "2", "-filter_threads", "2", "-protocol_whitelist", "file,pipe", "-format_whitelist", formats, "-ss", start, "-i", input}
	wav := filepath.Join(directory, "audio.wav")
	args := append(append([]string{}, common...), "-map", "0:a:0", "-vn", "-t", duration, "-af", fmt.Sprintf("aresample=48000,atrim=end_sample=%d,asetpts=PTS-STARTPTS", o.Frames*2000), "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fs", "12582912", wav)
	if _, err := run(ctx, "ffmpeg", directory, args...); err != nil {
		return result, invalid
	}
	audio, err := readBounded(wav, 12*1024*1024)
	if err != nil || !exactWAV(audio, o.Frames*2000) {
		return result, invalid
	}
	result = Prepared{Audio: "data:audio/wav;base64," + base64.StdEncoding.EncodeToString(audio), Frames: o.Frames, Width: o.Width, Height: o.Height, StartSeconds: o.StartSeconds}
	if o.Mode == "video" {
		mp4 := filepath.Join(directory, "video.mp4")
		filter := fmt.Sprintf("fps=24,scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1", o.Width, o.Height, o.Width, o.Height)
		args = append(append([]string{}, common...), "-map", "0:V:0", "-an", "-vf", filter, "-frames:v", strconv.Itoa(o.Frames), "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-threads", "2", "-pix_fmt", "yuv420p", "-map_metadata", "-1", "-movflags", "+faststart", "-fs", "33554432", mp4)
		if _, err := run(ctx, "ffmpeg", directory, args...); err != nil {
			return Prepared{}, invalid
		}
		output, err := probe(ctx, mp4, true)
		if err != nil || len(output.Streams) != 1 || output.Streams[0].Frames != strconv.Itoa(o.Frames) || output.Streams[0].Width != o.Width || output.Streams[0].Height != o.Height || output.Streams[0].Codec != "h264" || output.Streams[0].FPS != "24/1" || output.Streams[0].Start != "0.000000" {
			return Prepared{}, invalid
		}
		video, err := readBounded(mp4, 32*1024*1024)
		if err != nil {
			return Prepared{}, invalid
		}
		result.Video = "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(video)
	}
	return result, nil
}

func readBounded(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, invalid
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || len(data) == 0 || int64(len(data)) >= limit {
		return nil, invalid
	}
	return data, nil
}

func exactWAV(data []byte, samples int) bool {
	if len(data) < 44 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WAVE" || int(binary.LittleEndian.Uint32(data[4:8])) != len(data)-8 {
		return false
	}
	format, sound := false, false
	for offset := 12; offset+8 <= len(data); {
		size := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		start := offset + 8
		if size > len(data)-start {
			return false
		}
		switch string(data[offset : offset+4]) {
		case "fmt ":
			if size < 16 || format {
				return false
			}
			if binary.LittleEndian.Uint16(data[start:start+2]) != 1 || binary.LittleEndian.Uint16(data[start+2:start+4]) != 2 || binary.LittleEndian.Uint32(data[start+4:start+8]) != 48000 || binary.LittleEndian.Uint32(data[start+8:start+12]) != 192000 || binary.LittleEndian.Uint16(data[start+12:start+14]) != 4 || binary.LittleEndian.Uint16(data[start+14:start+16]) != 16 {
				return false
			}
			format = true
		case "data":
			if sound || size != samples*4 {
				return false
			}
			sound = true
		}
		offset = start + size + size%2
	}
	return format && sound
}
