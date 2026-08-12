package auth

import "testing"

func TestGoogleJWTKeepsCoreStepUpTokenServerSide(t *testing.T) {
	t.Setenv("JWT_SECRET", "gallery-jwt-test-secret-at-least-32-bytes")

	raw, err := GenerateGoogleJWT(
		"google-1", "user@example.com", "User", "gridu_step-up", "account-1",
	)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := VerifyJWTClaims(raw)
	if err != nil {
		t.Fatal(err)
	}
	if claims.GridAccessToken != "gridu_step-up" {
		t.Fatalf("Core step-up token was not retained: %q", claims.GridAccessToken)
	}
	if claims.GridAccountID != "account-1" {
		t.Fatalf("Core account id was not retained: %q", claims.GridAccountID)
	}

	linked, err := GenerateLinkedJWT(
		claims.GoogleID,
		claims.Email,
		claims.Name,
		"0x0000000000000000000000000000000000000001",
		claims.GridAccessToken,
		claims.GridAccountID,
	)
	if err != nil {
		t.Fatal(err)
	}
	linkedClaims, err := VerifyJWTClaims(linked)
	if err != nil {
		t.Fatal(err)
	}
	if linkedClaims.GridAccessToken != claims.GridAccessToken {
		t.Fatal("linked session dropped the Core step-up token")
	}
	if linkedClaims.GridAccountID != claims.GridAccountID {
		t.Fatal("linked session dropped the Core account id")
	}
}

func TestWalletJWTKeepsCanonicalCoreIdentity(t *testing.T) {
	t.Setenv("JWT_SECRET", "gallery-jwt-test-secret-at-least-32-bytes")
	raw, err := GenerateWalletJWT(
		"0x0000000000000000000000000000000000000001",
		"gridu_wallet",
		"account-wallet",
	)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := VerifyJWTClaims(raw)
	if err != nil {
		t.Fatal(err)
	}
	if claims.GridAccessToken != "gridu_wallet" || claims.GridAccountID != "account-wallet" {
		t.Fatalf("wallet session lost Core identity: %#v", claims)
	}
}

func TestGoogleSessionJWTRestoresCoreVerifiedWallet(t *testing.T) {
	t.Setenv("JWT_SECRET", "gallery-jwt-test-secret-at-least-32-bytes")
	wallet := "0x00000000000000000000000000000000000000AA"

	raw, err := GenerateGoogleSessionJWT(
		"google-1", "user@example.com", "User", wallet,
		"gridu_step-up", "account-1",
	)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := VerifyJWTClaims(raw)
	if err != nil {
		t.Fatal(err)
	}
	if claims.GoogleID != "google-1" {
		t.Fatalf("Google login method was lost: %q", claims.GoogleID)
	}
	if claims.WalletAddress != "0x00000000000000000000000000000000000000aa" {
		t.Fatalf("linked wallet was not restored: %q", claims.WalletAddress)
	}
	if claims.GridAccessToken != "gridu_step-up" || claims.GridAccountID != "account-1" {
		t.Fatalf("Core identity was not retained: %#v", claims)
	}
}
