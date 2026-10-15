package config

import "testing"

func TestPublicNVFP4HasAnIndependentDefaultClosedSwitch(t *testing.T) {
	cfg := Config{DurableVideoEnabled: true, DurableVideoAdmissionMode: "open", DurableVideoNVFP4Enabled: true}
	if !cfg.AllowsDurableVideoModel("LTX-2.5 Distilled NVFP4") || cfg.AllowsDurableVideoModel("LTX-2.5 Dev BF16") {
		t.Fatal("explicit NVFP4 switch admitted the wrong model")
	}
	cfg.DurableVideoEnabled = false
	if cfg.AllowsDurableVideoModel("LTX-2.5 Distilled NVFP4") {
		t.Fatal("NVFP4 bypassed global video closure")
	}
	t.Setenv("GALLERY_DURABLE_VIDEO_NVFP4_ENABLED", "")
	if Load().DurableVideoNVFP4Enabled {
		t.Fatal("NVFP4 became an implicit default")
	}
	t.Setenv("GALLERY_DURABLE_VIDEO_NVFP4_ENABLED", "true")
	if !Load().DurableVideoNVFP4Enabled {
		t.Fatal("explicit NVFP4 switch was not loaded")
	}
}
