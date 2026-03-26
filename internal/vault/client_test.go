package vault

import (
	"testing"
)

// TestNewClient_Success verifies that NewClient returns a non-nil client when all params are valid.
func TestNewClient_Success(t *testing.T) {
	t.Parallel()

	c, err := NewClient("http://127.0.0.1:8200", "root-token", "ssh", "signer")
	if err != nil {
		t.Fatalf("NewClient: unexpected error: %v", err)
	}
	if c == nil {
		t.Fatal("NewClient: returned nil client")
	}
}

// TestNewClient_EmptyAddr verifies that NewClient rejects an empty address.
func TestNewClient_EmptyAddr(t *testing.T) {
	t.Parallel()

	_, err := NewClient("", "root-token", "ssh", "signer")
	if err == nil {
		t.Fatal("expected error for empty addr, got nil")
	}
}

// TestNewClient_EmptyToken verifies that NewClient rejects an empty token.
func TestNewClient_EmptyToken(t *testing.T) {
	t.Parallel()

	_, err := NewClient("http://127.0.0.1:8200", "", "ssh", "signer")
	if err == nil {
		t.Fatal("expected error for empty token, got nil")
	}
}

// TestNewClient_EmptySshMount verifies that NewClient rejects an empty sshMount.
func TestNewClient_EmptySshMount(t *testing.T) {
	t.Parallel()

	_, err := NewClient("http://127.0.0.1:8200", "root-token", "", "signer")
	if err == nil {
		t.Fatal("expected error for empty sshMount, got nil")
	}
}

// TestNewClient_EmptySshRole verifies that NewClient rejects an empty sshRole.
func TestNewClient_EmptySshRole(t *testing.T) {
	t.Parallel()

	_, err := NewClient("http://127.0.0.1:8200", "root-token", "ssh", "")
	if err == nil {
		t.Fatal("expected error for empty sshRole, got nil")
	}
}
