package api

import (
	"net/http"
)

// handleListSessions returns a JSON array of all active sessions for the admin UI.
func (h *Handler) handleListSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.sessions.List())
}

// handleKillSession forcefully terminates a session by token.
func (h *Handler) handleKillSession(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		apiError(w, http.StatusBadRequest, "token is required", "BAD_REQUEST")
		return
	}
	if err := h.sessions.Terminate(token); err != nil {
		apiError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
