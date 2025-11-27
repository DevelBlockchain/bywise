package executor

import (
	"errors"
	"math/big"
)

const (
	// MaxMemorySize is the maximum allowed memory size (16MB)
	MaxMemorySize = 16 * 1024 * 1024
)

var (
	ErrMemoryOverflow = errors.New("memory overflow")
)

// Memory represents the EVM linear memory
type Memory struct {
	data []byte
}

// NewMemory creates a new empty memory
func NewMemory() *Memory {
	return &Memory{
		data: make([]byte, 0),
	}
}

// Resize resizes memory to the specified size
func (m *Memory) Resize(size uint64) error {
	if size > MaxMemorySize {
		return ErrMemoryOverflow
	}
	if uint64(len(m.data)) < size {
		newData := make([]byte, size)
		copy(newData, m.data)
		m.data = newData
	}
	return nil
}

// Set stores data at the specified offset
func (m *Memory) Set(offset, size uint64, value []byte) error {
	if size == 0 {
		return nil
	}
	if offset+size > MaxMemorySize {
		return ErrMemoryOverflow
	}

	// Ensure memory is large enough
	if err := m.Resize(offset + size); err != nil {
		return err
	}

	copy(m.data[offset:offset+size], value)
	return nil
}

// Set32 stores a 32-byte value at the specified offset
func (m *Memory) Set32(offset uint64, val *big.Int) error {
	if offset+32 > MaxMemorySize {
		return ErrMemoryOverflow
	}

	// Ensure memory is large enough
	if err := m.Resize(offset + 32); err != nil {
		return err
	}

	// Convert big.Int to 32-byte array (left-padded)
	b := val.Bytes()
	data := make([]byte, 32)
	copy(data[32-len(b):], b)

	copy(m.data[offset:offset+32], data)
	return nil
}

// SetByte stores a single byte at the specified offset
func (m *Memory) SetByte(offset uint64, val byte) error {
	if offset >= MaxMemorySize {
		return ErrMemoryOverflow
	}

	// Ensure memory is large enough
	if err := m.Resize(offset + 1); err != nil {
		return err
	}

	m.data[offset] = val
	return nil
}

// Get retrieves data from memory at the specified offset
func (m *Memory) Get(offset, size uint64) ([]byte, error) {
	if size == 0 {
		return []byte{}, nil
	}
	if offset+size > MaxMemorySize {
		return nil, ErrMemoryOverflow
	}

	// Ensure memory is large enough (read from unallocated memory returns zeros)
	if err := m.Resize(offset + size); err != nil {
		return nil, err
	}

	result := make([]byte, size)
	copy(result, m.data[offset:offset+size])
	return result, nil
}

// Get32 retrieves a 32-byte value from memory as big.Int
func (m *Memory) Get32(offset uint64) (*big.Int, error) {
	data, err := m.Get(offset, 32)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(data), nil
}

// Len returns the current size of memory
func (m *Memory) Len() uint64 {
	return uint64(len(m.data))
}

// Data returns the raw memory data
func (m *Memory) Data() []byte {
	return m.data
}

// Copy returns a copy of the memory data
func (m *Memory) Copy() []byte {
	result := make([]byte, len(m.data))
	copy(result, m.data)
	return result
}

// GetCopy returns a copy of memory from offset with size
func (m *Memory) GetCopy(offset, size int64) []byte {
	if size <= 0 {
		return []byte{}
	}

	if offset+size > int64(len(m.data)) {
		result := make([]byte, size)
		if offset < int64(len(m.data)) {
			copy(result, m.data[offset:])
		}
		return result
	}

	result := make([]byte, size)
	copy(result, m.data[offset:offset+size])
	return result
}
