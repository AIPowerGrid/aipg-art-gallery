package auth

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// EIP-1271 magic value returned for valid signatures
var EIP1271_MAGIC_VALUE = [4]byte{0x16, 0x26, 0xba, 0x7e}

// isValidSignature(bytes32,bytes) function selector
var isValidSignatureABI, _ = abi.JSON(strings.NewReader(`[{"inputs":[{"name":"hash","type":"bytes32"},{"name":"signature","type":"bytes"}],"name":"isValidSignature","outputs":[{"name":"","type":"bytes4"}],"stateMutability":"view","type":"function"}]`))

// VerifySignature verifies an EIP-191 personal_sign signature or EIP-1271 contract signature
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

	// Standard ECDSA signature is 65 bytes
	if len(sigBytes) == 65 {
		return verifyECDSASignature(message, sigBytes, expectedAddress)
	}

	// Non-65-byte signatures might be EIP-1271 (smart contract wallet)
	log.Printf("Auth: Attempting EIP-1271 verification for %d byte signature", len(sigBytes))
	return verifyEIP1271Signature(message, sigBytes, expectedAddress)
}

// verifyECDSASignature verifies a standard 65-byte ECDSA signature
func verifyECDSASignature(message string, sigBytes []byte, expectedAddress string) (bool, error) {
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

// verifyEIP1271Signature verifies a smart contract wallet signature using EIP-1271
func verifyEIP1271Signature(message string, sigBytes []byte, expectedAddress string) (bool, error) {
	// Get RPC URL from environment
	rpcURL := os.Getenv("NEXT_PUBLIC_BASE_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://mainnet.base.org"
	}

	// Connect to the chain
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return false, fmt.Errorf("failed to connect to RPC: %w", err)
	}
	defer client.Close()

	// Hash the message with Ethereum prefix (EIP-191)
	prefixedMessage := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(message), message)
	messageHash := crypto.Keccak256Hash([]byte(prefixedMessage))

	// Encode the call to isValidSignature(bytes32,bytes)
	callData, err := isValidSignatureABI.Pack("isValidSignature", messageHash, sigBytes)
	if err != nil {
		return false, fmt.Errorf("failed to encode call: %w", err)
	}

	// Make the call to the wallet contract
	contractAddr := common.HexToAddress(expectedAddress)
	result, err := client.CallContract(ctx, ethereum.CallMsg{
		To:   &contractAddr,
		Data: callData,
	}, nil)
	if err != nil {
		return false, fmt.Errorf("EIP-1271 call failed: %w", err)
	}

	// Check if result matches magic value
	if len(result) < 4 {
		return false, fmt.Errorf("invalid EIP-1271 response length: %d", len(result))
	}

	// The result is ABI-encoded, first 32 bytes contain the bytes4 padded
	var magicValue [4]byte
	copy(magicValue[:], result[:4])

	if magicValue == EIP1271_MAGIC_VALUE {
		log.Printf("Auth: EIP-1271 signature verified for %s", expectedAddress)
		return true, nil
	}

	return false, fmt.Errorf("EIP-1271 signature invalid, got: 0x%x", magicValue)
}
