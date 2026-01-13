package auth

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
)

// VerifySignature verifies an EIP-191 personal_sign signature
// Returns true if the signature is valid and matches the expected address
func VerifySignature(message, signature, expectedAddress string) (bool, error) {
	// Remove 0x prefix if present
	signature = strings.TrimPrefix(signature, "0x")
	expectedAddress = strings.ToLower(expectedAddress)
	if !strings.HasPrefix(expectedAddress, "0x") {
		expectedAddress = "0x" + expectedAddress
	}

	// Decode signature
	sigBytes, err := hex.DecodeString(signature)
	if err != nil {
		return false, fmt.Errorf("invalid signature hex: %w", err)
	}

	if len(sigBytes) != 65 {
		return false, errors.New("signature must be 65 bytes")
	}

	// Adjust V value (MetaMask uses 27/28, we need 0/1)
	if sigBytes[64] >= 27 {
		sigBytes[64] -= 27
	}

	// Hash the message with Ethereum prefix (EIP-191)
	prefixedMessage := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)
	messageHash := crypto.Keccak256Hash([]byte(prefixedMessage))

	// Recover public key from signature
	pubKey, err := crypto.SigToPub(messageHash.Bytes(), sigBytes)
	if err != nil {
		return false, fmt.Errorf("failed to recover public key: %w", err)
	}

	// Get address from public key
	recoveredAddress := crypto.PubkeyToAddress(*pubKey)

	// Compare addresses (case-insensitive)
	return strings.EqualFold(recoveredAddress.Hex(), expectedAddress), nil
}
