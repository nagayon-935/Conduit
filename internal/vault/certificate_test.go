package vault

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestClient creates a vault.Client that points at the given URL.
// It uses NewClient with the test server URL so that real HTTP calls go to the mock.
func newTestClient(t *testing.T, serverURL string) *Client {
	t.Helper()
	c, err := NewClient(serverURL, "test-token", "ssh", "conduit-role")
	if err != nil {
		t.Fatalf("newTestClient: %v", err)
	}
	return c
}

func TestSignPublicKey_Success(t *testing.T) {
	t.Parallel()

	want := "ssh-rsa-cert-v01@openssh.com AAAA..."
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := vaultResponse{
			Data: &signData{SignedKey: want},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := newTestClient(t, srv.URL)
	got, err := c.SignPublicKey(context.Background(), "ssh-ed25519 AAAA...", "testuser")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != want {
		t.Errorf("signed_key mismatch: got %q, want %q", got, want)
	}
}

func TestSignPublicKey_VaultError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"errors": []string{"permission denied"},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := newTestClient(t, srv.URL)
	_, err := c.SignPublicKey(context.Background(), "ssh-ed25519 AAAA...", "testuser")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("error does not contain 'permission denied': %v", err)
	}
}

func TestSignPublicKey_NetworkError(t *testing.T) {
	t.Parallel()

	// Start a server that immediately closes the connection.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()
	defer ln.Close()

	addr := fmt.Sprintf("http://%s", ln.Addr().String())
	c := newTestClient(t, addr)
	_, err = c.SignPublicKey(context.Background(), "ssh-ed25519 AAAA...", "testuser")
	if err == nil {
		t.Fatal("expected error from closed connection, got nil")
	}
}

func TestSignPublicKey_EmptySignedKey(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := vaultResponse{
			Data: &signData{SignedKey: ""},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := newTestClient(t, srv.URL)
	_, err := c.SignPublicKey(context.Background(), "ssh-ed25519 AAAA...", "testuser")
	if err == nil {
		t.Fatal("expected error for empty signed_key, got nil")
	}
	if !strings.Contains(err.Error(), "signed_key") {
		t.Errorf("error does not mention signed_key: %v", err)
	}
}

func TestSignPublicKey_InvalidJSON(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{not valid json`))
	}))
	defer srv.Close()

	c := newTestClient(t, srv.URL)
	_, err := c.SignPublicKey(context.Background(), "ssh-ed25519 AAAA...", "testuser")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestSignPublicKey_ContextCancellation(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep long enough for the context to be cancelled before we respond.
		time.Sleep(500 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	// Cancel after 10 ms; server sleeps 500 ms, so request should fail.
	go func() {
		time.Sleep(10 * time.Millisecond)
		cancel()
	}()

	c := newTestClient(t, srv.URL)
	_, err := c.SignPublicKey(ctx, "ssh-ed25519 AAAA...", "testuser")
	if err == nil {
		t.Fatal("expected context cancellation error, got nil")
	}
	if !strings.Contains(err.Error(), "context") && !strings.Contains(err.Error(), "cancel") {
		t.Errorf("error does not indicate context cancellation: %v", err)
	}
}
