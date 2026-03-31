package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nagayon-935/conduit/internal/session"
)

// TestHandleForward_NotFound verifies that /api/forward/ with an unknown token returns 404.
func TestHandleForward_NotFound(t *testing.T) {
	t.Parallel()

	handler := newTestHandler(mockVaultOK(), mockDialerOK())
	req := httptest.NewRequest(http.MethodGet, "/api/forward/host.local/3000", nil)
	req.AddCookie(&http.Cookie{Name: "conduit_forward_token", Value: "nonexistent-token"})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body: %s", w.Code, w.Body.String())
	}
}

// TestHandleForward_Forbidden verifies that a valid session token but disallowed host/port returns 403.
func TestHandleForward_Forbidden(t *testing.T) {
	t.Parallel()

	handler := newTestHandler(mockVaultOK(), mockDialerOK())

	// Create a session with a specific forward rule.
	w := postJSON(t, handler, "/api/connect", map[string]any{
		"host":      "10.0.0.1",
		"port":      22,
		"user":      "ubuntu",
		"auth_type": "vault",
		"local_forwards": []map[string]any{
			{"local_port": 3000, "remote_host": "grafana.mgmt", "remote_port": 3000},
		},
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("connect status = %d, want 201; body: %s", w.Code, w.Body.String())
	}
	body := decodeJSONBody(t, w)
	token := body["session_token"].(string)

	// Try to forward to a disallowed host/port.
	req := httptest.NewRequest(http.MethodGet, "/api/forward/evil.host/9999", nil)
	req.AddCookie(&http.Cookie{Name: "conduit_forward_token", Value: token})
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req)

	if w2.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body: %s", w2.Code, w2.Body.String())
	}
}

// TestHandleForward_NoSSHClient verifies that a session with nil SSHClient returns 502.
func TestHandleForward_NoSSHClient(t *testing.T) {
	t.Parallel()

	handler := newTestHandler(mockVaultOK(), mockDialerOK())

	// Create a session — mockDialerOK returns nil SSHClient.
	w := postJSON(t, handler, "/api/connect", map[string]any{
		"host":      "10.0.0.1",
		"port":      22,
		"user":      "ubuntu",
		"auth_type": "vault",
		"local_forwards": []map[string]any{
			{"local_port": 3000, "remote_host": "grafana.mgmt", "remote_port": 3000},
		},
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("connect status = %d, want 201; body: %s", w.Code, w.Body.String())
	}
	body := decodeJSONBody(t, w)
	token := body["session_token"].(string)

	// Try to forward to an allowed host/port but SSHClient is nil.
	req := httptest.NewRequest(http.MethodGet, "/api/forward/grafana.mgmt/3000", nil)
	req.AddCookie(&http.Cookie{Name: "conduit_forward_token", Value: token})
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req)

	if w2.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body: %s", w2.Code, w2.Body.String())
	}
}

// TestHandleConnect_LocalForwards_ResponseContainsForwardBaseURL verifies that
// the connect response includes a forward_base_url when local_forwards are specified.
func TestHandleConnect_LocalForwards_ResponseContainsForwardBaseURL(t *testing.T) {
	t.Parallel()

	handler := newTestHandler(mockVaultOK(), mockDialerOK())
	w := postJSON(t, handler, "/api/connect", map[string]any{
		"host":      "10.0.0.1",
		"port":      22,
		"user":      "ubuntu",
		"auth_type": "vault",
		"local_forwards": []map[string]any{
			{"local_port": 3000, "remote_host": "grafana.mgmt", "remote_port": 3000},
		},
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", w.Code, w.Body.String())
	}
	body := decodeJSONBody(t, w)

	forwardBaseURL, ok := body["forward_base_url"].(string)
	if !ok || forwardBaseURL == "" {
		t.Fatalf("forward_base_url missing or empty: %v", body)
	}

	expected := "/api/forward"
	if forwardBaseURL != expected {
		t.Errorf("forward_base_url = %q, want %q", forwardBaseURL, expected)
	}
}

// TestHandleConnect_NoLocalForwards_NoForwardBaseURL verifies that when no local_forwards
// are specified, the connect response does not include forward_base_url.
func TestHandleConnect_NoLocalForwards_NoForwardBaseURL(t *testing.T) {
	t.Parallel()

	handler := newTestHandler(mockVaultOK(), mockDialerOK())
	w := postJSON(t, handler, "/api/connect", map[string]any{
		"host":      "10.0.0.1",
		"port":      22,
		"user":      "ubuntu",
		"auth_type": "vault",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", w.Code, w.Body.String())
	}
	body := decodeJSONBody(t, w)

	// forward_base_url should be absent or empty when no local_forwards are requested.
	if url, ok := body["forward_base_url"].(string); ok && url != "" {
		t.Errorf("forward_base_url should be empty, got %q", url)
	}
}

// TestIsForwardAllowed verifies the session-level forward rule checks via a round-trip.
func TestIsForwardAllowed_ViaSession(t *testing.T) {
	t.Parallel()

	forwards := []session.ForwardRule{
		{LocalPort: 3000, RemoteHost: "grafana.mgmt", RemotePort: 3000},
	}
	sess := session.NewSession("test-fwd", "host", 22, "user", nil, nil, nil, nil, 0, forwards)

	tests := []struct {
		host    string
		port    int
		allowed bool
	}{
		{"grafana.mgmt", 3000, true},
		{"GRAFANA.MGMT", 3000, true},
		{"grafana.mgmt", 9090, false},
		{"other.host", 3000, false},
	}
	for _, tt := range tests {
		got := sess.IsForwardAllowed(tt.host, tt.port)
		if got != tt.allowed {
			t.Errorf("IsForwardAllowed(%q, %d) = %v, want %v", tt.host, tt.port, got, tt.allowed)
		}
	}
}
