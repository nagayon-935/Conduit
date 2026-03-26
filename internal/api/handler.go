package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/nagayon-935/conduit/internal/config"
	"github.com/nagayon-935/conduit/internal/session"
	"github.com/nagayon-935/conduit/internal/sshconn"
	"github.com/nagayon-935/conduit/internal/vault"
)

// Handler is the root HTTP handler for the Conduit API.
type Handler struct {
	config   *config.Config
	sessions *session.Manager
	vault    vault.VaultClient
	dialer   sshconn.SSHDialer
	upgrader websocket.Upgrader
}

// NewHandler constructs a Handler wiring together all application dependencies.
func NewHandler(cfg *config.Config, sm *session.Manager, vc vault.VaultClient, d sshconn.SSHDialer) *Handler {
	return &Handler{
		config:   cfg,
		sessions: sm,
		vault:    vc,
		dialer:   d,
		upgrader: websocket.Upgrader{
			// Allow all origins for development; tighten for production.
			CheckOrigin: func(r *http.Request) bool { return true },
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
		},
	}
}

// Routes registers all API routes and returns the root http.Handler.
func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/connect", h.handleConnect)
	mux.HandleFunc("GET /ws", h.handleTerminal)
	mux.HandleFunc("GET /healthz", h.handleHealth)
	mux.HandleFunc("GET /api/sessions", h.handleListSessions)
	return corsMiddleware(loggingMiddleware(mux))
}

// handleHealth is a simple liveness probe.
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// apiError writes a structured JSON error response.
func apiError(w http.ResponseWriter, code int, message, errCode string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	body, _ := json.Marshal(map[string]string{
		"error": message,
		"code":  errCode,
	})
	_, _ = w.Write(body)
}

// writeJSON marshals v and writes it as a JSON response.
func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON: encode failed", "error", err)
	}
}

// corsMiddleware adds permissive CORS headers (suitable for development).
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware logs each incoming HTTP request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("http request", "method", r.Method, "path", r.URL.Path, "remote_addr", r.RemoteAddr)
		next.ServeHTTP(w, r)
	})
}
