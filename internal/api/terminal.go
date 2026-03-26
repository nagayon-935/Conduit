package api

import (
	"crypto/rand"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/nagayon-935/conduit/internal/tunnel"
)

// handleTerminal implements GET /ws?token=<session_token>.
func (h *Handler) handleTerminal(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		apiError(w, http.StatusBadRequest, "token query parameter is required", "MISSING_TOKEN")
		return
	}

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err)
		return
	}
	defer ws.Close()

	connID := generateConnID()

	sess, removedCh, err := h.sessions.Attach(token, connID, ws)
	if err != nil {
		slog.Warn("session attach failed", "token", token, "error", err)
		sendWSError(ws, err.Error())
		return
	}

	slog.Info("terminal connected", "token", token, "connID", connID)

	cfg := tunnel.DefaultPumpConfig()

	// Start session-level pumps exactly once (shared across all tabs).
	sess.StartOnce(func() {
		tunnel.StartSessionPumps(sess.Context(), sess, cfg)
	})

	// Start per-connection write pump for this WebSocket.
	tunnel.StartConnectionPump(connID, ws, sess, cfg)

	// Block until this connection closes or the session terminates.
	select {
	case <-sess.Done():
		sendWSExit(ws)
	case <-removedCh:
		// writePump already called RemoveWebSocket; grace period may have started.
	}

	slog.Info("terminal disconnected", "token", token, "connID", connID)
}

func generateConnID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

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

func sendWSError(ws *websocket.Conn, message string) {
	type errMsg struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := ws.WriteJSON(errMsg{Type: "error", Message: message}); err != nil {
		slog.Warn("sendWSError: write failed", "error", err)
	}
}
