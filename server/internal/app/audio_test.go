package app

import (
	"strings"
	"testing"
)

func TestCreateAudioJobRequestDefaultsAndPreservesExplicitSeedZero(t *testing.T) {
	seed := int64(0)
	request, err := (CreateAudioJobRequest{
		Prompt: "  precise synth pulse  ",
		Seed:   &seed,
	}).normalized()
	if err != nil {
		t.Fatal(err)
	}
	if request.Prompt != "precise synth pulse" || request.Model != defaultAudioModel {
		t.Fatalf("unexpected normalized request: %#v", request)
	}
	if request.Seconds != defaultAudioSeconds || request.InferenceSteps != defaultAudioSteps {
		t.Fatalf("defaults were not applied: %#v", request)
	}
	if request.Seed == nil || *request.Seed != 0 {
		t.Fatalf("explicit seed zero was not preserved: %#v", request.Seed)
	}
}

func TestCreateAudioJobRequestRejectsOutOfBandInputs(t *testing.T) {
	badSeed := maxAudioSeed + 1
	tests := []CreateAudioJobRequest{
		{},
		{Prompt: "x", Seconds: minAudioSeconds - 1},
		{Prompt: "x", Seconds: maxAudioSeconds + 1},
		{Prompt: "x", InferenceSteps: 21},
		{Prompt: "x", Seed: &badSeed},
		{Prompt: strings.Repeat("界", maxAudioPromptRunes+1)},
		{Prompt: "x", Lyrics: strings.Repeat("界", maxAudioLyricsRunes+1)},
	}
	for i, input := range tests {
		if _, err := input.normalized(); err == nil {
			t.Fatalf("case %d accepted invalid input: %#v", i, input)
		}
	}
}

func TestCreateAudioJobRequestCountsUnicodeCharactersNotBytes(t *testing.T) {
	prompt := strings.Repeat("界", maxAudioPromptRunes)
	if _, err := (CreateAudioJobRequest{Prompt: prompt}).normalized(); err != nil {
		t.Fatalf("valid multibyte prompt rejected: %v", err)
	}
}
