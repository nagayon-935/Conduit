package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/nagayon-935/conduit/internal/connlog"
	"github.com/nagayon-935/conduit/internal/session"
	"github.com/nagayon-935/conduit/internal/sshconn"
	pkgtoken "github.com/nagayon-935/conduit/pkg/token"
)

const (
	timeFormatUTC = "2006-01-02T15:04:05Z"
	maxPort       = 65535
)

// ConnectRequest is the JSON body for POST /api/connect.
type ConnectRequest struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthType   string `json:"auth_type"`             // "vault" | "password" | "pubkey"
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"private_key,omitempty"`
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

	slog.Info("connect request received", "host", req.Host, "port", req.Port, "user", req.User, "auth_type", req.AuthType)

	var dialReq sshconn.ConnectRequest

	switch req.AuthType {
	case "password":
		dialReq = sshconn.ConnectRequest{
			Host:     req.Host,
			Port:     req.Port,
			User:     req.User,
			AuthType: "password",
			Password: req.Password,
		}
	case "pubkey":
		dialReq = sshconn.ConnectRequest{
			Host:           req.Host,
			Port:           req.Port,
			User:           req.User,
			AuthType:       "pubkey",
			UserPrivateKey: []byte(req.PrivateKey),
		}
	default: // "vault" or ""
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

		dialReq = sshconn.ConnectRequest{
			Host:        req.Host,
			Port:        req.Port,
			User:        req.User,
			AuthType:    "vault",
			PrivateKey:  privateKeyPEM,
			Certificate: []byte(signedCert),
		}
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

	sess := session.NewSession(token, req.Host, req.Port, req.User, sshClient, sshSess, stdin, stdout)
	if err := h.sessions.Create(sess); err != nil {
		slog.Error("session creation failed", "error", err)
		sess.Close()
		apiError(w, http.StatusInternalServerError, "session creation failed", "SESSION_ERROR")
		return
	}

	// Step 5: Record connection in the log.
	logID, _ := pkgtoken.Generate()
	h.logs.Add(&connlog.Entry{
		ID:          logID,
		Host:        req.Host,
		Port:        req.Port,
		User:        req.User,
		ConnectedAt: time.Now(),
	})

	slog.Info("session created successfully", "token", token, "host", req.Host)

	writeJSON(w, http.StatusCreated, ConnectResponse{
		SessionToken: token,
		ExpiresAt:    sess.ExpiresAt.UTC().Format(timeFormatUTC),
		Message:      fmt.Sprintf("SSH session established to %s:%d", req.Host, req.Port),
	})
}

// validateConnectRequest performs basic input validation.
func validateConnectRequest(req ConnectRequest) error {
	if strings.TrimSpace(req.Host) == "" {
		return fmt.Errorf("host is required")
	}
	if req.Port <= 0 || req.Port > maxPort {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if strings.TrimSpace(req.User) == "" {
		return fmt.Errorf("user is required")
	}
	if req.AuthType == "password" && strings.TrimSpace(req.Password) == "" {
		return fmt.Errorf("password is required for password auth")
	}
	if req.AuthType == "pubkey" && strings.TrimSpace(req.PrivateKey) == "" {
		return fmt.Errorf("private_key is required for pubkey auth")
	}
	return nil
}
