package api

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/nagayon-935/conduit/internal/tunnel"
)

// handleTerminal implements GET /ws?token=<session_token>.
// It upgrades the connection to WebSocket, attaches it to an existing session,
// and starts the bidirectional data pumps.
func (h *Handler) handleTerminal(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		apiError(w, http.StatusBadRequest, "token query parameter is required", "MISSING_TOKEN")
		return
	}

	// Upgrade to WebSocket before doing further work so the client receives the handshake.
	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err)
		return
	}

	// Attach WebSocket to the session. This validates the token, checks expiry,
	// and transitions the session to StateConnected.
	sess, err := h.sessions.Attach(token, ws)
	if err != nil {
		slog.Warn("session attach failed", "token", token, "error", err)
		sendWSError(ws, err.Error())
		_ = ws.Close()
		return
	}

	slog.Info("terminal connected", "token", token)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Start the stdin forwarder (FromClient → SSH stdin).
	tunnel.StartStdinForwarder(ctx, sess)

	// Start SSH stdout → ToClient pump and WebSocket read/write pumps.
	tunnel.StartPumps(ctx, sess, tunnel.DefaultPumpConfig())

	// Block until the session terminates or the request context is cancelled.
	// The pumps and forwarder are all running in goroutines; we just wait here.
	select {
	case <-ctx.Done():
	case <-sess.Done():
		// SSH session ended — notify client so it doesn't attempt reconnection.
		sendWSExit(sess.GetWebSocket())
	}

	slog.Info("terminal disconnected", "token", token)
	sess.DetachWebSocket()
}

// sendWSExit sends a JSON exit control frame to notify the client the SSH session ended.
func sendWSExit(ws *websocket.Conn) {
	if ws == nil {
		return
	}
	type exitMsg struct {
		Type string `json:"type"`
	}
	if err := ws.WriteJSON(exitMsg{Type: "exit"}); err != nil {
		slog.Warn("sendWSExit: write failed", "error", err)
	}
}

// sendWSError sends a JSON error control frame to the WebSocket client.
func sendWSError(ws *websocket.Conn, message string) {
	type errMsg struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	data := errMsg{Type: "error", Message: message}
	if err := ws.WriteJSON(data); err != nil {
		slog.Warn("sendWSError: write failed", "error", err)
	}
}
