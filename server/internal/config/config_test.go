package config

import "testing"

func TestOperationalDefaults(t *testing.T) {
	t.Setenv("RECIPESVAULT_ENABLED", "")
	t.Setenv("AI_MODEL", "")

	cfg := Load()

	if cfg.RecipeVaultEnabled {
		t.Fatal("RecipeVault must remain opt-in until its public model aliases are migrated")
	}
	if cfg.AIModel != "auto" {
		t.Fatalf("AIModel = %q, want auto", cfg.AIModel)
	}
}
