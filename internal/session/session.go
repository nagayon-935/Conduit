package session

import (
	"io"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const (
	GracePeriod       = 15 * time.Minute
	ToClientBufSize   = 256
	FromClientBufSize = 64
)

// SessionState describes the lifecycle state of a session.
type SessionState int

const (
	// StateConnected means a WebSocket is actively attached.
	StateConnected SessionState = iota
	// StateDisconnected means the WebSocket disconnected but the SSH session is still alive within the grace period.
	StateDisconnected
	// StateTerminated means the session has been fully closed.
	StateTerminated
)

// Session holds all state for a single terminal session.
type Session struct {
	ID         string
	Token      string
	CreatedAt  time.Time
	ExpiresAt  time.Time // deadline after which the session is GC'd

	SSHClient  *ssh.Client
	SSHSession *ssh.Session
	Stdin      io.WriteCloser
	Stdout     io.Reader

	WSConn *websocket.Conn // nil when no WebSocket is attached

	ToClient   chan []byte // SSH stdout → WebSocket
	FromClient chan []byte // WebSocket input → SSH stdin

	State        SessionState
	done         chan struct{}
	detachNotify chan struct{} // closed when the current WebSocket is detached
	mu           sync.RWMutex
}

// NewSession constructs a Session in StateConnected state with buffered channels.
func NewSession(token string, client *ssh.Client, sshSess *ssh.Session, stdin io.WriteCloser, stdout io.Reader) *Session {
	now := time.Now()
	return &Session{
		Token:        token,
		CreatedAt:    now,
		ExpiresAt:    now.Add(GracePeriod),
		SSHClient:    client,
		SSHSession:   sshSess,
		Stdin:        stdin,
		Stdout:       stdout,
		ToClient:     make(chan []byte, ToClientBufSize),
		FromClient:   make(chan []byte, FromClientBufSize),
		State:        StateConnected,
		done:         make(chan struct{}),
		detachNotify: make(chan struct{}),
	}
}

// Close terminates the session: it closes the done channel, SSH session and SSH client.
// Idempotent – safe to call multiple times.
func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.State == StateTerminated {
		return
	}
	s.State = StateTerminated

	// Signal pumps to exit.
	select {
	case <-s.done:
	default:
		close(s.done)
	}

	if s.SSHSession != nil {
		_ = s.SSHSession.Close()
	}
	if s.SSHClient != nil {
		_ = s.SSHClient.Close()
	}
}

// IsExpired reports whether the session's grace period has elapsed.
// An actively connected session (StateConnected) is never considered expired.
func (s *Session) IsExpired() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.State == StateConnected {
		return false
	}
	return time.Now().After(s.ExpiresAt)
}

// SetWebSocket attaches a WebSocket connection and transitions the session to StateConnected.
// It resets the expiry deadline and creates a fresh detach notification channel.
func (s *Session) SetWebSocket(ws *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.WSConn = ws
	s.State = StateConnected
	s.ExpiresAt = time.Now().Add(GracePeriod)
	s.detachNotify = make(chan struct{}) // fresh channel for this connection
}

// DetachWebSocket removes the WebSocket reference and transitions the session to StateDisconnected,
// starting the grace period countdown. It also closes the detach notification channel so the
// current handleTerminal goroutine can exit cleanly.
func (s *Session) DetachWebSocket() {
	s.mu.Lock()
	ch := s.detachNotify
	s.detachNotify = nil
	s.WSConn = nil
	if s.State != StateTerminated {
		s.State = StateDisconnected
		s.ExpiresAt = time.Now().Add(GracePeriod)
	}
	s.mu.Unlock()

	if ch != nil {
		close(ch)
	}
}

// WebSocketDetached returns a channel that is closed when the current WebSocket is detached.
// The caller must capture this immediately after Attach() and hold onto it.
func (s *Session) WebSocketDetached() <-chan struct{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.detachNotify
}

// Done returns a channel that is closed when the session is terminated.
func (s *Session) Done() <-chan struct{} {
	return s.done
}

// GetWebSocket returns the currently attached WebSocket connection, or nil if none is attached.
// The caller must not retain the reference beyond a single write/read call.
func (s *Session) GetWebSocket() *websocket.Conn {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.WSConn
}
