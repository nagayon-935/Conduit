package api

import "net/http"

func (h *Handler) handleListLogs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.logs.List())
}
