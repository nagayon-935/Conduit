package session

import "sync"

// Store is a thread-safe in-memory map of token → Session backed by sync.Map.
type Store struct {
	m sync.Map
}

// NewStore constructs an empty Store.
func NewStore() *Store {
	return &Store{}
}

// Set stores sess under the given token, replacing any existing entry.
func (s *Store) Set(token string, sess *Session) {
	s.m.Store(token, sess)
}

// Get retrieves the Session for the given token. Returns (nil, false) if not found.
func (s *Store) Get(token string) (*Session, bool) {
	v, ok := s.m.Load(token)
	if !ok {
		return nil, false
	}
	return v.(*Session), true
}

// Delete removes the entry for the given token.
func (s *Store) Delete(token string) {
	s.m.Delete(token)
}

// Range iterates over all stored sessions. Returning false from fn stops iteration.
func (s *Store) Range(fn func(token string, sess *Session) bool) {
	s.m.Range(func(k, v any) bool {
		return fn(k.(string), v.(*Session))
	})
}
