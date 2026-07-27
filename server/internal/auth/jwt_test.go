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
