package api

import (
	"net/http"
)

// handleListSessions returns a JSON array of all active sessions for the admin UI.
func (h *Handler) handleListSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.sessions.List())
}
