package executor

import (
	"errors"
	"math/big"
)

const (
	// MaxStackSize is the maximum number of values on the stack
	MaxStackSize = 1024
)

var (
	ErrStackOverflow  = errors.New("stack overflow")
	ErrStackUnderflow = errors.New("stack underflow")
)

// Stack represents the EVM execution stack
type Stack struct {
	data []*big.Int
}

// NewStack creates a new empty stack
func NewStack() *Stack {
	return &Stack{
		data: make([]*big.Int, 0, MaxStackSize),
	}
}

// Push pushes a value onto the stack
func (s *Stack) Push(val *big.Int) error {
	if len(s.data) >= MaxStackSize {
		return ErrStackOverflow
	}
	s.data = append(s.data, new(big.Int).Set(val))
	return nil
}

// PushBytes pushes a byte slice as a big.Int
func (s *Stack) PushBytes(b []byte) error {
	return s.Push(new(big.Int).SetBytes(b))
}

// Pop removes and returns the top value from the stack
func (s *Stack) Pop() (*big.Int, error) {
	if len(s.data) == 0 {
		return nil, ErrStackUnderflow
	}
	val := s.data[len(s.data)-1]
	s.data = s.data[:len(s.data)-1]
	return val, nil
}

// Peek returns the value at position n from the top without removing it
// Peek(0) returns the top element
func (s *Stack) Peek(n int) (*big.Int, error) {
	if n >= len(s.data) {
		return nil, ErrStackUnderflow
	}
	return s.data[len(s.data)-1-n], nil
}

// Swap swaps the top element with the element at position n
func (s *Stack) Swap(n int) error {
	if n >= len(s.data) {
		return ErrStackUnderflow
	}
	top := len(s.data) - 1
	s.data[top], s.data[top-n] = s.data[top-n], s.data[top]
	return nil
}

// Dup duplicates the element at position n and pushes it to the top
func (s *Stack) Dup(n int) error {
	if n > len(s.data) {
		return ErrStackUnderflow
	}
	val := s.data[len(s.data)-n]
	return s.Push(val)
}

// Len returns the current size of the stack
func (s *Stack) Len() int {
	return len(s.data)
}

// Data returns a copy of the stack data
func (s *Stack) Data() []*big.Int {
	result := make([]*big.Int, len(s.data))
	for i, v := range s.data {
		result[i] = new(big.Int).Set(v)
	}
	return result
}

// Back returns the element at position n from the beginning
func (s *Stack) Back(n int) (*big.Int, error) {
	if n >= len(s.data) {
		return nil, ErrStackUnderflow
	}
	return s.data[n], nil
}
