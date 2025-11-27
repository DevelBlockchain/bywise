package network

import (
	"context"
	"log"

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
	return &BlockchainHandler{
		network: network,
		storage: store,
		miner:   m,
	}
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

			// Validate and apply block
			if err := n.blockchainHandler.miner.ValidateBlock(block); err != nil {
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
		ReadSet:      tx.ReadSet,
		WriteSet:     tx.WriteSet,
		ValidatorSig: tx.ValidatorSig,
	}
}

func pbTxToCore(pbTx *pb.Transaction) *core.Transaction {
	if pbTx == nil {
		return nil
	}

	tx := &core.Transaction{
		BlockLimit:   pbTx.BlockLimit,
		Data:         pbTx.Data,
		UserSig:      pbTx.UserSig,
		SequenceID:   pbTx.SequenceId,
		ReadSet:      pbTx.ReadSet,
		WriteSet:     pbTx.WriteSet,
		ValidatorSig: pbTx.ValidatorSig,
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
