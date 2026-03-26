package session

import (
	"testing"
	"time"

	"github.com/nagayon-935/conduit/internal/config"
)

func testConfig() *config.Config {
	return &config.Config{
		GracePeriod:       15 * time.Minute,
		SessionGCInterval: 1 * time.Minute,
	}
}

// newTestSession builds a minimal Session with the given token (no real SSH client/session).
func newTestSession(token string) *Session {
	return NewSession(token, nil, nil, nil, nil)
}

func TestSessionManager_CreateAndGet(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	sess := newTestSession("tok-1")
	if err := m.Create(sess); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := m.Get("tok-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Token != "tok-1" {
		t.Errorf("token mismatch: got %q, want %q", got.Token, "tok-1")
	}
}

func TestSessionManager_GetNonExistent(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	_, err := m.Get("does-not-exist")
	if err == nil {
		t.Fatal("expected error for non-existent token, got nil")
	}
}

func TestSessionManager_Attach(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	sess := newTestSession("tok-attach")
	if err := m.Create(sess); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Attach nil WebSocket – SetWebSocket(nil) is valid and simply records nil.
	got, err := m.Attach("tok-attach", nil)
	if err != nil {
		t.Fatalf("Attach: %v", err)
	}
	if got.State != StateConnected {
		t.Errorf("state: got %v, want StateConnected", got.State)
	}
}

func TestSessionManager_AttachExpiredSession(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	sess := newTestSession("tok-expired")
	// Backdate the expiry so the session is already expired.
	sess.ExpiresAt = time.Now().Add(-1 * time.Second)
	if err := m.Create(sess); err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err := m.Attach("tok-expired", nil)
	if err == nil {
		t.Fatal("expected error for expired session, got nil")
	}
}

func TestSessionManager_Terminate(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	sess := newTestSession("tok-term")
	if err := m.Create(sess); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := m.Terminate("tok-term"); err != nil {
		t.Fatalf("Terminate: %v", err)
	}

	// After termination, Get should fail because the session is removed from the store.
	_, err := m.Get("tok-term")
	if err == nil {
		t.Fatal("expected error after termination, got nil")
	}
}

func TestSessionManager_GC(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())

	// Create 3 sessions.
	s1 := newTestSession("gc-1")
	s2 := newTestSession("gc-2")
	s3 := newTestSession("gc-3")

	// Expire two of them.
	s1.ExpiresAt = time.Now().Add(-1 * time.Second)
	s2.ExpiresAt = time.Now().Add(-1 * time.Second)

	for _, s := range []*Session{s1, s2, s3} {
		if err := m.Create(s); err != nil {
			t.Fatalf("Create %s: %v", s.Token, err)
		}
	}

	// Run GC directly.
	m.gc()

	// gc-1 and gc-2 should be gone.
	if _, err := m.Get("gc-1"); err == nil {
		t.Error("expected gc-1 to be reaped, but Get succeeded")
	}
	if _, err := m.Get("gc-2"); err == nil {
		t.Error("expected gc-2 to be reaped, but Get succeeded")
	}

	// gc-3 should still exist.
	if _, err := m.Get("gc-3"); err != nil {
		t.Errorf("expected gc-3 to survive GC, got: %v", err)
	}
}

func TestSessionManager_GracePeriodReconnect(t *testing.T) {
	t.Parallel()

	m := NewManager(testConfig())
	sess := newTestSession("tok-grace")
	if err := m.Create(sess); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Attach then detach (simulate disconnect).
	if _, err := m.Attach("tok-grace", nil); err != nil {
		t.Fatalf("Attach: %v", err)
	}
	sess.DetachWebSocket()

	// Verify the session is still in the store (grace period hasn't elapsed).
	if _, err := m.Get("tok-grace"); err != nil {
		t.Fatalf("session should still exist within grace period: %v", err)
	}

	// Reconnect before grace period expires.
	got, err := m.Attach("tok-grace", nil)
	if err != nil {
		t.Fatalf("second Attach (reconnect): %v", err)
	}
	if got.State != StateConnected {
		t.Errorf("state after reconnect: got %v, want StateConnected", got.State)
	}
}

// --- Session method tests ---

// TestSession_Done_NotNil checks that Done() returns a non-nil channel.
func TestSession_Done_NotNil(t *testing.T) {
	t.Parallel()
	s := newTestSession("done-test")
	if s.Done() == nil {
		t.Fatal("Done() returned nil channel")
	}
}

// TestSession_Done_ClosedAfterClose checks that Done() is closed after Close().
func TestSession_Done_ClosedAfterClose(t *testing.T) {
	t.Parallel()
	s := newTestSession("done-close-test")
	s.Close()
	select {
	case <-s.Done():
		// expected: channel closed
	default:
		t.Fatal("Done() channel not closed after Close()")
	}
}

// TestSession_GetWebSocket_InitiallyNil checks that a new session has no WebSocket.
func TestSession_GetWebSocket_InitiallyNil(t *testing.T) {
	t.Parallel()
	s := newTestSession("ws-nil-test")
	if ws := s.GetWebSocket(); ws != nil {
		t.Errorf("expected nil WebSocket on new session, got %v", ws)
	}
}

// TestSession_Close_Idempotent verifies that calling Close() twice does not panic.
func TestSession_Close_Idempotent(t *testing.T) {
	t.Parallel()
	s := newTestSession("close-idempotent-test")
	s.Close()
	// Second call must not panic (double-close of done channel would panic without guard).
	s.Close()
	if s.State != StateTerminated {
		t.Errorf("state = %v, want StateTerminated", s.State)
	}
}

// TestSession_IsExpired_False confirms a freshly created session is not expired.
func TestSession_IsExpired_False(t *testing.T) {
	t.Parallel()
	s := newTestSession("not-expired")
	if s.IsExpired() {
		t.Error("newly created session should not be expired")
	}
}

// TestSession_IsExpired_True confirms a backdated session is expired.
func TestSession_IsExpired_True(t *testing.T) {
	t.Parallel()
	s := newTestSession("expired")
	s.ExpiresAt = time.Now().Add(-1 * time.Second)
	if !s.IsExpired() {
		t.Error("backdated session should be expired")
	}
}

// TestSession_DetachWebSocket_SetsStateDisconnected verifies DetachWebSocket transitions the state.
func TestSession_DetachWebSocket_SetsStateDisconnected(t *testing.T) {
	t.Parallel()
	s := newTestSession("detach-test")
	s.DetachWebSocket()
	if s.State != StateDisconnected {
		t.Errorf("state = %v, want StateDisconnected", s.State)
	}
}

// TestSessionManager_CreateEmptyToken verifies that Create rejects a session with no token.
func TestSessionManager_CreateEmptyToken(t *testing.T) {
	t.Parallel()
	m := NewManager(testConfig())
	s := newTestSession("") // empty token
	if err := m.Create(s); err == nil {
		t.Fatal("expected error for empty-token Create, got nil")
	}
}

// TestSessionManager_TerminateNonExistent verifies that Terminate on a missing token returns an error.
func TestSessionManager_TerminateNonExistent(t *testing.T) {
	t.Parallel()
	m := NewManager(testConfig())
	if err := m.Terminate("no-such-token"); err == nil {
		t.Fatal("expected error for Terminate of non-existent session, got nil")
	}
}
