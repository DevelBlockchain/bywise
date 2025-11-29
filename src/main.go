package main

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/bywise/go-bywise/src/api"
	"github.com/bywise/go-bywise/src/checkpoint"
	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/core"
	bywisecrypto "github.com/bywise/go-bywise/src/crypto"
	"github.com/bywise/go-bywise/src/executor"
	"github.com/bywise/go-bywise/src/miner"
	"github.com/bywise/go-bywise/src/network"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// Version information
var (
	Version   = "1.0.0"
	BuildTime = "unknown"
	GitCommit = "unknown"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "init":
		configPath := "config.json"
		if len(os.Args) > 2 {
			configPath = os.Args[2]
		}
		initConfig(configPath)

	case "start":
		configPath := "config.json"
		if len(os.Args) > 2 {
			configPath = os.Args[2]
		}
		startNode(configPath)

	case "wallet":
		if len(os.Args) < 3 {
			printWalletUsage()
			os.Exit(1)
		}
		handleWalletCommand(os.Args[2:])

	case "config":
		if len(os.Args) < 3 {
			printConfigUsage()
			os.Exit(1)
		}
		handleConfigCommand(os.Args[2:])

	case "blockchain":
		if len(os.Args) < 3 {
			printBlockchainUsage()
			os.Exit(1)
		}
		handleBlockchainCommand(os.Args[2:])

	case "version":
		printVersion()

	case "help":
		if len(os.Args) > 2 {
			printCommandHelp(os.Args[2])
		} else {
			printUsage()
		}

	default:
		fmt.Printf("Unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Bywise P2P Network Node")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  bywise init [config.json]     - Create default configuration file")
	fmt.Println("  bywise start [config.json]    - Start the node")
	fmt.Println("  bywise wallet <command>       - Wallet management commands")
	fmt.Println("  bywise config <command>       - Configuration management commands")
	fmt.Println("  bywise blockchain <command>   - Blockchain management commands")
	fmt.Println("  bywise version                - Show version information")
	fmt.Println("  bywise help [command]         - Show help for a command")
	fmt.Println()
	fmt.Println("Run 'bywise help <command>' for more information on a command.")
}

func printVersion() {
	fmt.Printf("Bywise Node %s\n", Version)
	fmt.Printf("Build time: %s\n", BuildTime)
	fmt.Printf("Git commit: %s\n", GitCommit)
}

func printCommandHelp(command string) {
	switch command {
	case "init":
		fmt.Println("Usage: bywise init [config.json]")
		fmt.Println()
		fmt.Println("Create a new configuration file with default settings.")
		fmt.Println("If no path is specified, creates 'config.json' in the current directory.")
	case "start":
		fmt.Println("Usage: bywise start [config.json]")
		fmt.Println()
		fmt.Println("Start the Bywise node with the specified configuration.")
		fmt.Println("If no path is specified, uses 'config.json' in the current directory.")
	case "wallet":
		printWalletUsage()
	case "config":
		printConfigUsage()
	case "blockchain":
		printBlockchainUsage()
	case "version":
		fmt.Println("Usage: bywise version")
		fmt.Println()
		fmt.Println("Display version information about the Bywise node.")
	default:
		fmt.Printf("Unknown command: %s\n", command)
		printUsage()
	}
}

func printWalletUsage() {
	fmt.Println("Wallet management commands")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  bywise wallet create [path]           - Create a new wallet with seed phrase")
	fmt.Println("  bywise wallet info <path>             - Show wallet information")
	fmt.Println("  bywise wallet import <private-key> [path] - Import wallet from private key")
	fmt.Println("  bywise wallet recover <seed-phrase> [path] - Recover wallet from seed phrase")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  bywise wallet create")
	fmt.Println("  bywise wallet create my-wallet.json")
	fmt.Println("  bywise wallet info wallet.json")
	fmt.Println("  bywise wallet import 0x1234...abcd my-wallet.json")
	fmt.Println("  bywise wallet recover \"word1 word2 ... word24\" my-wallet.json")
}

func handleWalletCommand(args []string) {
	if len(args) < 1 {
		printWalletUsage()
		os.Exit(1)
	}

	subcommand := args[0]

	switch subcommand {
	case "create":
		path := "wallet.json"
		if len(args) > 1 {
			path = args[1]
		}
		createWallet(path)

	case "info":
		if len(args) < 2 {
			fmt.Println("Error: wallet path required")
			fmt.Println("Usage: bywise wallet info <path>")
			os.Exit(1)
		}
		showWalletInfo(args[1])

	case "import":
		if len(args) < 2 {
			fmt.Println("Error: private key required")
			fmt.Println("Usage: bywise wallet import <private-key> [path]")
			os.Exit(1)
		}
		privateKey := args[1]
		path := "wallet.json"
		if len(args) > 2 {
			path = args[2]
		}
		importWallet(privateKey, path)

	case "recover":
		if len(args) < 2 {
			fmt.Println("Error: seed phrase required")
			fmt.Println("Usage: bywise wallet recover <seed-phrase> [path]")
			fmt.Println("Note: Wrap the seed phrase in quotes")
			os.Exit(1)
		}
		mnemonic := args[1]
		path := "wallet.json"
		if len(args) > 2 {
			path = args[2]
		}
		recoverWallet(mnemonic, path)

	default:
		fmt.Printf("Unknown wallet command: %s\n", subcommand)
		printWalletUsage()
		os.Exit(1)
	}
}

func createWallet(path string) {
	// Check if file already exists
	if _, err := os.Stat(path); err == nil {
		fmt.Printf("Error: wallet file already exists at %s\n", path)
		fmt.Println("Use a different path or delete the existing file.")
		os.Exit(1)
	}

	w, err := wallet.NewWallet()
	if err != nil {
		log.Fatalf("Failed to create wallet: %v", err)
	}

	if err := w.SaveToFile(path); err != nil {
		log.Fatalf("Failed to save wallet: %v", err)
	}

	fmt.Println("Wallet created successfully!")
	fmt.Println()
	fmt.Printf("Address:     %s\n", w.Address())
	fmt.Printf("Saved to:    %s\n", path)
}

func showWalletInfo(path string) {
	w, err := wallet.LoadFromFile(path)
	if err != nil {
		log.Fatalf("Failed to load wallet: %v", err)
	}

	fmt.Println("Wallet Information")
	fmt.Println()
	fmt.Printf("Address:     %s\n", w.Address())
	fmt.Printf("Public Key:  %s...\n", w.PublicKeyHex()[:32])
	fmt.Printf("File:        %s\n", path)
	if w.HasMnemonic() {
		fmt.Println()
		fmt.Println("Seed Phrase (12 words):")
		fmt.Printf("  %s\n", w.Mnemonic())
	}
}

func importWallet(privateKey, path string) {
	// Check if file already exists
	if _, err := os.Stat(path); err == nil {
		fmt.Printf("Error: wallet file already exists at %s\n", path)
		fmt.Println("Use a different path or delete the existing file.")
		os.Exit(1)
	}

	w, err := wallet.FromPrivateKey(privateKey)
	if err != nil {
		log.Fatalf("Failed to import wallet: %v", err)
	}

	if err := w.SaveToFile(path); err != nil {
		log.Fatalf("Failed to save wallet: %v", err)
	}

	fmt.Println("Wallet imported successfully!")
	fmt.Println()
	fmt.Printf("Address:     %s\n", w.Address())
	fmt.Printf("Saved to:    %s\n", path)
}

func recoverWallet(mnemonic, path string) {
	// Check if file already exists
	if _, err := os.Stat(path); err == nil {
		fmt.Printf("Error: wallet file already exists at %s\n", path)
		fmt.Println("Use a different path or delete the existing file.")
		os.Exit(1)
	}

	w, err := wallet.NewWalletFromMnemonic(mnemonic)
	if err != nil {
		log.Fatalf("Failed to recover wallet: %v", err)
	}

	if err := w.SaveToFile(path); err != nil {
		log.Fatalf("Failed to save wallet: %v", err)
	}

	fmt.Println("Wallet recovered successfully!")
	fmt.Println()
	fmt.Printf("Address:     %s\n", w.Address())
	fmt.Printf("Saved to:    %s\n", path)
}

func printConfigUsage() {
	fmt.Println("Configuration management commands")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  bywise config validate <path>         - Validate configuration file")
	fmt.Println("  bywise config show <path>             - Show configuration details")
	fmt.Println("  bywise config set-auth <path> <user> <pass> - Enable API authentication")
	fmt.Println("  bywise config gen-password            - Generate a secure random password")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  bywise config validate config.json")
	fmt.Println("  bywise config show config.json")
	fmt.Println("  bywise config set-auth config.json admin mypassword")
	fmt.Println("  bywise config gen-password")
}

func handleConfigCommand(args []string) {
	if len(args) < 1 {
		printConfigUsage()
		os.Exit(1)
	}

	subcommand := args[0]

	switch subcommand {
	case "validate":
		if len(args) < 2 {
			fmt.Println("Error: config path required")
			fmt.Println("Usage: bywise config validate <path>")
			os.Exit(1)
		}
		validateConfig(args[1])

	case "show":
		if len(args) < 2 {
			fmt.Println("Error: config path required")
			fmt.Println("Usage: bywise config show <path>")
			os.Exit(1)
		}
		showConfig(args[1])

	case "set-auth":
		if len(args) < 4 {
			fmt.Println("Error: path, username, and password required")
			fmt.Println("Usage: bywise config set-auth <path> <username> <password>")
			os.Exit(1)
		}
		setAuth(args[1], args[2], args[3])

	case "gen-password":
		generatePassword()

	default:
		fmt.Printf("Unknown config command: %s\n", subcommand)
		printConfigUsage()
		os.Exit(1)
	}
}

func printBlockchainUsage() {
	fmt.Println("Blockchain management commands")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  bywise blockchain init <config.json>   - Initialize a new blockchain with genesis block")
	fmt.Println("  bywise blockchain info <config.json>   - Show blockchain information")
	fmt.Println("  bywise blockchain export <config.json> <output.json> - Export blockchain state")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  bywise blockchain init config.json")
	fmt.Println("  bywise blockchain info config.json")
	fmt.Println("  bywise blockchain export config.json state.json")
}

func handleBlockchainCommand(args []string) {
	if len(args) < 1 {
		printBlockchainUsage()
		os.Exit(1)
	}

	subcommand := args[0]

	switch subcommand {
	case "init":
		if len(args) < 2 {
			fmt.Println("Error: config path required")
			fmt.Println("Usage: bywise blockchain init <config.json> [--yes]")
			os.Exit(1)
		}
		// Check for --yes flag to skip interactive prompts
		nonInteractive := len(args) >= 3 && args[2] == "--yes"
		initBlockchain(args[1], nonInteractive)

	case "info":
		if len(args) < 2 {
			fmt.Println("Error: config path required")
			fmt.Println("Usage: bywise blockchain info <config.json>")
			os.Exit(1)
		}
		showBlockchainInfo(args[1])

	case "export":
		if len(args) < 3 {
			fmt.Println("Error: config path and output path required")
			fmt.Println("Usage: bywise blockchain export <config.json> <output.json>")
			os.Exit(1)
		}
		exportBlockchain(args[1], args[2])

	default:
		fmt.Printf("Unknown blockchain command: %s\n", subcommand)
		printBlockchainUsage()
		os.Exit(1)
	}
}

func initBlockchain(configPath string, nonInteractive bool) {
	// Load configuration
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Load or create wallet
	nodeWallet, err := wallet.LoadOrCreate(cfg.Wallet)
	if err != nil {
		log.Fatalf("Failed to load or create wallet: %v", err)
	}

	// Create data directory
	dataDir := cfg.Blockchain.DataDir
	if cfg.NodeID != "" {
		dataDir = filepath.Join(dataDir, cfg.NodeID)
	}

	// Check if blockchain already exists
	if _, err := os.Stat(dataDir); err == nil {
		// Directory exists, check if it has data
		entries, _ := os.ReadDir(dataDir)
		if len(entries) > 0 {
			fmt.Printf("Error: blockchain data already exists at %s\n", dataDir)
			fmt.Println("To reinitialize, delete the data directory first:")
			fmt.Printf("  rm -rf %s\n", dataDir)
			os.Exit(1)
		}
	}

	// Get chain parameters (interactive or defaults)
	defaults := core.DefaultChainParams()
	var chainParams *core.ChainParams

	if nonInteractive {
		// Use defaults for non-interactive mode
		chainParams = defaults
		fmt.Println()
		fmt.Println("=== Blockchain Initialization (non-interactive) ===")
		fmt.Println()
		fmt.Printf("Genesis address: %s\n", nodeWallet.Address())
		fmt.Println()
		fmt.Println("Using default chain parameters:")
		fmt.Printf("  Initial Supply:          %s\n", chainParams.InitialSupply.String())
		fmt.Println()
	} else {
		// Interactive mode
		reader := bufio.NewReader(os.Stdin)

		fmt.Println()
		fmt.Println("=== Blockchain Initialization ===")
		fmt.Println()
		fmt.Printf("Genesis address: %s\n", nodeWallet.Address())
		fmt.Println()

		// Initial supply
		fmt.Printf("Initial coin supply [%s]: ", defaults.InitialSupply.String())
		initialSupplyStr, _ := reader.ReadString('\n')
		initialSupplyStr = strings.TrimSpace(initialSupplyStr)
		var initialSupply *core.BigInt
		if initialSupplyStr == "" {
			initialSupply = defaults.InitialSupply
		} else {
			var ok bool
			initialSupply, ok = core.NewBigIntFromString(initialSupplyStr, 10)
			if !ok {
				log.Fatalf("Invalid initial supply: %s", initialSupplyStr)
			}
		}

		// Create chain params
		chainParams = &core.ChainParams{
			InitialSupply: initialSupply,
		}

		fmt.Println()
		fmt.Println("Chain Parameters:")
		fmt.Printf("  Initial Supply:          %s\n", chainParams.InitialSupply.String())
		fmt.Println()

		// Confirm
		fmt.Print("Proceed with initialization? [Y/n]: ")
		confirm, _ := reader.ReadString('\n')
		confirm = strings.TrimSpace(strings.ToLower(confirm))
		if confirm != "" && confirm != "y" && confirm != "yes" {
			fmt.Println("Initialization cancelled.")
			os.Exit(0)
		}
	}

	// Ensure directory exists
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Initialize storage
	store, err := storage.NewStorage(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer store.Close()

	// Save chain params
	if err := store.SetChainParams(chainParams); err != nil {
		log.Fatalf("Failed to save chain params: %v", err)
	}

	// Create genesis block
	minerAddr, _ := core.AddressFromHex(nodeWallet.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)

	// Sign genesis block
	if err := genesisBlock.Sign(nodeWallet); err != nil {
		log.Fatalf("Failed to sign genesis block: %v", err)
	}

	// Save genesis block
	if err := store.SaveBlock(genesisBlock); err != nil {
		log.Fatalf("Failed to save genesis block: %v", err)
	}

	// Set latest block number
	if err := store.SetLatestBlockNumber(0); err != nil {
		log.Fatalf("Failed to set latest block number: %v", err)
	}

	// Set initial balance for genesis address
	genesisAccount, err := store.GetAccount(minerAddr)
	if err != nil {
		log.Fatalf("Failed to get genesis account: %v", err)
	}
	genesisAccount.Balance = chainParams.InitialSupply
	if err := store.SetAccount(genesisAccount); err != nil {
		log.Fatalf("Failed to set genesis account balance: %v", err)
	}

	fmt.Println()
	fmt.Println("Blockchain initialized successfully!")
	fmt.Println()
	fmt.Println("Genesis Block:")
	fmt.Printf("  Hash:      %s\n", genesisBlock.Hash().Hex())
	fmt.Printf("  Miner:     %s\n", nodeWallet.Address())
	fmt.Printf("  Timestamp: %d\n", genesisBlock.Header.Timestamp)
	fmt.Println()
	fmt.Println("Genesis Account:")
	fmt.Printf("  Address:   %s\n", nodeWallet.Address())
	fmt.Printf("  Balance:   %s\n", chainParams.InitialSupply.String())
	fmt.Println()
	fmt.Printf("Data directory: %s\n", dataDir)
	fmt.Println()
	fmt.Println("You can now start the node with:")
	fmt.Printf("  bywise start %s\n", configPath)
}

func showBlockchainInfo(configPath string) {
	// Load configuration
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Get data directory
	dataDir := cfg.Blockchain.DataDir
	if cfg.NodeID != "" {
		dataDir = filepath.Join(dataDir, cfg.NodeID)
	}

	// Check if data directory exists
	if _, err := os.Stat(dataDir); os.IsNotExist(err) {
		fmt.Println("No blockchain data found.")
		fmt.Println("Initialize a new blockchain with:")
		fmt.Printf("  bywise blockchain init %s\n", configPath)
		os.Exit(1)
	}

	// Open storage
	store, err := storage.NewStorage(dataDir)
	if err != nil {
		log.Fatalf("Failed to open storage: %v", err)
	}
	defer store.Close()

	// Get latest block
	latestBlock, err := store.GetLatestBlock()
	if err != nil {
		fmt.Println("No blocks found in blockchain.")
		os.Exit(1)
	}

	// Get genesis block
	genesisBlock, _ := store.GetBlockByNumber(0)

	// Get chain params
	chainParams, _ := store.GetChainParams()

	fmt.Println("Blockchain Information")
	fmt.Println("======================")
	fmt.Println()
	fmt.Println("[Chain Parameters]")
	if chainParams != nil {
		fmt.Printf("  Initial Supply:      %s\n", chainParams.InitialSupply.String())
	} else {
		fmt.Println("  (legacy chain - no params stored)")
	}
	fmt.Println()
	fmt.Println("[Chain Status]")
	fmt.Printf("  Latest Block:      %d\n", latestBlock.Header.Number)
	fmt.Printf("  Latest Hash:       %s\n", latestBlock.Hash().Hex())
	fmt.Printf("  Latest Miner:      %s\n", latestBlock.Header.MinerAddress.Hex())
	fmt.Printf("  Transactions:      %d (in latest block)\n", len(latestBlock.Transactions))
	fmt.Println()
	fmt.Println("[Genesis Block]")
	if genesisBlock != nil {
		fmt.Printf("  Hash:              %s\n", genesisBlock.Hash().Hex())
		fmt.Printf("  Miner:             %s\n", genesisBlock.Header.MinerAddress.Hex())
		fmt.Printf("  Timestamp:         %d\n", genesisBlock.Header.Timestamp)
	}
	fmt.Println()
	fmt.Printf("Data directory: %s\n", dataDir)
}

func exportBlockchain(configPath, outputPath string) {
	// Load configuration
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Get data directory
	dataDir := cfg.Blockchain.DataDir
	if cfg.NodeID != "" {
		dataDir = filepath.Join(dataDir, cfg.NodeID)
	}

	// Open storage
	store, err := storage.NewStorage(dataDir)
	if err != nil {
		log.Fatalf("Failed to open storage: %v", err)
	}
	defer store.Close()

	// Get latest block number
	latestNum, err := store.GetLatestBlockNumber()
	if err != nil {
		log.Fatalf("Failed to get latest block: %v", err)
	}

	// Create export structure
	type BlockExport struct {
		Number       uint64   `json:"number"`
		Hash         string   `json:"hash"`
		PreviousHash string   `json:"previousHash"`
		Timestamp    int64    `json:"timestamp"`
		MinerAddress string   `json:"minerAddress"`
		TxCount      int      `json:"txCount"`
		TxIDs        []string `json:"txIds,omitempty"`
	}

	type ExportData struct {
		ChainInfo struct {
			LatestBlock uint64 `json:"latestBlock"`
			TotalBlocks int    `json:"totalBlocks"`
			ExportedAt  int64  `json:"exportedAt"`
		} `json:"chainInfo"`
		Blocks []BlockExport `json:"blocks"`
	}

	export := ExportData{}
	export.ChainInfo.LatestBlock = latestNum
	export.ChainInfo.TotalBlocks = int(latestNum + 1)
	export.ChainInfo.ExportedAt = time.Now().Unix()
	export.Blocks = make([]BlockExport, 0)

	// Export blocks (limit to last 1000 for performance)
	startBlock := uint64(0)
	if latestNum > 1000 {
		startBlock = latestNum - 1000
	}

	for i := startBlock; i <= latestNum; i++ {
		block, err := store.GetBlockByNumber(i)
		if err != nil {
			continue
		}

		blockExport := BlockExport{
			Number:       block.Header.Number,
			Hash:         block.Hash().Hex(),
			PreviousHash: block.Header.PreviousHash.Hex(),
			Timestamp:    block.Header.Timestamp,
			MinerAddress: block.Header.MinerAddress.Hex(),
			TxCount:      len(block.Transactions),
		}

		if len(block.Transactions) > 0 {
			blockExport.TxIDs = make([]string, len(block.Transactions))
			for j, tx := range block.Transactions {
				blockExport.TxIDs[j] = tx.ID.Hex()
			}
		}

		export.Blocks = append(export.Blocks, blockExport)
	}

	// Write to file
	data, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal export data: %v", err)
	}

	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		log.Fatalf("Failed to write export file: %v", err)
	}

	fmt.Printf("Blockchain exported to %s\n", outputPath)
	fmt.Printf("Exported %d blocks (from block %d to %d)\n", len(export.Blocks), startBlock, latestNum)
}

func validateConfig(path string) {
	cfg, err := config.LoadConfig(path)
	if err != nil {
		fmt.Printf("Configuration INVALID: %v\n", err)
		os.Exit(1)
	}

	if err := cfg.Validate(); err != nil {
		fmt.Printf("Configuration INVALID: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Configuration at %s is valid.\n", path)
}

func showConfig(path string) {
	cfg, err := config.LoadConfig(path)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	fmt.Println("Configuration Details")
	fmt.Println("=====================")
	fmt.Println()
	fmt.Println("[Node]")
	fmt.Printf("  Node ID:           %s\n", valueOrDefault(cfg.NodeID, "(auto-generated)"))
	fmt.Println()
	fmt.Println("[Server]")
	fmt.Printf("  gRPC Host:         %s\n", cfg.Server.Host)
	fmt.Printf("  gRPC Port:         %d\n", cfg.Server.Port)
	fmt.Printf("  TLS Auto-Generate: %t\n", cfg.TLS.AutoGenerate)
	fmt.Println()
	fmt.Println("[API]")
	fmt.Printf("  Enabled:           %t\n", cfg.API.Enabled)
	fmt.Printf("  Host:              %s\n", cfg.API.Host)
	fmt.Printf("  Port:              %d\n", cfg.API.Port)
	fmt.Printf("  Auth Enabled:      %t\n", cfg.API.Auth.Enabled)
	if cfg.API.Auth.Enabled {
		fmt.Printf("  Auth Username:     %s\n", cfg.API.Auth.Username)
		fmt.Printf("  Auth Password:     %s\n", maskPassword(cfg.API.Auth.Password))
	}
	fmt.Println()
	fmt.Println("[Blockchain]")
	fmt.Printf("  Data Directory:    %s\n", cfg.Blockchain.DataDir)
	fmt.Printf("  Block Time:        %s\n", cfg.Blockchain.BlockTime)
	fmt.Printf("  Checkpoint Every:  %d blocks\n", cfg.Blockchain.CheckpointInterval)
	fmt.Println()
	fmt.Println("[Wallet]")
	fmt.Printf("  Wallet Path:       %s\n", cfg.Wallet)
	fmt.Println()
	fmt.Println("[Network]")
	fmt.Printf("  Bootstrap Nodes:   %d configured\n", len(cfg.BootstrapNodes))
	fmt.Printf("  Discovery:         %t\n", cfg.Discovery.Enabled)
	fmt.Printf("  Min Connections:   %d\n", cfg.Connection.MinConnections)
	fmt.Printf("  Max Connections:   %d\n", cfg.Connection.MaxConnections)
	fmt.Printf("  Rate Limiting:     %t\n", cfg.RateLimit.Enabled)
}

func setAuth(path, username, password string) {
	cfg, err := config.LoadConfig(path)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	cfg.API.Auth.Enabled = true
	cfg.API.Auth.Username = username
	cfg.API.Auth.Password = password

	if err := config.SaveConfig(path, cfg); err != nil {
		log.Fatalf("Failed to save config: %v", err)
	}

	fmt.Println("API authentication configured successfully!")
	fmt.Println()
	fmt.Printf("Username: %s\n", username)
	fmt.Printf("Password: %s\n", maskPassword(password))
	fmt.Println()
	fmt.Println("Restart the node for changes to take effect.")
}

func generatePassword() {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		log.Fatalf("Failed to generate password: %v", err)
	}

	password := base64.URLEncoding.EncodeToString(bytes)

	fmt.Println("Generated secure password:")
	fmt.Println()
	fmt.Printf("  %s\n", password)
	fmt.Println()
	fmt.Println("Use this with: bywise config set-auth <config.json> <username> <password>")
}

func valueOrDefault(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}

func maskPassword(password string) string {
	if password == "" {
		return ""
	}
	if len(password) <= 4 {
		return "****"
	}
	return password[:2] + "****" + password[len(password)-2:]
}

func maskPrivateKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return "****"
	}
	return key[:4] + "..." + key[len(key)-4:]
}

func initConfig(path string) {
	cfg := config.DefaultConfig()

	if err := config.SaveConfig(path, cfg); err != nil {
		log.Fatalf("Failed to save config: %v", err)
	}

	fmt.Printf("Configuration created at %s\n", path)
	fmt.Printf("Node ID will be generated on first start\n")

	// Create wallet if it doesn't exist
	walletPath := cfg.Wallet
	if walletPath == "" {
		walletPath = "wallet.json"
	}

	if _, err := os.Stat(walletPath); os.IsNotExist(err) {
		w, err := wallet.NewWallet()
		if err != nil {
			log.Fatalf("Failed to create wallet: %v", err)
		}

		if err := w.SaveToFile(walletPath); err != nil {
			log.Fatalf("Failed to save wallet: %v", err)
		}

		fmt.Printf("Wallet created at %s\n", walletPath)
		fmt.Printf("Wallet address: %s\n", w.Address())
		if w.HasMnemonic() {
			fmt.Println()
			fmt.Println("Seed Phrase (12 words):")
			fmt.Printf("  %s\n", w.Mnemonic())
			fmt.Println()
			fmt.Println("IMPORTANT: Save your seed phrase securely! It can recover your wallet.")
		}
	} else {
		fmt.Printf("Wallet already exists at %s\n", walletPath)
	}

	// Generate TLS certificates if they don't exist
	certFile := cfg.TLS.CertFile
	keyFile := cfg.TLS.KeyFile

	certExists := fileExists(certFile)
	keyExists := fileExists(keyFile)

	if !certExists || !keyExists {
		fmt.Println()
		fmt.Println("Generating TLS certificates...")
		tlsManager := bywisecrypto.NewTLSManager(certFile, keyFile)
		hosts := []string{cfg.Server.Host}
		if err := tlsManager.GenerateSelfSignedCert(hosts); err != nil {
			log.Fatalf("Failed to generate TLS certificates: %v", err)
		}
		fmt.Printf("TLS certificate created at %s\n", certFile)
		fmt.Printf("TLS key created at %s\n", keyFile)
	} else {
		fmt.Printf("TLS certificates already exist at %s\n", certFile)
	}
}

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func startNode(configPath string) {
	// Load configuration
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Set blockchain parameters from config
	if cfg.Blockchain.BlockTime > 0 {
		core.SetBlockTime(cfg.Blockchain.BlockTime)
		log.Printf("Block time set to %s", cfg.Blockchain.BlockTime)
	}
	if cfg.Blockchain.CheckpointInterval > 0 {
		core.SetCheckpointInterval(cfg.Blockchain.CheckpointInterval)
		log.Printf("Checkpoint interval set to %d blocks", cfg.Blockchain.CheckpointInterval)
	}

	// Load or create wallet
	nodeWallet, err := wallet.LoadOrCreate(cfg.Wallet)
	if err != nil {
		log.Fatalf("Failed to load or create wallet: %v", err)
	}
	log.Printf("Wallet loaded from %s", cfg.Wallet)
	log.Printf("Wallet address: %s", nodeWallet.Address())

	// Initialize storage if data directory is configured
	var store *storage.Storage
	var nodeMiner *miner.Miner
	if cfg.Blockchain.DataDir != "" {
		// Create data directory with node ID to avoid conflicts
		dataDir := cfg.Blockchain.DataDir
		if cfg.NodeID != "" {
			dataDir = filepath.Join(dataDir, cfg.NodeID)
		}

		// Ensure directory exists
		if err := os.MkdirAll(dataDir, 0755); err != nil {
			log.Fatalf("Failed to create data directory: %v", err)
		}

		store, err = storage.NewStorage(dataDir)
		if err != nil {
			log.Fatalf("Failed to initialize storage: %v", err)
		}
		log.Printf("Storage initialized at %s", dataDir)

		// Create miner
		nodeMiner, err = miner.NewMiner(store, nodeWallet)
		if err != nil {
			log.Fatalf("Failed to create miner: %v", err)
		}

		// Log node is ready for mining
		log.Printf("Mining enabled")

		// Check if genesis block exists, create if not
		minerAddr, _ := core.AddressFromHex(nodeWallet.Address())
		_, err = store.GetLatestBlock()
		if err == storage.ErrNotFound {
			log.Printf("Creating genesis block...")
			genesisBlock := core.NewGenesisBlock(minerAddr)
			if err := genesisBlock.Sign(nodeWallet); err != nil {
				log.Fatalf("Failed to sign genesis block: %v", err)
			}
			if err := store.SaveBlock(genesisBlock); err != nil {
				log.Fatalf("Failed to save genesis block: %v", err)
			}
			if err := store.SetLatestBlockNumber(0); err != nil {
				log.Fatalf("Failed to set latest block number: %v", err)
			}
			log.Printf("Genesis block created with hash: %s", genesisBlock.Hash().Hex())
		}
	}

	// Create network
	net, err := network.NewNetwork(cfg)
	if err != nil {
		log.Fatalf("Failed to create network: %v", err)
	}

	// Set blockchain handler if storage is available
	if nodeMiner != nil && store != nil {
		handler := network.NewBlockchainHandler(net, store, nodeMiner)
		net.SetBlockchainHandler(handler)
		log.Printf("Blockchain handler enabled")
	}

	// Set callbacks
	net.OnPeerConnected(func(peer *network.Peer) {
		log.Printf("Peer connected: %s (%s)", peer.NodeID, peer.Address)
	})

	net.OnPeerDisconnected(func(peer *network.Peer) {
		log.Printf("Peer disconnected: %s (%s)", peer.NodeID, peer.Address)
	})

	// Start network
	if err := net.Start(); err != nil {
		log.Fatalf("Failed to start network: %v", err)
	}

	log.Printf("Node started with ID: %s", net.GetNodeID())
	log.Printf("Listening on: %s", net.GetAddress())

	// Wait for initial connections before syncing
	if len(cfg.BootstrapNodes) > 0 && store != nil {
		log.Printf("Waiting for peers to connect before syncing...")
		time.Sleep(3 * time.Second) // Give time for connections to establish

		// Check if we need to sync
		latestBlock, err := store.GetLatestBlock()
		var needsSync bool
		if err == storage.ErrNotFound {
			needsSync = true
			log.Printf("No blockchain data found, will sync from network")
		} else if err == nil {
			// Check if we're significantly behind
			ourHeight := latestBlock.Header.Number
			log.Printf("Current blockchain height: %d", ourHeight)
			needsSync = true // Always try to sync to catch up with network
		}

		if needsSync && net.ConnectedPeerCount() > 0 {
			log.Printf("Starting blockchain sync from %d connected peers...", net.ConnectedPeerCount())

			// Create mock IPFS client for checkpoint support
			// In production, replace this with actual IPFS client
			mockIPFS := checkpoint.NewMockIPFSClient()

			// Perform initial sync
			if err := net.SyncBlockchainFromNetwork(mockIPFS); err != nil {
				log.Printf("Warning: blockchain sync encountered errors: %v", err)
			}
		} else if net.ConnectedPeerCount() == 0 {
			log.Printf("No peers connected, skipping sync")
		}
	}

	// Start miner if available
	if nodeMiner != nil {
		nodeMiner.Start()
		log.Printf("Mining started")

		// Set callback to broadcast new blocks
		nodeMiner.SetOnBlockMined(func(block *core.Block) {
			log.Printf("Block %d mined, broadcasting to network", block.Header.Number)
			net.BroadcastBlock(block)
		})
	}

	// Start HTTP API
	var apiServer *api.APIServer
	if cfg.API.Enabled {
		apiServer = api.NewAPIServer(cfg.API, net, nodeWallet)

		// Register blockchain routes if storage is available
		if store != nil {
			blockchainAPI := api.NewBlockchainAPI(store, nodeMiner)
			// Set broadcaster to propagate transactions to the network
			blockchainAPI.SetBroadcaster(net.BroadcastTransaction)
			apiServer.RegisterBlockchainAPI(blockchainAPI)
		}

		// Register validator routes (available on all nodes for wallet operations)
		if store != nil {
			// ChainID 1 is the default (mainnet). This can be made configurable in the future.
			validator, err := executor.NewValidator(store, nodeWallet, 1)
			if err != nil {
				log.Printf("Warning: Failed to create validator: %v", err)
			} else {
				validatorAPI := api.NewValidatorAPI(validator, nodeMiner)
				// Set broadcaster to propagate transactions to the network
				validatorAPI.SetTransactionBroadcaster(net.BroadcastTransaction)
				apiServer.RegisterValidatorAPI(validatorAPI)
				log.Printf("Validator API started")
			}
		}

		if err := apiServer.Start(); err != nil {
			log.Fatalf("Failed to start API server: %v", err)
		}
		log.Printf("HTTP API available at http://%s:%d", cfg.API.Host, cfg.API.Port)
	}

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down...")

	// Stop miner
	if nodeMiner != nil {
		nodeMiner.Stop()
	}

	// Stop API server
	if apiServer != nil {
		if err := apiServer.Stop(); err != nil {
			log.Printf("Error stopping API server: %v", err)
		}
	}

	if err := net.Stop(); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}

	// Close storage
	if store != nil {
		if err := store.Close(); err != nil {
			log.Printf("Error closing storage: %v", err)
		}
	}

	log.Println("Goodbye!")
}
