package connlog

import (
	"sync"
	"time"
)

type Entry struct {
	ID             string     `json:"id"`
	Host           string     `json:"host"`
	Port           int        `json:"port"`
	User           string     `json:"user"`
	ConnectedAt    time.Time  `json:"connected_at"`
	DisconnectedAt *time.Time `json:"disconnected_at,omitempty"`
}

type Store struct {
	mu      sync.RWMutex
	entries []*Entry
	maxSize int
}

func NewStore(maxSize int) *Store {
	return &Store{maxSize: maxSize, entries: make([]*Entry, 0)}
}

func (s *Store) Add(e *Entry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = append([]*Entry{e}, s.entries...) // newest first
	if len(s.entries) > s.maxSize {
		s.entries = s.entries[:s.maxSize]
	}
}

func (s *Store) List() []*Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Entry, len(s.entries))
	copy(result, s.entries)
	return result
}
