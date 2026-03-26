package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/nagayon-935/conduit/internal/session"
	"github.com/nagayon-935/conduit/internal/sshconn"
	"github.com/nagayon-935/conduit/internal/tunnel"
	pkgtoken "github.com/nagayon-935/conduit/pkg/token"
)

// ConnectRequest is the JSON body for POST /api/connect.
type ConnectRequest struct {
	Host string `json:"host"`
	Port int    `json:"port"`
	User string `json:"user"`
}

// ConnectResponse is returned on a successful connection.
type ConnectResponse struct {
	SessionToken string `json:"session_token"`
	ExpiresAt    string `json:"expires_at"`
	Message      string `json:"message"`
}

// handleConnect implements POST /api/connect.
// It generates a key pair, signs it via Vault, dials SSH, and registers a session.
func (h *Handler) handleConnect(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid JSON body", "BAD_REQUEST")
		return
	}
	defer r.Body.Close()

	if err := validateConnectRequest(req); err != nil {
		apiError(w, http.StatusBadRequest, err.Error(), "INVALID_REQUEST")
		return
	}

	slog.Info("connect request received", "host", req.Host, "port", req.Port, "user", req.User)

	// Step 1: Generate in-memory ED25519 key pair.
	privateKeyPEM, publicKeyOpenSSH, err := sshconn.GenerateKeyPair()
	if err != nil {
		slog.Error("key pair generation failed", "error", err)
		apiError(w, http.StatusInternalServerError, "key generation failed", "KEY_GEN_ERROR")
		return
	}

	// Step 2: Sign the public key with Vault.
	signedCert, err := h.vault.SignPublicKey(r.Context(), publicKeyOpenSSH, req.User)
	if err != nil {
		slog.Error("vault signing failed", "error", err)
		apiError(w, http.StatusBadGateway, "vault signing failed: "+err.Error(), "VAULT_ERROR")
		return
	}

	// Step 3: Dial SSH using the signed certificate.
	dialReq := sshconn.ConnectRequest{
		Host:        req.Host,
		Port:        req.Port,
		User:        req.User,
		PrivateKey:  privateKeyPEM,
		Certificate: []byte(signedCert),
	}

	sshClient, sshSess, stdin, stdout, err := h.dialer.Dial(r.Context(), dialReq)
	if err != nil {
		slog.Error("SSH dial failed", "host", req.Host, "port", req.Port, "error", err)
		apiError(w, http.StatusBadGateway, "SSH connection failed: "+err.Error(), "SSH_DIAL_ERROR")
		return
	}

	// Step 4: Generate session token and create the session.
	token, err := pkgtoken.Generate()
	if err != nil {
		slog.Error("token generation failed", "error", err)
		_ = sshSess.Close()
		_ = sshClient.Close()
		apiError(w, http.StatusInternalServerError, "token generation failed", "TOKEN_GEN_ERROR")
		return
	}

	sess := session.NewSession(token, sshClient, sshSess, stdin, stdout)
	if err := h.sessions.Create(sess); err != nil {
		slog.Error("session creation failed", "error", err)
		sess.Close()
		apiError(w, http.StatusInternalServerError, "session creation failed", "SESSION_ERROR")
		return
	}

	// Start session-scoped goroutines (live for the entire SSH session lifetime).
	// These run independently of WebSocket connections, enabling the grace period.
	tunnel.StartSessionPumps(context.Background(), sess, tunnel.DefaultPumpConfig())

	slog.Info("session created successfully", "token", token, "host", req.Host)

	writeJSON(w, http.StatusCreated, ConnectResponse{
		SessionToken: token,
		ExpiresAt:    sess.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z"),
		Message:      fmt.Sprintf("SSH session established to %s:%d", req.Host, req.Port),
	})
}

// validateConnectRequest performs basic input validation.
func validateConnectRequest(req ConnectRequest) error {
	if strings.TrimSpace(req.Host) == "" {
		return fmt.Errorf("host is required")
	}
	if req.Port <= 0 || req.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if strings.TrimSpace(req.User) == "" {
		return fmt.Errorf("user is required")
	}
	return nil
}
