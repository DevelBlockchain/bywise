package network

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/bywise/go-bywise/src/checkpoint"
	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/miner"
	pb "github.com/bywise/go-bywise/src/proto/pb"
	"github.com/bywise/go-bywise/src/storage"
)

// BlockchainHandler handles blockchain-related gRPC calls
type BlockchainHandler struct {
	network *Network
	storage *storage.Storage
	miner   *miner.Miner
}

// NewBlockchainHandler creates a new blockchain handler
func NewBlockchainHandler(network *Network, store *storage.Storage, m *miner.Miner) *BlockchainHandler {
	handler := &BlockchainHandler{
		network: network,
		storage: store,
		miner:   m,
	}

	// Register network handlers for proposals and transactions
	network.RegisterRequestHandler("proposal", handler.handleProposalBroadcast)
	network.RegisterRequestHandler("transaction", handler.handleTransactionBroadcast)

	return handler
}

// handleProposalBroadcast handles incoming proposal broadcasts
func (h *BlockchainHandler) handleProposalBroadcast(ctx context.Context, peer *Peer, payload []byte) ([]byte, error) {
	// Decode proposal from JSON
	var proposal core.TransactionProposal
	if err := json.Unmarshal(payload, &proposal); err != nil {
		return nil, fmt.Errorf("invalid proposal format: %w", err)
	}

	// Add to proposals mempool
	if err := h.miner.AddPendingProposal(&proposal); err != nil {
		log.Printf("[Network] Rejected proposal from %s: %v", peer.NodeID, err)
		return []byte(`{"accepted":false}`), nil
	}

	log.Printf("[Network] Received proposal from %s (from: %s, nonce: %s)", peer.NodeID, proposal.From.Hex(), proposal.Nonce.String())

	// Propagate to other peers (except sender)
	go h.broadcastProposalExcept(&proposal, peer.NodeID)

	return []byte(`{"accepted":true}`), nil
}

// handleTransactionBroadcast handles incoming transaction broadcasts
func (h *BlockchainHandler) handleTransactionBroadcast(ctx context.Context, peer *Peer, payload []byte) ([]byte, error) {
	// Decode transaction from JSON
	var tx core.Transaction
	if err := json.Unmarshal(payload, &tx); err != nil {
		return nil, fmt.Errorf("invalid transaction format: %w", err)
	}

	// Add to transactions mempool
	if err := h.miner.AddPendingTransaction(&tx); err != nil {
		log.Printf("[Network] Rejected transaction from %s: %v", peer.NodeID, err)
		return []byte(`{"accepted":false}`), nil
	}

	log.Printf("[Network] Received transaction %s from %s", tx.ID.Hex(), peer.NodeID)

	// Propagate to other peers (except sender)
	go h.broadcastTransactionExcept(&tx, peer.NodeID)

	return []byte(`{"accepted":true}`), nil
}

// SetBlockchainHandler sets the blockchain handler on the network
func (n *Network) SetBlockchainHandler(handler *BlockchainHandler) {
	n.blockchainHandler = handler
}

// BroadcastBlock handles incoming block broadcasts
func (s *GRPCServer) BroadcastBlock(ctx context.Context, req *pb.BroadcastBlockRequest) (*pb.BroadcastBlockResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   "invalid token",
		}, nil
	}

	// Check rate limit
	if !s.network.checkRateLimit(peer) {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   "rate limit exceeded",
		}, nil
	}

	if s.network.blockchainHandler == nil {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   "blockchain not enabled",
		}, nil
	}

	// Convert protobuf block to core block
	block := pbBlockToCore(req.Block)
	if block == nil {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   "invalid block format",
		}, nil
	}

	// Check if we need to sync missing blocks first
	latestBlock, err := s.network.blockchainHandler.storage.GetLatestBlock()
	var ourLatestNumber uint64
	if err == nil {
		ourLatestNumber = latestBlock.Header.Number
	}

	// If we're behind, request missing blocks
	if block.Header.Number > ourLatestNumber+1 || (block.Header.Number > 0 && latestBlock == nil) {
		log.Printf("[Blockchain] Need to sync blocks %d to %d from %s", ourLatestNumber+1, block.Header.Number, peer.NodeID)
		go s.network.syncBlocksFromPeer(peer, ourLatestNumber, block.Header.Number)
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   "syncing blocks",
		}, nil
	}

	// Validate and apply block
	if err := s.network.blockchainHandler.miner.ValidateBlock(block); err != nil {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   err.Error(),
		}, nil
	}

	if err := s.network.blockchainHandler.miner.ApplyBlock(block); err != nil {
		return &pb.BroadcastBlockResponse{
			Accepted: false,
			Reason:   err.Error(),
		}, nil
	}

	log.Printf("[Blockchain] Received and applied block %d from %s", block.Header.Number, peer.NodeID)

	// Propagate to other peers (except sender)
	go s.network.broadcastBlockExcept(block, peer.NodeID)

	return &pb.BroadcastBlockResponse{
		Accepted: true,
	}, nil
}

// GetBlock handles block retrieval requests
func (s *GRPCServer) GetBlock(ctx context.Context, req *pb.GetBlockRequest) (*pb.GetBlockResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.GetBlockResponse{Found: false}, ErrInvalidToken
	}

	if !s.network.checkRateLimit(peer) {
		return &pb.GetBlockResponse{Found: false}, ErrRateLimitExceeded
	}

	if s.network.blockchainHandler == nil {
		return &pb.GetBlockResponse{Found: false}, nil
	}

	var block *core.Block
	var err error

	if len(req.Hash) > 0 {
		hash := core.HashFromBytes(req.Hash)
		block, err = s.network.blockchainHandler.storage.GetBlock(hash)
	} else {
		block, err = s.network.blockchainHandler.storage.GetBlockByNumber(req.Number)
	}

	if err != nil {
		return &pb.GetBlockResponse{Found: false}, nil
	}

	return &pb.GetBlockResponse{
		Found: true,
		Block: coreBlockToPb(block),
	}, nil
}

// GetBlocks handles multiple block retrieval requests
func (s *GRPCServer) GetBlocks(ctx context.Context, req *pb.GetBlocksRequest) (*pb.GetBlocksResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.GetBlocksResponse{}, ErrInvalidToken
	}

	if !s.network.checkRateLimit(peer) {
		return &pb.GetBlocksResponse{}, ErrRateLimitExceeded
	}

	if s.network.blockchainHandler == nil {
		return &pb.GetBlocksResponse{}, nil
	}

	limit := int(req.Limit)
	if limit <= 0 || limit > 100 {
		limit = 100
	}

	blocks := make([]*pb.Block, 0, limit)
	for num := req.FromNumber; num <= req.ToNumber && len(blocks) < limit; num++ {
		block, err := s.network.blockchainHandler.storage.GetBlockByNumber(num)
		if err != nil {
			continue
		}
		blocks = append(blocks, coreBlockToPb(block))
	}

	return &pb.GetBlocksResponse{
		Blocks: blocks,
	}, nil
}

// GetLatestBlock handles latest block info requests
func (s *GRPCServer) GetLatestBlock(ctx context.Context, req *pb.GetLatestBlockRequest) (*pb.GetLatestBlockResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.GetLatestBlockResponse{}, ErrInvalidToken
	}

	if !s.network.checkRateLimit(peer) {
		return &pb.GetLatestBlockResponse{}, ErrRateLimitExceeded
	}

	if s.network.blockchainHandler == nil {
		return &pb.GetLatestBlockResponse{Number: 0}, nil
	}

	block, err := s.network.blockchainHandler.storage.GetLatestBlock()
	if err != nil {
		return &pb.GetLatestBlockResponse{Number: 0}, nil
	}

	hash := block.Hash()
	return &pb.GetLatestBlockResponse{
		Number: block.Header.Number,
		Hash:   hash[:],
	}, nil
}

// broadcastBlockExcept broadcasts a block to all peers except the specified one
func (n *Network) broadcastBlockExcept(block *core.Block, exceptNodeID string) {
	pbBlock := coreBlockToPb(block)

	peers := n.GetConnectedPeers()
	log.Printf("[Blockchain] Broadcasting block %d to %d peers", block.Header.Number, len(peers))
	for _, peer := range peers {
		if peer.NodeID == exceptNodeID {
			continue
		}

		go func(p *Peer) {
			ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
			defer cancel()

			client := p.GetClient()
			if client == nil {
				log.Printf("[Blockchain] No client for peer %s", p.NodeID)
				return
			}
			resp, err := client.BroadcastBlock(ctx, &pb.BroadcastBlockRequest{
				Token: p.Token,
				Block: pbBlock,
			})
			if err != nil {
				log.Printf("[Blockchain] Failed to broadcast block %d to %s: %v", block.Header.Number, p.NodeID, err)
			} else if !resp.Accepted {
				log.Printf("[Blockchain] Block %d rejected by %s: %s", block.Header.Number, p.NodeID, resp.Reason)
			} else {
				log.Printf("[Blockchain] Block %d accepted by %s", block.Header.Number, p.NodeID)
			}
		}(peer)
	}
}

// BroadcastBlock broadcasts a block to all connected peers
func (n *Network) BroadcastBlock(block *core.Block) {
	n.broadcastBlockExcept(block, "")
}

// syncBlocksFromPeer requests and applies missing blocks from a peer
// syncBlocksWithoutApply downloads and saves blocks without applying state.
// Used after loading a checkpoint to restore the block chain without modifying
// the already-applied checkpoint state.
func (n *Network) syncBlocksWithoutApply(peer *Peer, fromBlock uint64, toBlock uint64) {
	if n.blockchainHandler == nil {
		return
	}

	client := peer.GetClient()
	if client == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*n.config.Connection.ConnectionTimeout)
	defer cancel()

	// Request blocks in batches
	batchSize := uint64(50)
	for start := fromBlock; start <= toBlock; start += batchSize {
		end := start + batchSize - 1
		if end > toBlock {
			end = toBlock
		}

		resp, err := client.GetBlocks(ctx, &pb.GetBlocksRequest{
			Token:      peer.Token,
			FromNumber: start,
			ToNumber:   end,
			Limit:      uint32(batchSize),
		})
		if err != nil {
			log.Printf("[Blockchain] Failed to get blocks %d-%d from %s: %v", start, end, peer.NodeID, err)
			return
		}

		// Save blocks without applying state
		for _, pbBlock := range resp.Blocks {
			block := pbBlockToCore(pbBlock)
			if block == nil {
				continue
			}

			// Skip if we already have this block
			_, err := n.blockchainHandler.storage.GetBlockByNumber(block.Header.Number)
			if err == nil {
				continue
			}

			// Just save the block, don't apply state (already applied by checkpoint)
			if err := n.blockchainHandler.storage.SaveBlock(block); err != nil {
				log.Printf("[Blockchain] Failed to save block %d: %v", block.Header.Number, err)
				continue
			}

			log.Printf("[Blockchain] Saved block %d from %s (no state apply)", block.Header.Number, peer.NodeID)
		}
	}
}

func (n *Network) syncBlocksFromPeer(peer *Peer, fromBlock uint64, toBlock uint64) {
	if n.blockchainHandler == nil {
		return
	}

	client := peer.GetClient()
	if client == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*n.config.Connection.ConnectionTimeout)
	defer cancel()

	// Request blocks in batches
	batchSize := uint64(50)
	for start := fromBlock; start <= toBlock; start += batchSize {
		end := start + batchSize - 1
		if end > toBlock {
			end = toBlock
		}

		resp, err := client.GetBlocks(ctx, &pb.GetBlocksRequest{
			Token:      peer.Token,
			FromNumber: start,
			ToNumber:   end,
			Limit:      uint32(batchSize),
		})
		if err != nil {
			log.Printf("[Blockchain] Failed to get blocks %d-%d from %s: %v", start, end, peer.NodeID, err)
			return
		}

		// Apply blocks in order
		for _, pbBlock := range resp.Blocks {
			block := pbBlockToCore(pbBlock)
			if block == nil {
				continue
			}

			// Skip if we already have this block
			_, err := n.blockchainHandler.storage.GetBlockByNumber(block.Header.Number)
			if err == nil {
				continue
			}

			// Validate and apply block (use sync validation which skips timestamp checks)
			if err := n.blockchainHandler.miner.ValidateBlockForSync(block); err != nil {
				log.Printf("[Blockchain] Failed to validate block %d: %v", block.Header.Number, err)
				continue
			}

			if err := n.blockchainHandler.miner.ApplyBlock(block); err != nil {
				log.Printf("[Blockchain] Failed to apply block %d: %v", block.Header.Number, err)
				continue
			}

			log.Printf("[Blockchain] Synced block %d from %s", block.Header.Number, peer.NodeID)
		}
	}
}

// Conversion functions

func coreBlockToPb(block *core.Block) *pb.Block {
	if block == nil {
		return nil
	}

	txs := make([]*pb.Transaction, len(block.Transactions))
	for i, tx := range block.Transactions {
		txs[i] = coreTxToPb(tx)
	}

	return &pb.Block{
		Number:         block.Header.Number,
		PreviousHash:   block.Header.PreviousHash[:],
		Timestamp:      block.Header.Timestamp,
		MinerAddress:   block.Header.MinerAddress[:],
		TxRoot:         block.Header.TxRoot[:],
		StateRoot:      block.Header.StateRoot[:],
		CheckpointCid:  block.Header.CheckpointCID,
		CheckpointHash: block.Header.CheckpointHash[:],
		Transactions:   txs,
		MinerSig:       block.MinerSig,
	}
}

func pbBlockToCore(pbBlock *pb.Block) *core.Block {
	if pbBlock == nil {
		return nil
	}

	block := &core.Block{
		Header: core.BlockHeader{
			Number:        pbBlock.Number,
			Timestamp:     pbBlock.Timestamp,
			CheckpointCID: pbBlock.CheckpointCid,
		},
		MinerSig: pbBlock.MinerSig,
	}

	copy(block.Header.PreviousHash[:], pbBlock.PreviousHash)
	copy(block.Header.MinerAddress[:], pbBlock.MinerAddress)
	copy(block.Header.TxRoot[:], pbBlock.TxRoot)
	copy(block.Header.StateRoot[:], pbBlock.StateRoot)
	copy(block.Header.CheckpointHash[:], pbBlock.CheckpointHash)

	block.Transactions = make([]*core.Transaction, len(pbBlock.Transactions))
	for i, pbTx := range pbBlock.Transactions {
		block.Transactions[i] = pbTxToCore(pbTx)
	}

	return block
}

func coreTxToPb(tx *core.Transaction) *pb.Transaction {
	if tx == nil {
		return nil
	}

	var valueBytes []byte
	if tx.Value != nil && tx.Value.Int != nil {
		valueBytes = tx.Value.Bytes()
	}

	var nonceBytes []byte
	if tx.Nonce != nil && tx.Nonce.Int != nil {
		nonceBytes = tx.Nonce.Bytes()
	}

	// Encode ReadSet and WriteSet keys as hex strings for protobuf compatibility
	// Protobuf requires map keys to be valid UTF-8 strings, but our keys are binary
	readSet := make(map[string][]byte)
	for k, v := range tx.ReadSet {
		hexKey := fmt.Sprintf("%x", []byte(k))
		readSet[hexKey] = v
		if false { // Enable for debugging
			log.Printf("[SEND] ReadSet: binary=%x hex=%s", []byte(k), hexKey)
		}
	}

	writeSet := make(map[string][]byte)
	for k, v := range tx.WriteSet {
		hexKey := fmt.Sprintf("%x", []byte(k))
		writeSet[hexKey] = v
		if false { // Enable for debugging
			log.Printf("[SEND] WriteSet: binary=%x hex=%s", []byte(k), hexKey)
		}
	}

	return &pb.Transaction{
		Id:           tx.ID[:],
		Validator:    tx.Validator[:],
		From:         tx.From[:],
		To:           tx.To[:],
		Value:        valueBytes,
		Nonce:        nonceBytes,
		BlockLimit:   tx.BlockLimit,
		Data:         tx.Data,
		UserSig:      tx.UserSig,
		SequenceId:   tx.SequenceID,
		ReadSet:      readSet,
		WriteSet:     writeSet,
		ValidatorSig: tx.ValidatorSig,
	}
}

func pbTxToCore(pbTx *pb.Transaction) *core.Transaction {
	if pbTx == nil {
		return nil
	}

	// Decode ReadSet and WriteSet keys from hex strings back to binary
	// Support backward compatibility: try hex decode first, fall back to direct binary
	readSet := make(map[string][]byte)
	if pbTx.ReadSet != nil {
		for key, v := range pbTx.ReadSet {
			var binaryKey []byte

			// Try to decode as hex (new format)
			decoded, err := hex.DecodeString(key)
			if err == nil && len(decoded) > 0 {
				// Successfully decoded as hex
				binaryKey = decoded
				if false { // Enable for debugging
					log.Printf("[RECV] ReadSet: hex=%s decoded=%x", key, binaryKey)
				}
			} else {
				// Not hex or decode failed - assume old format (direct binary string)
				// This provides backward compatibility with nodes sending binary keys
				binaryKey = []byte(key)
				if false { // Enable for debugging
					log.Printf("[RECV] ReadSet: FALLBACK binary=%x (original=%s err=%v)", binaryKey, key, err)
				}
			}

			// Deep copy value
			if v != nil {
				readSet[string(binaryKey)] = append([]byte(nil), v...)
			} else {
				readSet[string(binaryKey)] = nil
			}
		}
	}

	writeSet := make(map[string][]byte)
	if pbTx.WriteSet != nil {
		for key, v := range pbTx.WriteSet {
			var binaryKey []byte

			// Try to decode as hex (new format)
			decoded, err := hex.DecodeString(key)
			if err == nil && len(decoded) > 0 {
				// Successfully decoded as hex
				binaryKey = decoded
			} else {
				// Not hex or decode failed - assume old format (direct binary string)
				binaryKey = []byte(key)
			}

			// Deep copy value
			if v != nil {
				writeSet[string(binaryKey)] = append([]byte(nil), v...)
			} else {
				writeSet[string(binaryKey)] = nil
			}
		}
	}

	// Deep copy byte slices to avoid sharing references
	var data []byte
	if pbTx.Data != nil {
		data = append([]byte(nil), pbTx.Data...)
	}

	var userSig []byte
	if pbTx.UserSig != nil {
		userSig = append([]byte(nil), pbTx.UserSig...)
	}

	var validatorSig []byte
	if pbTx.ValidatorSig != nil {
		validatorSig = append([]byte(nil), pbTx.ValidatorSig...)
	}

	tx := &core.Transaction{
		BlockLimit:   pbTx.BlockLimit,
		Data:         data,
		UserSig:      userSig,
		SequenceID:   pbTx.SequenceId,
		ReadSet:      readSet,
		WriteSet:     writeSet,
		ValidatorSig: validatorSig,
		Value:        core.NewBigInt(0),
		Nonce:        core.NewBigInt(0),
	}

	copy(tx.ID[:], pbTx.Id)
	copy(tx.Validator[:], pbTx.Validator)
	copy(tx.From[:], pbTx.From)
	copy(tx.To[:], pbTx.To)

	if len(pbTx.Value) > 0 {
		tx.Value = core.BigIntFromBytes(pbTx.Value)
	}

	if len(pbTx.Nonce) > 0 {
		tx.Nonce = core.BigIntFromBytes(pbTx.Nonce)
	}

	return tx
}

// BroadcastTransaction handles incoming transaction broadcasts
func (s *GRPCServer) BroadcastTransaction(ctx context.Context, req *pb.BroadcastTransactionRequest) (*pb.BroadcastTransactionResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.BroadcastTransactionResponse{
			Accepted: false,
			Reason:   "invalid token",
		}, nil
	}

	// Check rate limit
	if !s.network.checkRateLimit(peer) {
		return &pb.BroadcastTransactionResponse{
			Accepted: false,
			Reason:   "rate limit exceeded",
		}, nil
	}

	if s.network.blockchainHandler == nil {
		return &pb.BroadcastTransactionResponse{
			Accepted: false,
			Reason:   "blockchain not enabled",
		}, nil
	}

	// Convert protobuf transaction to core transaction
	tx := pbTxToCore(req.Transaction)
	if tx == nil {
		return &pb.BroadcastTransactionResponse{
			Accepted: false,
			Reason:   "invalid transaction format",
		}, nil
	}

	// Add to pending pool
	if err := s.network.blockchainHandler.miner.AddPendingTransaction(tx); err != nil {
		return &pb.BroadcastTransactionResponse{
			Accepted: false,
			Reason:   err.Error(),
		}, nil
	}

	log.Printf("[Blockchain] Received transaction %s from %s", tx.ID.Hex(), peer.NodeID)

	// Propagate to other peers (except sender)
	go s.network.broadcastTransactionExcept(tx, peer.NodeID)

	return &pb.BroadcastTransactionResponse{
		Accepted: true,
		TxId:     tx.ID.Hex(),
	}, nil
}

// broadcastTransactionExcept broadcasts a transaction to all peers except the specified one
func (n *Network) broadcastTransactionExcept(tx *core.Transaction, exceptNodeID string) {
	pbTx := coreTxToPb(tx)

	peers := n.GetConnectedPeers()
	for _, peer := range peers {
		if peer.NodeID == exceptNodeID {
			continue
		}

		go func(p *Peer) {
			ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
			defer cancel()

			client := p.GetClient()
			if client == nil {
				return
			}
			resp, err := client.BroadcastTransaction(ctx, &pb.BroadcastTransactionRequest{
				Token:       p.Token,
				Transaction: pbTx,
			})
			if err != nil {
				log.Printf("[Blockchain] Failed to broadcast transaction %s to %s: %v", tx.ID.Hex(), p.NodeID, err)
			} else if !resp.Accepted {
				log.Printf("[Blockchain] Transaction %s rejected by %s: %s", tx.ID.Hex(), p.NodeID, resp.Reason)
			}
		}(peer)
	}
}

// BroadcastTransaction broadcasts a transaction to all connected peers
func (n *Network) BroadcastTransaction(tx *core.Transaction) {
	n.broadcastTransactionExcept(tx, "")
}

// GetLatestCheckpoint handles latest checkpoint info requests
func (s *GRPCServer) GetLatestCheckpoint(ctx context.Context, req *pb.GetLatestCheckpointRequest) (*pb.GetLatestCheckpointResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, ErrInvalidToken
	}

	if !s.network.checkRateLimit(peer) {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, ErrRateLimitExceeded
	}

	if s.network.blockchainHandler == nil {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, nil
	}

	// Get latest block
	latestBlock, err := s.network.blockchainHandler.storage.GetLatestBlock()
	if err != nil {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, nil
	}

	// Find the most recent checkpoint block
	latestCheckpointBlock := (latestBlock.Header.Number / core.CheckpointInterval) * core.CheckpointInterval
	if latestCheckpointBlock == 0 {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, nil
	}

	// Get the checkpoint block
	checkpointBlock, err := s.network.blockchainHandler.storage.GetBlockByNumber(latestCheckpointBlock)
	if err != nil || checkpointBlock.Header.CheckpointCID == "" {
		return &pb.GetLatestCheckpointResponse{HasCheckpoint: false}, nil
	}

	stateBlock := checkpoint.GetCheckpointStateBlockNumber(latestCheckpointBlock)

	return &pb.GetLatestCheckpointResponse{
		HasCheckpoint:   true,
		BlockNumber:     latestCheckpointBlock,
		StateBlock:      stateBlock,
		Cid:             checkpointBlock.Header.CheckpointCID,
		CheckpointHash:  checkpointBlock.Header.CheckpointHash[:],
	}, nil
}

// SyncBlockchainFromNetwork performs initial blockchain synchronization
// It first tries to download the latest checkpoint if available, then syncs remaining blocks
func (n *Network) SyncBlockchainFromNetwork(ipfsClient checkpoint.IPFSClient) error {
	if n.blockchainHandler == nil {
		return nil
	}

	peers := n.GetConnectedPeers()
	if len(peers) == 0 {
		log.Printf("[Blockchain] No peers available for sync")
		return nil
	}

	// Get our current state
	var ourLatestBlock uint64 = 0
	latestBlock, err := n.blockchainHandler.storage.GetLatestBlock()
	if err == nil {
		ourLatestBlock = latestBlock.Header.Number
	} else if err == storage.ErrNotFound {
		// Node has no blocks, need to sync from genesis (block 0)
		ourLatestBlock = 0
		log.Printf("[Blockchain] No blockchain data found, will sync from genesis")
	}

	log.Printf("[Blockchain] Starting blockchain sync from block %d", ourLatestBlock)

	// Try to find and download checkpoint from peers
	var bestCheckpoint *pb.GetLatestCheckpointResponse
	var bestCheckpointPeer *Peer

	for _, peer := range peers {
		client := peer.GetClient()
		if client == nil {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
		resp, err := client.GetLatestCheckpoint(ctx, &pb.GetLatestCheckpointRequest{
			Token: peer.Token,
		})
		cancel()

		if err != nil {
			log.Printf("[Blockchain] Failed to get checkpoint info from %s: %v", peer.NodeID, err)
			continue
		}

		if resp.HasCheckpoint && (bestCheckpoint == nil || resp.BlockNumber > bestCheckpoint.BlockNumber) {
			bestCheckpoint = resp
			bestCheckpointPeer = peer
		}
	}

	// If we found a checkpoint and it's ahead of us, download and apply it
	if bestCheckpoint != nil && bestCheckpoint.StateBlock > ourLatestBlock && ipfsClient != nil {
		log.Printf("[Blockchain] Found checkpoint at block %d (state: %d) from %s",
			bestCheckpoint.BlockNumber, bestCheckpoint.StateBlock, bestCheckpointPeer.NodeID)

		// Create checkpoint manager
		checkpointMgr := checkpoint.NewCheckpointManager(n.blockchainHandler.storage, ipfsClient)

		// Download and apply checkpoint
		checkpointHash := core.HashFromBytes(bestCheckpoint.CheckpointHash)
		if err := checkpointMgr.LoadCheckpoint(bestCheckpoint.Cid, checkpointHash); err != nil {
			log.Printf("[Blockchain] Failed to load checkpoint: %v", err)
		} else {
			log.Printf("[Blockchain] Successfully loaded checkpoint state from block %d", bestCheckpoint.StateBlock)

			// After loading checkpoint state, we need to download blocks 0 through checkpoint block
			// WITHOUT applying state (since checkpoint already applied state up to StateBlock)
			// Note: We save blocks up to and including the checkpoint block without applying
			// because the checkpoint was created AFTER those blocks were already applied
			log.Printf("[Blockchain] Downloading blocks 0 to %d to restore block chain", bestCheckpoint.BlockNumber)
			n.syncBlocksWithoutApply(bestCheckpointPeer, 0, bestCheckpoint.BlockNumber)
			ourLatestBlock = bestCheckpoint.BlockNumber
		}
	}

	// Find the peer with the highest block number
	var highestBlockNumber uint64
	var bestPeer *Peer

	for _, peer := range peers {
		client := peer.GetClient()
		if client == nil {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
		resp, err := client.GetLatestBlock(ctx, &pb.GetLatestBlockRequest{
			Token: peer.Token,
		})
		cancel()

		if err != nil {
			log.Printf("[Blockchain] Failed to get latest block from %s: %v", peer.NodeID, err)
			continue
		}

		if resp.Number > highestBlockNumber {
			highestBlockNumber = resp.Number
			bestPeer = peer
		}
	}

	// Sync remaining blocks from the best peer
	if bestPeer != nil && highestBlockNumber >= ourLatestBlock {
		// If we have no blocks, start from 0 (genesis)
		startBlock := ourLatestBlock
		if ourLatestBlock == 0 {
			_, err := n.blockchainHandler.storage.GetLatestBlock()
			if err == storage.ErrNotFound {
				// No blocks at all, sync from genesis
				startBlock = 0
			} else {
				// Have genesis, start from next
				startBlock = 1
			}
		} else {
			// Have blocks, continue from next
			startBlock = ourLatestBlock + 1
		}

		if startBlock <= highestBlockNumber {
			log.Printf("[Blockchain] Syncing blocks %d to %d from %s",
				startBlock, highestBlockNumber, bestPeer.NodeID)
			n.syncBlocksFromPeer(bestPeer, startBlock, highestBlockNumber)
		}
	}

	// Get final state
	finalBlock, err := n.blockchainHandler.storage.GetLatestBlock()
	if err == nil {
		log.Printf("[Blockchain] Sync complete. Current block: %d", finalBlock.Header.Number)
	}

	return nil
}

// broadcastProposalExcept broadcasts a proposal to all peers except the specified one
func (h *BlockchainHandler) broadcastProposalExcept(proposal *core.TransactionProposal, exceptNodeID string) {
	payload, err := json.Marshal(proposal)
	if err != nil {
		log.Printf("[Network] Failed to marshal proposal: %v", err)
		return
	}

	peers := h.network.GetConnectedPeers()
	for _, peer := range peers {
		if peer.NodeID == exceptNodeID {
			continue
		}

		go func(p *Peer) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			_, err := h.network.SendRequest(ctx, p, "proposal", payload)
			if err != nil {
				log.Printf("[Network] Failed to broadcast proposal to %s: %v", p.NodeID, err)
			}
		}(peer)
	}
}

// broadcastTransactionExcept broadcasts a transaction to all peers except the specified one
func (h *BlockchainHandler) broadcastTransactionExcept(tx *core.Transaction, exceptNodeID string) {
	payload, err := json.Marshal(tx)
	if err != nil {
		log.Printf("[Network] Failed to marshal transaction: %v", err)
		return
	}

	peers := h.network.GetConnectedPeers()
	for _, peer := range peers {
		if peer.NodeID == exceptNodeID {
			continue
		}

		go func(p *Peer) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			_, err := h.network.SendRequest(ctx, p, "transaction", payload)
			if err != nil {
				log.Printf("[Network] Failed to broadcast transaction to %s: %v", p.NodeID, err)
			}
		}(peer)
	}
}

// BroadcastProposal broadcasts a proposal to all connected peers
func (h *BlockchainHandler) BroadcastProposal(proposal *core.TransactionProposal) {
	h.broadcastProposalExcept(proposal, "")
}

// BroadcastTransaction broadcasts a transaction to all connected peers
func (h *BlockchainHandler) BroadcastTransaction(tx *core.Transaction) {
	h.broadcastTransactionExcept(tx, "")
}
