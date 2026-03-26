package session

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nagayon-935/conduit/internal/config"
)

// Manager orchestrates session lifecycle on top of a Store.
type Manager struct {
	store  *Store
	config *config.Config
}

// NewManager constructs a Manager backed by a fresh Store.
func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		store:  NewStore(),
		config: cfg,
	}
}

// Create registers sess in the store. The session must have a non-empty Token.
func (m *Manager) Create(sess *Session) error {
	if sess.Token == "" {
		return fmt.Errorf("session: token must not be empty")
	}
	m.store.Set(sess.Token, sess)
	slog.Info("session created", "token", sess.Token, "expires_at", sess.ExpiresAt)
	return nil
}

// Get retrieves a session by token. Returns an error if not found or already terminated.
func (m *Manager) Get(token string) (*Session, error) {
	sess, ok := m.store.Get(token)
	if !ok {
		return nil, fmt.Errorf("session: token not found")
	}
	sess.mu.RLock()
	state := sess.State
	sess.mu.RUnlock()
	if state == StateTerminated {
		return nil, fmt.Errorf("session: session is terminated")
	}
	return sess, nil
}

// Attach links ws to the session identified by token.
// It returns an error if the session does not exist, is terminated, or has expired.
func (m *Manager) Attach(token string, ws *websocket.Conn) (*Session, error) {
	sess, err := m.Get(token)
	if err != nil {
		return nil, err
	}
	if sess.IsExpired() {
		_ = m.Terminate(token)
		return nil, fmt.Errorf("session: session has expired")
	}
	sess.SetWebSocket(ws)
	slog.Info("websocket attached to session", "token", token)
	return sess, nil
}

// Terminate closes the session and removes it from the store.
func (m *Manager) Terminate(token string) error {
	sess, ok := m.store.Get(token)
	if !ok {
		return fmt.Errorf("session: token not found for termination")
	}
	sess.Close()
	m.store.Delete(token)
	slog.Info("session terminated", "token", token)
	return nil
}

// StartGC launches a background goroutine that periodically reaps expired sessions.
func (m *Manager) StartGC(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(m.config.SessionGCInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Info("session GC stopped")
				return
			case <-ticker.C:
				m.gc()
			}
		}
	}()
}

// gc iterates the store and terminates any sessions that have expired.
func (m *Manager) gc() {
	var expired []string
	m.store.Range(func(token string, sess *Session) bool {
		if sess.IsExpired() {
			expired = append(expired, token)
		}
		return true
	})
	for _, token := range expired {
		slog.Info("GC: reaping expired session", "token", token)
		_ = m.Terminate(token)
	}
}
