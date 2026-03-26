package session

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const (
	GracePeriod        = 15 * time.Minute
	ToClientBufSize    = 256
	FromClientBufSize  = 64
	tokenPreviewLength = 8 // characters shown in Info() before "..."
)

type SessionState int

const (
	StateConnected    SessionState = iota
	StateDisconnected
	StateTerminated
)

type SessionInfo struct {
	Token     string    `json:"token"`
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	User      string    `json:"user"`
	State     string    `json:"state"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	WSCount   int       `json:"ws_count"`
}

type Session struct {
	Token     string
	Host      string
	Port      int
	User      string
	CreatedAt time.Time
	ExpiresAt time.Time

	SSHClient  *ssh.Client
	SSHSession *ssh.Session
	Stdin      io.WriteCloser
	Stdout     io.Reader

	ToClient   chan []byte
	FromClient chan []byte

	State  SessionState
	done   chan struct{}
	ctx    context.Context
	cancel context.CancelFunc

	wsConns   map[string]*websocket.Conn
	wsNotify  map[string]chan struct{}
	pumpsOnce sync.Once

	mu sync.RWMutex
}

func NewSession(token, host string, port int, user string, client *ssh.Client, sshSess *ssh.Session, stdin io.WriteCloser, stdout io.Reader) *Session {
	now := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	return &Session{
		Token:      token,
		Host:       host,
		Port:       port,
		User:       user,
		CreatedAt:  now,
		ExpiresAt:  now.Add(GracePeriod),
		SSHClient:  client,
		SSHSession: sshSess,
		Stdin:      stdin,
		Stdout:     stdout,
		ToClient:   make(chan []byte, ToClientBufSize),
		FromClient: make(chan []byte, FromClientBufSize),
		State:      StateDisconnected,
		done:       make(chan struct{}),
		ctx:        ctx,
		cancel:     cancel,
		wsConns:    make(map[string]*websocket.Conn),
		wsNotify:   make(map[string]chan struct{}),
	}
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.State == StateTerminated {
		return
	}
	s.State = StateTerminated

	select {
	case <-s.done:
	default:
		close(s.done)
	}
	s.cancel()

	if s.SSHSession != nil {
		_ = s.SSHSession.Close()
	}
	if s.SSHClient != nil {
		_ = s.SSHClient.Close()
	}
}

func (s *Session) IsExpired() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.State == StateConnected {
		return false
	}
	return time.Now().After(s.ExpiresAt)
}

func (s *Session) Done() <-chan struct{} {
	return s.done
}

func (s *Session) Context() context.Context {
	return s.ctx
}

func (s *Session) StartOnce(fn func()) {
	s.pumpsOnce.Do(fn)
}

func (s *Session) AddWebSocket(connID string, ws *websocket.Conn) <-chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	notify := make(chan struct{})
	s.wsConns[connID] = ws
	s.wsNotify[connID] = notify
	s.State = StateConnected
	s.ExpiresAt = time.Now().Add(GracePeriod)
	return notify
}

func (s *Session) RemoveWebSocket(connID string) {
	s.mu.Lock()
	notify := s.wsNotify[connID]
	delete(s.wsConns, connID)
	delete(s.wsNotify, connID)
	if len(s.wsConns) == 0 && s.State != StateTerminated {
		s.State = StateDisconnected
		s.ExpiresAt = time.Now().Add(GracePeriod)
	}
	s.mu.Unlock()

	if notify != nil {
		close(notify)
	}
	slog.Debug("websocket removed from session", "connID", connID)
}

func (s *Session) BroadcastToWebSockets(msgType int, data []byte) {
	s.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(s.wsConns))
	for _, ws := range s.wsConns {
		conns = append(conns, ws)
	}
	s.mu.RUnlock()

	for _, ws := range conns {
		if err := ws.WriteMessage(msgType, data); err != nil {
			slog.Debug("BroadcastToWebSockets: write error", "error", err)
		}
	}
}

func (s *Session) ActiveWSCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.wsConns)
}

func (s *Session) Info() SessionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stateStr := "connected"
	switch s.State {
	case StateDisconnected:
		stateStr = "disconnected"
	case StateTerminated:
		stateStr = "terminated"
	}

	tok := s.Token
	if len(tok) > tokenPreviewLength {
		tok = tok[:tokenPreviewLength] + "..."
	}

	return SessionInfo{
		Token:     tok,
		Host:      s.Host,
		Port:      s.Port,
		User:      s.User,
		State:     stateStr,
		CreatedAt: s.CreatedAt,
		ExpiresAt: s.ExpiresAt,
		WSCount:   len(s.wsConns),
	}
}

// ── Backward-compatibility aliases ───────────────────────────────────────────

const legacyConnID = "_default"

func (s *Session) SetWebSocket(ws *websocket.Conn) {
	s.AddWebSocket(legacyConnID, ws)
}

func (s *Session) DetachWebSocket() {
	s.RemoveWebSocket(legacyConnID)
}

func (s *Session) GetWebSocket() *websocket.Conn {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ws := range s.wsConns {
		return ws
	}
	return nil
}

func (s *Session) WebSocketDetached() <-chan struct{} {
	s.mu.RLock()
	ch, ok := s.wsNotify[legacyConnID]
	s.mu.RUnlock()
	if ok {
		return ch
	}
	closed := make(chan struct{})
	close(closed)
	return closed
}
