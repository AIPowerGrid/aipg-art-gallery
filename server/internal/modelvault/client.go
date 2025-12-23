package modelvault

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

// ModelType represents the type of AI model
type ModelType uint8

const (
	TextModel  ModelType = 0 // LLM/Text generation
	ImageModel ModelType = 1 // Image generation (SD, SDXL, FLUX)
	VideoModel ModelType = 2 // Video generation (WAN, LTX)
)

func (m ModelType) String() string {
	switch m {
	case TextModel:
		return "text"
	case ImageModel:
		return "image"
	case VideoModel:
		return "video"
	default:
		return "unknown"
	}
}

// OnChainModel represents a model registered on the blockchain
type OnChainModel struct {
	ModelHash    [32]byte
	ModelType    ModelType
	FileName     string
	DisplayName  string
	Description  string
	IsNSFW       bool
	SizeBytes    uint64
	Inpainting   bool
	Img2Img      bool
	Controlnet   bool
	Lora         bool
	BaseModel    string
	Architecture string
	IsActive     bool
	// Constraints (for image models)
	Constraints *ModelConstraints
}

// ModelConstraints represents the per-model generation limits from blockchain
type ModelConstraints struct {
	StepsMin          uint16
	StepsMax          uint16
	CfgMin            float64 // Already converted from tenths
	CfgMax            float64
	ClipSkip          uint8
	AllowedSamplers   []string
	AllowedSchedulers []string
}

// Client for querying the ModelVault contract on Base Mainnet
type Client struct {
	rpcURL          string
	contractAddress common.Address
	ethClient       *ethclient.Client
	contract        *bind.BoundContract
	enabled         bool

	// Cache
	mu              sync.RWMutex
	modelCache      map[string]*OnChainModel
	cacheExpiry     time.Time
	cacheTTL        time.Duration
}

// Default configuration
const (
	DefaultRPCURL          = "https://mainnet.base.org"
	DefaultContractAddress = "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609"
	DefaultCacheTTL        = 30 * time.Minute // Longer cache to reduce RPC calls
	RPCRateLimit           = 300 * time.Millisecond // Delay between RPC calls
)

// ABI for the ModelVault contract (Grid proxy)
const modelVaultABI = `[
	{
		"inputs": [{"name": "modelId", "type": "uint256"}],
		"name": "isModelExists",
		"outputs": [{"type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"name": "modelId", "type": "uint256"}],
		"name": "getModel",
		"outputs": [
			{
				"components": [
					{"name": "modelHash", "type": "bytes32"},
					{"name": "modelType", "type": "uint8"},
					{"name": "fileName", "type": "string"},
					{"name": "name", "type": "string"},
					{"name": "version", "type": "string"},
					{"name": "ipfsCid", "type": "string"},
					{"name": "downloadUrl", "type": "string"},
					{"name": "sizeBytes", "type": "uint256"},
					{"name": "quantization", "type": "string"},
					{"name": "format", "type": "string"},
					{"name": "vramMB", "type": "uint32"},
					{"name": "baseModel", "type": "string"},
					{"name": "inpainting", "type": "bool"},
					{"name": "img2img", "type": "bool"},
					{"name": "controlnet", "type": "bool"},
					{"name": "lora", "type": "bool"},
					{"name": "isActive", "type": "bool"},
					{"name": "isNSFW", "type": "bool"},
					{"name": "timestamp", "type": "uint256"},
					{"name": "creator", "type": "address"}
				],
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getModelCount",
		"outputs": [{"type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"name": "modelHash", "type": "bytes32"}],
		"name": "getConstraints",
		"outputs": [
			{
				"components": [
					{"name": "stepsMin", "type": "uint16"},
					{"name": "stepsMax", "type": "uint16"},
					{"name": "cfgMinTenths", "type": "uint16"},
					{"name": "cfgMaxTenths", "type": "uint16"},
					{"name": "clipSkip", "type": "uint8"},
					{"name": "allowedSamplers", "type": "bytes32[]"},
					{"name": "allowedSchedulers", "type": "bytes32[]"},
					{"name": "exists", "type": "bool"}
				],
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]`

// NewClient creates a new ModelVault client
func NewClient(rpcURL, contractAddress string, enabled bool) (*Client, error) {
	if !enabled {
		return &Client{enabled: false, modelCache: make(map[string]*OnChainModel)}, nil
	}

	if rpcURL == "" {
		rpcURL = DefaultRPCURL
	}
	if contractAddress == "" {
		contractAddress = DefaultContractAddress
	}

	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum RPC: %w", err)
	}

	parsedABI, err := abi.JSON(strings.NewReader(modelVaultABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	addr := common.HexToAddress(contractAddress)
	boundContract := bind.NewBoundContract(addr, parsedABI, ethClient, ethClient, ethClient)

	log.Printf("ModelVault client initialized (chain: Base Mainnet, contract: %s)", contractAddress[:12]+"...")

	return &Client{
		rpcURL:          rpcURL,
		contractAddress: addr,
		ethClient:       ethClient,
		contract:        boundContract,
		enabled:         true,
		modelCache:      make(map[string]*OnChainModel),
		cacheTTL:        DefaultCacheTTL,
	}, nil
}

// GetModelCount returns the total number of registered models
func (c *Client) GetModelCount(ctx context.Context) (int64, error) {
	if !c.enabled {
		return 0, nil
	}

	var result []interface{}
	err := c.contract.Call(&bind.CallOpts{Context: ctx}, &result, "getModelCount")
	if err != nil {
		return 0, fmt.Errorf("getModelCount call failed: %w", err)
	}

	if len(result) > 0 {
		if count, ok := result[0].(*big.Int); ok {
			return count.Int64(), nil
		}
	}
	return 0, fmt.Errorf("unexpected result format from getModelCount")
}

// GetModel fetches a single model by ID
func (c *Client) GetModel(ctx context.Context, modelID int64) (*OnChainModel, error) {
	if !c.enabled {
		return nil, nil
	}

	var result []interface{}
	err := c.contract.Call(&bind.CallOpts{Context: ctx}, &result, "getModel", big.NewInt(modelID))
	if err != nil {
		return nil, fmt.Errorf("getModel call failed: %w", err)
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("empty result from getModel")
	}

	// Parse the result using reflection-based approach
	// The ABI decoder returns anonymous structs that don't match named struct types
	return parseModelResult(result[0])
}

// parseModelResult extracts model data from the ABI-decoded result
// Uses reflection to handle the anonymous struct returned by go-ethereum
func parseModelResult(data interface{}) (*OnChainModel, error) {
	// go-ethereum's ABI decoder returns anonymous structs
	// We need to use reflection to extract fields by name
	return parseModelViaReflection(data)
}

// parseModelViaReflection uses reflection to extract struct fields by name
func parseModelViaReflection(data interface{}) (*OnChainModel, error) {
	val := reflect.ValueOf(data)
	if val.Kind() != reflect.Struct {
		return nil, fmt.Errorf("expected struct, got %T", data)
	}

	typ := val.Type()

	// Helper function to get field by name
	getFieldByName := func(name string) reflect.Value {
		field := val.FieldByName(name)
		if field.IsValid() {
			return field
		}
		// Try case-insensitive search
		for i := 0; i < val.NumField(); i++ {
			if strings.EqualFold(typ.Field(i).Name, name) {
				return val.Field(i)
			}
		}
		return reflect.Value{}
	}

	// Extract ModelHash
	var modelHash [32]byte
	modelHashField := getFieldByName("ModelHash")
	if modelHashField.IsValid() && modelHashField.Kind() == reflect.Array && modelHashField.Len() == 32 {
		for i := 0; i < 32; i++ {
			modelHash[i] = byte(modelHashField.Index(i).Uint())
		}
	}

	// Check for empty hash
	emptyHash := [32]byte{}
	if modelHash == emptyHash {
		return nil, nil
	}

	// Helper functions for type extraction
	getString := func(name string) string {
		field := getFieldByName(name)
		if field.IsValid() && field.Kind() == reflect.String {
			return field.String()
		}
		return ""
	}

	getUint8 := func(name string) uint8 {
		field := getFieldByName(name)
		if field.IsValid() && field.CanUint() {
			return uint8(field.Uint())
		}
		return 0
	}

	getBool := func(name string) bool {
		field := getFieldByName(name)
		if field.IsValid() && field.Kind() == reflect.Bool {
			return field.Bool()
		}
		return false
	}

	getBigInt := func(name string) uint64 {
		field := getFieldByName(name)
		if field.IsValid() && field.Kind() == reflect.Ptr && !field.IsNil() {
			if bigInt, ok := field.Interface().(*big.Int); ok && bigInt != nil {
				return bigInt.Uint64()
			}
		}
		return 0
	}

	name := getString("Name")
	
	return &OnChainModel{
		ModelHash:    modelHash,
		ModelType:    ModelType(getUint8("ModelType")),
		FileName:     getString("FileName"),
		DisplayName:  name,
		Description:  generateDescription(name),
		IsNSFW:       getBool("IsNSFW"),
		SizeBytes:    getBigInt("SizeBytes"),
		Inpainting:   getBool("Inpainting"),
		Img2Img:      getBool("Img2img"),
		Controlnet:   getBool("Controlnet"),
		Lora:         getBool("Lora"),
		BaseModel:    getString("BaseModel"),
		Architecture: getString("Format"),
		IsActive:     getBool("IsActive"),
	}, nil
}

// GetConstraints fetches model constraints by hash
func (c *Client) GetConstraints(ctx context.Context, modelHash [32]byte) (*ModelConstraints, error) {
	if !c.enabled {
		return nil, nil
	}

	var result []interface{}
	err := c.contract.Call(&bind.CallOpts{Context: ctx}, &result, "getConstraints", modelHash)
	if err != nil {
		return nil, nil // Constraints may not exist
	}

	if len(result) == 0 {
		return nil, nil
	}

	constraintData, ok := result[0].(struct {
		StepsMin          uint16
		StepsMax          uint16
		CfgMinTenths      uint16
		CfgMaxTenths      uint16
		ClipSkip          uint8
		AllowedSamplers   [][32]byte
		AllowedSchedulers [][32]byte
		Exists            bool
	})
	if !ok || !constraintData.Exists {
		return nil, nil
	}

	return &ModelConstraints{
		StepsMin: constraintData.StepsMin,
		StepsMax: constraintData.StepsMax,
		CfgMin:   float64(constraintData.CfgMinTenths) / 10.0,
		CfgMax:   float64(constraintData.CfgMaxTenths) / 10.0,
		ClipSkip: constraintData.ClipSkip,
		// Note: samplers/schedulers would need keccak256 reverse lookup
	}, nil
}

// FetchAllModels fetches all registered models from the blockchain
func (c *Client) FetchAllModels(ctx context.Context) (map[string]*OnChainModel, error) {
	if !c.enabled {
		return nil, nil
	}

	// Check cache first - this avoids rate limiting issues
	c.mu.RLock()
	if time.Now().Before(c.cacheExpiry) && len(c.modelCache) > 0 {
		cache := make(map[string]*OnChainModel, len(c.modelCache))
		for k, v := range c.modelCache {
			cache[k] = v
		}
		c.mu.RUnlock()
		log.Printf("Using cached blockchain models (%d entries, expires in %v)", len(cache), time.Until(c.cacheExpiry).Round(time.Second))
		return cache, nil
	}
	c.mu.RUnlock()

	count, err := c.GetModelCount(ctx)
	if err != nil {
		log.Printf("Warning: failed to get model count from blockchain: %v", err)
		return nil, err
	}

	log.Printf("Fetching %d models from blockchain (with rate limiting)...", count)

	models := make(map[string]*OnChainModel)
	successCount := 0
	failCount := 0

	// Rate limit: ~3 requests per second to avoid 429 errors from Base RPC
	ticker := time.NewTicker(RPCRateLimit)
	defer ticker.Stop()

	for i := int64(1); i <= count; i++ {
		// Wait for rate limit ticker (except for first request)
		if i > 1 {
			select {
			case <-ticker.C:
				// Continue
			case <-ctx.Done():
				log.Printf("Context cancelled after %d models", successCount)
				break
			}
		}

		model, err := c.GetModel(ctx, i)
		if err != nil {
			failCount++
			// Only log rate limit errors once
			if strings.Contains(err.Error(), "429") && failCount == 1 {
				log.Printf("Warning: rate limited by RPC endpoint, some models may be missing")
			} else if !strings.Contains(err.Error(), "429") {
				log.Printf("Warning: failed to fetch model %d: %v", i, err)
			}
			continue
		}
		if model == nil || !model.IsActive {
			continue
		}

		successCount++

		// Skip fetching constraints to reduce RPC calls
		// Constraints can be fetched on-demand if needed

		models[model.DisplayName] = model
		// Also index by variations
		models[strings.ToLower(model.DisplayName)] = model
		if model.FileName != "" {
			models[model.FileName] = model
		}
	}

	// Update cache even if we got partial results
	if successCount > 0 {
		c.mu.Lock()
		c.modelCache = models
		c.cacheExpiry = time.Now().Add(c.cacheTTL)
		c.mu.Unlock()
	}

	if failCount > 0 {
		log.Printf("✓ Loaded %d active models from blockchain (%d failed)", successCount, failCount)
	} else {
		log.Printf("✓ Loaded %d active models from blockchain", successCount)
	}

	return models, nil
}

// FindModel looks up a model by name (case-insensitive, supports aliases)
func (c *Client) FindModel(ctx context.Context, name string) (*OnChainModel, error) {
	models, err := c.FetchAllModels(ctx)
	if err != nil {
		return nil, err
	}

	// Exact match
	if m, ok := models[name]; ok {
		return m, nil
	}

	// Case-insensitive match
	nameLower := strings.ToLower(name)
	if m, ok := models[nameLower]; ok {
		return m, nil
	}

	// Normalized match (replace dots/hyphens with underscores)
	normalized := strings.ReplaceAll(strings.ReplaceAll(nameLower, ".", "_"), "-", "_")
	for key, model := range models {
		keyNorm := strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(key), ".", "_"), "-", "_")
		if keyNorm == normalized {
			return model, nil
		}
	}

	return nil, nil
}

// IsEnabled returns whether the client is enabled
func (c *Client) IsEnabled() bool {
	return c.enabled
}

// generateDescription creates a basic description from model name
func generateDescription(displayName string) string {
	nameLower := strings.ToLower(displayName)

	if strings.Contains(nameLower, "wan2.2") || strings.Contains(nameLower, "wan2_2") {
		if strings.Contains(nameLower, "ti2v") || strings.Contains(nameLower, "i2v") {
			return "WAN 2.2 Image-to-Video generation model"
		}
		if strings.Contains(nameLower, "t2v") {
			if strings.Contains(nameLower, "hq") {
				return "WAN 2.2 Text-to-Video 14B model - High quality mode"
			}
			return "WAN 2.2 Text-to-Video model"
		}
		return "WAN 2.2 Video generation model"
	}

	if strings.Contains(nameLower, "flux") {
		if strings.Contains(nameLower, "kontext") {
			return "FLUX Kontext model for context-aware image generation"
		}
		if strings.Contains(nameLower, "krea") {
			return "FLUX Krea model - Advanced image generation"
		}
		if strings.Contains(nameLower, "schnell") {
			return "FLUX Schnell - Fast image generation"
		}
		return "FLUX.1 model for high-quality image generation"
	}

	if strings.Contains(nameLower, "sdxl") || strings.Contains(nameLower, "xl") {
		return "Stable Diffusion XL model"
	}

	if strings.Contains(nameLower, "chroma") {
		return "Chroma model for image generation"
	}

	if strings.Contains(nameLower, "ltxv") || strings.Contains(nameLower, "ltx") {
		return "LTX Video generation model"
	}

	return fmt.Sprintf("%s model", displayName)
}

