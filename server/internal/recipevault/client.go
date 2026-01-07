package recipevault

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
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

// Compression enum matching the SDK
const (
	CompressionNone  = 0
	CompressionGzip  = 1
	CompressionBrotli = 2
)

// OnChainRecipeInfo represents a recipe/workflow from the blockchain
type OnChainRecipeInfo struct {
	RecipeID      int64
	RecipeRoot    string
	Creator       string
	CanCreateNFTs bool
	IsPublic      bool
	Compression   int
	CreatedAt     int64
	Name          string
	Description   string
	Workflow      map[string]interface{} // Decompressed workflow JSON
	WorkflowError string                 // Error message if decompression failed
}

// Client for querying the RecipeVault facet through the diamond proxy contract
type Client struct {
	rpcURL          string
	contractAddress common.Address
	ethClient       *ethclient.Client
	contract        *bind.BoundContract
	enabled         bool

	// Cache
	mu              sync.RWMutex
	recipeCache     map[string]*OnChainRecipeInfo
	cacheExpiry     time.Time
	cacheTTL        time.Duration
}

// Default configuration
const (
	DefaultRecipeVaultRPCURL          = "https://mainnet.base.org"
	DefaultRecipeVaultContractAddress = "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609" // Same as ModelVault (diamond proxy)
	DefaultRecipeVaultCacheTTL       = 30 * time.Minute
	RecipeVaultRPCRateLimit          = 300 * time.Millisecond
)

// RecipeVault ABI (subset needed for reading recipes)
const recipeVaultABI = `[
	{
		"inputs": [{"name": "recipeId", "type": "uint256"}],
		"name": "getRecipe",
		"outputs": [
			{
				"components": [
					{"name": "recipeId", "type": "uint256"},
					{"name": "recipeRoot", "type": "bytes32"},
					{"name": "workflowData", "type": "bytes"},
					{"name": "creator", "type": "address"},
					{"name": "canCreateNFTs", "type": "bool"},
					{"name": "isPublic", "type": "bool"},
					{"name": "compression", "type": "uint8"},
					{"name": "createdAt", "type": "uint256"},
					{"name": "name", "type": "string"},
					{"name": "description", "type": "string"}
				],
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getTotalRecipes",
		"outputs": [{"name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

// NewClient creates a new RecipeVault client
func NewClient(rpcURL, contractAddress string, enabled bool) (*Client, error) {
	if !enabled {
		return &Client{enabled: false, recipeCache: make(map[string]*OnChainRecipeInfo)}, nil
	}

	if rpcURL == "" {
		rpcURL = DefaultRecipeVaultRPCURL
	}
	if contractAddress == "" {
		contractAddress = DefaultRecipeVaultContractAddress
	}

	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum RPC: %w", err)
	}

	parsedABI, err := abi.JSON(strings.NewReader(recipeVaultABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ABI: %w", err)
	}

	addr := common.HexToAddress(contractAddress)
	boundContract := bind.NewBoundContract(addr, parsedABI, ethClient, ethClient, ethClient)

	log.Printf("RecipeVault client initialized (chain: Base Mainnet, contract: %s)", contractAddress[:12]+"...")

	return &Client{
		rpcURL:          rpcURL,
		contractAddress: addr,
		ethClient:       ethClient,
		contract:        boundContract,
		enabled:         true,
		recipeCache:     make(map[string]*OnChainRecipeInfo),
		cacheTTL:        DefaultRecipeVaultCacheTTL,
	}, nil
}

// GetTotalRecipes returns the total number of registered recipes
func (c *Client) GetTotalRecipes(ctx context.Context) (int64, error) {
	if !c.enabled {
		return 0, nil
	}

	var result []interface{}
	err := c.contract.Call(&bind.CallOpts{Context: ctx}, &result, "getTotalRecipes")
	if err != nil {
		return 0, fmt.Errorf("getTotalRecipes call failed: %w", err)
	}

	if len(result) > 0 {
		if count, ok := result[0].(*big.Int); ok {
			return count.Int64(), nil
		}
	}
	return 0, fmt.Errorf("unexpected result format from getTotalRecipes")
}

// GetRecipe fetches a single recipe by ID
func (c *Client) GetRecipe(ctx context.Context, recipeID int64) (*OnChainRecipeInfo, error) {
	if !c.enabled {
		return nil, nil
	}

	var result []interface{}
	err := c.contract.Call(&bind.CallOpts{Context: ctx}, &result, "getRecipe", big.NewInt(recipeID))
	if err != nil {
		return nil, fmt.Errorf("getRecipe call failed: %w", err)
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("empty result from getRecipe")
	}

	return parseRecipeResult(result[0])
}

// parseRecipeResult extracts recipe data from the ABI-decoded result
// Uses reflection to handle the anonymous struct returned by go-ethereum
func parseRecipeResult(data interface{}) (*OnChainRecipeInfo, error) {
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

	// Extract RecipeID
	recipeID := int64(0)
	recipeIDField := getFieldByName("RecipeId")
	if recipeIDField.IsValid() {
		if bigInt, ok := recipeIDField.Interface().(*big.Int); ok && bigInt != nil {
			recipeID = bigInt.Int64()
		}
	}

	// Extract RecipeRoot
	recipeRoot := ""
	recipeRootField := getFieldByName("RecipeRoot")
	if recipeRootField.IsValid() && recipeRootField.Kind() == reflect.Array && recipeRootField.Len() == 32 {
		rootBytes := make([]byte, 32)
		for i := 0; i < 32; i++ {
			rootBytes[i] = byte(recipeRootField.Index(i).Uint())
		}
		recipeRoot = fmt.Sprintf("%x", rootBytes)
	}

	// Extract WorkflowData
	workflowData := []byte{}
	workflowDataField := getFieldByName("WorkflowData")
	if workflowDataField.IsValid() && workflowDataField.Kind() == reflect.Slice {
		if dataBytes, ok := workflowDataField.Interface().([]byte); ok {
			workflowData = dataBytes
		}
	}

	// Extract Creator
	creator := ""
	creatorField := getFieldByName("Creator")
	if creatorField.IsValid() {
		if addr, ok := creatorField.Interface().(common.Address); ok {
			creator = addr.Hex()
		}
	}

	// Extract booleans
	canCreateNFTs := false
	canCreateNFTsField := getFieldByName("CanCreateNFTs")
	if canCreateNFTsField.IsValid() && canCreateNFTsField.Kind() == reflect.Bool {
		canCreateNFTs = canCreateNFTsField.Bool()
	}

	isPublic := false
	isPublicField := getFieldByName("IsPublic")
	if isPublicField.IsValid() && isPublicField.Kind() == reflect.Bool {
		isPublic = isPublicField.Bool()
	}

	// Extract Compression
	compression := 0
	compressionField := getFieldByName("Compression")
	if compressionField.IsValid() && compressionField.CanUint() {
		compression = int(compressionField.Uint())
	}

	// Extract CreatedAt
	createdAt := int64(0)
	createdAtField := getFieldByName("CreatedAt")
	if createdAtField.IsValid() {
		if bigInt, ok := createdAtField.Interface().(*big.Int); ok && bigInt != nil {
			createdAt = bigInt.Int64()
		}
	}

	// Extract Name
	name := ""
	nameField := getFieldByName("Name")
	if nameField.IsValid() && nameField.Kind() == reflect.String {
		name = nameField.String()
	}

	// Extract Description
	description := ""
	descriptionField := getFieldByName("Description")
	if descriptionField.IsValid() && descriptionField.Kind() == reflect.String {
		description = descriptionField.String()
	}

	// Decompress workflow data
	workflow, workflowError := decompressWorkflow(workflowData, compression)

	return &OnChainRecipeInfo{
		RecipeID:      recipeID,
		RecipeRoot:    recipeRoot,
		Creator:       creator,
		CanCreateNFTs: canCreateNFTs,
		IsPublic:      isPublic,
		Compression:   compression,
		CreatedAt:     createdAt,
		Name:          name,
		Description:   description,
		Workflow:      workflow,
		WorkflowError: workflowError,
	}, nil
}

// decompressWorkflow decompresses workflow data based on compression type
func decompressWorkflow(data []byte, compression int) (map[string]interface{}, string) {
	if len(data) == 0 {
		return nil, "empty workflow data"
	}

	var workflowJSON []byte

	switch compression {
	case CompressionGzip:
		reader, err := gzip.NewReader(strings.NewReader(string(data)))
		if err != nil {
			return nil, fmt.Sprintf("failed to create gzip reader: %v", err)
		}
		defer reader.Close()
		
		// Read all data using io.Copy
		var buf strings.Builder
		_, err = io.Copy(&buf, reader)
		if err != nil {
			return nil, fmt.Sprintf("failed to decompress gzip: %v", err)
		}
		workflowJSON = []byte(buf.String())
	case CompressionNone:
		workflowJSON = data
	default:
		return nil, fmt.Sprintf("unsupported compression type: %d", compression)
	}

	var workflow map[string]interface{}
	if err := json.Unmarshal(workflowJSON, &workflow); err != nil {
		return nil, fmt.Sprintf("failed to parse workflow JSON: %v", err)
	}

	return workflow, ""
}

// FetchAllRecipes fetches all registered recipes from the blockchain
func (c *Client) FetchAllRecipes(ctx context.Context) (map[string]*OnChainRecipeInfo, error) {
	if !c.enabled {
		return nil, nil
	}

	// Check cache first
	c.mu.RLock()
	if time.Now().Before(c.cacheExpiry) && len(c.recipeCache) > 0 {
		cache := make(map[string]*OnChainRecipeInfo, len(c.recipeCache))
		for k, v := range c.recipeCache {
			cache[k] = v
		}
		c.mu.RUnlock()
		log.Printf("Using cached RecipeVault recipes (%d entries, expires in %v)", len(cache), time.Until(c.cacheExpiry).Round(time.Second))
		return cache, nil
	}
	c.mu.RUnlock()

	count, err := c.GetTotalRecipes(ctx)
	if err != nil {
		log.Printf("Warning: failed to get recipe count from blockchain: %v", err)
		return nil, err
	}

	log.Printf("Fetching %d recipes from RecipeVault (with rate limiting)...", count)

	recipes := make(map[string]*OnChainRecipeInfo)
	successCount := 0
	failCount := 0

	// Rate limit: ~3 requests per second
	ticker := time.NewTicker(RecipeVaultRPCRateLimit)
	defer ticker.Stop()

	for i := int64(1); i <= count; i++ {
		if i > 1 {
			select {
			case <-ticker.C:
				// Continue
			case <-ctx.Done():
				log.Printf("Context cancelled after %d recipes", successCount)
				break
			}
		}

		recipe, err := c.GetRecipe(ctx, i)
		if err != nil {
			failCount++
			if !strings.Contains(err.Error(), "429") {
				log.Printf("Warning: failed to fetch recipe %d: %v", i, err)
			}
			continue
		}
		if recipe == nil || !recipe.IsPublic {
			continue
		}

		successCount++
		recipes[recipe.Name] = recipe
		// Also index by normalized name
		normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(recipe.Name, ".", "_"), "-", "_"))
		recipes[normalized] = recipe
	}

	// Update cache
	if successCount > 0 {
		c.mu.Lock()
		c.recipeCache = recipes
		c.cacheExpiry = time.Now().Add(c.cacheTTL)
		c.mu.Unlock()
	}

	if failCount > 0 {
		log.Printf("✓ Loaded %d public recipes from RecipeVault (%d failed)", successCount, failCount)
	} else {
		log.Printf("✓ Loaded %d public recipes from RecipeVault", successCount)
	}

	return recipes, nil
}

// ExtractModelsFromRecipes extracts unique model names from all recipes
func (c *Client) ExtractModelsFromRecipes(ctx context.Context) ([]string, error) {
	recipes, err := c.FetchAllRecipes(ctx)
	if err != nil {
		return nil, err
	}

	log.Printf("RecipeVault: processing %d recipes for model extraction", len(recipes))
	modelSet := make(map[string]bool)
	recipeModelMap := make(map[string][]string) // recipe name -> models
	
	for recipeName, recipe := range recipes {
		if recipe.Workflow == nil {
			log.Printf("RecipeVault: recipe %q has no workflow, skipping", recipeName)
			continue
		}
		models := extractModelsFromWorkflow(recipe.Workflow)
		log.Printf("RecipeVault: recipe %q extracted %d models: %v", recipeName, len(models), models)
		recipeModelMap[recipeName] = models
		for _, model := range models {
			modelSet[model] = true
		}
	}

	models := make([]string, 0, len(modelSet))
	for model := range modelSet {
		models = append(models, model)
	}

	log.Printf("RecipeVault: total unique models extracted: %d (%v)", len(models), models)
	return models, nil
}

// extractModelsFromWorkflow extracts model names from a ComfyUI workflow
// Handles both ComfyUI native format (nodes array) and simple format (dict of nodes)
func extractModelsFromWorkflow(workflow map[string]interface{}) []string {
	models := make(map[string]bool)

	// Helper to extract model name from various node formats
	extractModelFromNode := func(nodeMap map[string]interface{}) {
		// Try both "class_type" (simple format) and "type" (ComfyUI native format)
		classType := ""
		if ct, ok := nodeMap["class_type"].(string); ok {
			classType = ct
		} else if ct, ok := nodeMap["type"].(string); ok {
			classType = ct
		}

		// Try inputs (simple format - dict) or widgets_values (ComfyUI native format - array)
		var inputs map[string]interface{}
		if inp, ok := nodeMap["inputs"].(map[string]interface{}); ok {
			inputs = inp
		}

		var widgetsValues []interface{}
		if wv, ok := nodeMap["widgets_values"].([]interface{}); ok {
			widgetsValues = wv
		}

		// CheckpointLoaderSimple nodes
		if classType == "CheckpointLoaderSimple" {
			if inputs != nil {
				if ckptName, ok := inputs["ckpt_name"].(string); ok && ckptName != "" {
					models[ckptName] = true
				}
			}
			// ComfyUI native format uses widgets_values[0]
			if len(widgetsValues) > 0 {
				if ckptName, ok := widgetsValues[0].(string); ok && ckptName != "" {
					models[ckptName] = true
				}
			}
		}

		// DualCLIPLoader nodes (FLUX)
		if classType == "DualCLIPLoader" {
			if inputs != nil {
				if clipName1, ok := inputs["clip_name1"].(string); ok && clipName1 != "" {
					models[clipName1] = true
				}
				if clipName2, ok := inputs["clip_name2"].(string); ok && clipName2 != "" {
					models[clipName2] = true
				}
			}
		}

		// UNETLoader nodes (FLUX)
		if classType == "UNETLoader" {
			if inputs != nil {
				if unetName, ok := inputs["unet_name"].(string); ok && unetName != "" {
					models[unetName] = true
				}
			}
			// ComfyUI native format
			if len(widgetsValues) > 0 {
				if unetName, ok := widgetsValues[0].(string); ok && unetName != "" {
					models[unetName] = true
				}
			}
		}

		// WanVideoModelLoader nodes
		if classType == "WanVideoModelLoader" {
			if inputs != nil {
				if modelName, ok := inputs["model_name"].(string); ok && modelName != "" {
					models[modelName] = true
				}
			}
			// Also check for "model" field
			if inputs != nil {
				if modelName, ok := inputs["model"].(string); ok && modelName != "" {
					models[modelName] = true
				}
			}
		}

		// VAELoader nodes
		if classType == "VAELoader" {
			if inputs != nil {
				if vaeName, ok := inputs["vae_name"].(string); ok && vaeName != "" {
					models[vaeName] = true
				}
			}
		}

		// CLIPLoader nodes
		if classType == "CLIPLoader" {
			if inputs != nil {
				if clipName, ok := inputs["clip_name"].(string); ok && clipName != "" {
					models[clipName] = true
				}
			}
		}
	}

	// Handle ComfyUI native format (nodes array)
	if nodes, ok := workflow["nodes"].([]interface{}); ok {
		for _, node := range nodes {
			nodeMap, ok := node.(map[string]interface{})
			if !ok {
				continue
			}
			extractModelFromNode(nodeMap)
		}
	} else {
		// Handle simple format (direct node objects)
		// Iterate through all keys that might be node IDs
		for key, value := range workflow {
			// Skip metadata keys
			if key == "extra" || key == "_meta" || key == "links" {
				continue
			}
			if nodeMap, ok := value.(map[string]interface{}); ok {
				extractModelFromNode(nodeMap)
			}
		}
	}

	result := make([]string, 0, len(models))
	for model := range models {
		result = append(result, model)
	}
	return result
}

// IsEnabled returns whether the client is enabled
func (c *Client) IsEnabled() bool {
	return c.enabled
}

