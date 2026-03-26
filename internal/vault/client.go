package vault

import (
	"context"
	"fmt"
)

// VaultClient defines the interface for interacting with HashiCorp Vault's SSH secrets engine.
type VaultClient interface {
	// SignPublicKey signs the given OpenSSH public key for the specified user principal.
	// It returns the signed certificate string in OpenSSH format.
	SignPublicKey(ctx context.Context, publicKey string, validPrincipal string) (string, error)
}

// Client is a concrete implementation of VaultClient backed by the Vault HTTP API.
type Client struct {
	addr      string
	token     string
	sshMount  string
	sshRole   string
	httpClient httpDoer
}

// NewClient constructs a Client pointing at the given Vault address.
func NewClient(addr, token, sshMount, sshRole string) (*Client, error) {
	if addr == "" {
		return nil, fmt.Errorf("vault: addr must not be empty")
	}
	if token == "" {
		return nil, fmt.Errorf("vault: token must not be empty")
	}
	if sshMount == "" {
		return nil, fmt.Errorf("vault: sshMount must not be empty")
	}
	if sshRole == "" {
		return nil, fmt.Errorf("vault: sshRole must not be empty")
	}

	return &Client{
		addr:       addr,
		token:      token,
		sshMount:   sshMount,
		sshRole:    sshRole,
		httpClient: newHTTPClient(),
	}, nil
}
