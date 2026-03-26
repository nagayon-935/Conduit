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

	// Capture the detach channel before starting pumps.
	// Closed by DetachWebSocket() when this WebSocket connection is severed.
	detached := sess.WebSocketDetached()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Start connection-scoped pumps (readPump + writePump) for this WebSocket.
	// Session-scoped pumps (sshToClientPump, stdinForwarder) were started in handleConnect.
	tunnel.StartPumps(ctx, sess, tunnel.DefaultPumpConfig())

	// Block until:
	//   (a) the SSH session terminates → send exit frame and return
	//   (b) the WebSocket is detached (browser closed) → return; SSH session stays alive
	//   (c) the HTTP request context is cancelled
	select {
	case <-ctx.Done():
	case <-sess.Done():
		// SSH session ended — notify client so it doesn't attempt reconnection.
		sendWSExit(sess.GetWebSocket())
	case <-detached:
		// WebSocket disconnected; handler exits so pumps stop.
		// SSH session remains alive within the grace period.
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
