package session

import (
	"testing"
	"time"
)

// newTestSessionWithForwards creates a session with the given allowed forward rules.
func newTestSessionWithForwards(token string, forwards []ForwardRule) *Session {
	return NewSession(token, "", 0, "", nil, nil, nil, nil, 15*time.Minute, forwards)
}

func TestIsForwardAllowed_Allowed(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 3000, RemoteHost: "grafana.mgmt", RemotePort: 3000},
	}
	sess := newTestSessionWithForwards("tok-fwd", forwards)

	if !sess.IsForwardAllowed("grafana.mgmt", 3000) {
		t.Error("IsForwardAllowed should return true for allowed rule")
	}
}

func TestIsForwardAllowed_CaseInsensitive(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 3000, RemoteHost: "Grafana.MGMT", RemotePort: 3000},
	}
	sess := newTestSessionWithForwards("tok-case", forwards)

	if !sess.IsForwardAllowed("grafana.mgmt", 3000) {
		t.Error("IsForwardAllowed should be case-insensitive for host matching")
	}
	if !sess.IsForwardAllowed("GRAFANA.MGMT", 3000) {
		t.Error("IsForwardAllowed should be case-insensitive for host matching (uppercase input)")
	}
}

func TestIsForwardAllowed_WrongPort(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 3000, RemoteHost: "grafana.mgmt", RemotePort: 3000},
	}
	sess := newTestSessionWithForwards("tok-port", forwards)

	if sess.IsForwardAllowed("grafana.mgmt", 9090) {
		t.Error("IsForwardAllowed should return false for wrong port")
	}
}

func TestIsForwardAllowed_WrongHost(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 3000, RemoteHost: "grafana.mgmt", RemotePort: 3000},
	}
	sess := newTestSessionWithForwards("tok-host", forwards)

	if sess.IsForwardAllowed("evil.host", 3000) {
		t.Error("IsForwardAllowed should return false for wrong host")
	}
}

func TestIsForwardAllowed_EmptyRules(t *testing.T) {
	t.Parallel()

	sess := newTestSessionWithForwards("tok-empty", nil)

	if sess.IsForwardAllowed("any.host", 3000) {
		t.Error("IsForwardAllowed should return false when no rules are set")
	}
}

func TestIsForwardAllowed_MultipleRules(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 3000, RemoteHost: "grafana.mgmt", RemotePort: 3000},
		{LocalPort: 9090, RemoteHost: "prometheus.mgmt", RemotePort: 9090},
	}
	sess := newTestSessionWithForwards("tok-multi", forwards)

	if !sess.IsForwardAllowed("grafana.mgmt", 3000) {
		t.Error("IsForwardAllowed should match first rule")
	}
	if !sess.IsForwardAllowed("prometheus.mgmt", 9090) {
		t.Error("IsForwardAllowed should match second rule")
	}
	if sess.IsForwardAllowed("other.host", 8080) {
		t.Error("IsForwardAllowed should not match non-existent rule")
	}
}

func TestNewSession_AllowedForwardsStored(t *testing.T) {
	t.Parallel()

	forwards := []ForwardRule{
		{LocalPort: 8080, RemoteHost: "app.internal", RemotePort: 80},
	}
	sess := NewSession("tok-store", "host", 22, "user", nil, nil, nil, nil, 15*time.Minute, forwards)

	if len(sess.AllowedForwards) != 1 {
		t.Fatalf("expected 1 forward rule, got %d", len(sess.AllowedForwards))
	}
	if sess.AllowedForwards[0].RemoteHost != "app.internal" {
		t.Errorf("RemoteHost = %q, want %q", sess.AllowedForwards[0].RemoteHost, "app.internal")
	}
}
