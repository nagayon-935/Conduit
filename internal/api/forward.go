package api

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"
)

// handleForward proxies HTTP or WebSocket traffic over an SSH tunnel.
// URL pattern: /api/forward/{remote_host}/{remote_port}[/{path...}]
// The session token is read from the "conduit_forward_token" cookie.
func (h *Handler) handleForward(w http.ResponseWriter, r *http.Request) {
	// Read session token from cookie.
	cookie, err := r.Cookie("conduit_forward_token")
	if err != nil {
		http.Error(w, "missing conduit_forward_token cookie", http.StatusUnauthorized)
		return
	}
	token := cookie.Value

	// Extract path segments after /api/forward/
	// Pattern: /api/forward/<host>/<port>[/<path...>]
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/forward/")
	parts := strings.SplitN(trimmed, "/", 3)
	if len(parts) < 2 {
		http.Error(w, "invalid forward path", http.StatusBadRequest)
		return
	}

	remoteHost := parts[0]
	remotePortStr := parts[1]
	var remainingPath string
	if len(parts) == 3 {
		remainingPath = "/" + parts[2]
	} else {
		remainingPath = "/"
	}

	remotePort, err := strconv.Atoi(remotePortStr)
	if err != nil {
		http.Error(w, "invalid port", http.StatusBadRequest)
		return
	}

	// Validate session.
	sess, err := h.sessions.Get(token)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Check forward policy and get the target scheme.
	scheme, allowed := sess.ForwardScheme(remoteHost, remotePort)
	if !allowed {
		http.Error(w, "forward not allowed", http.StatusForbidden)
		return
	}

	// Ensure we have an active SSH client.
	if sess.SSHClient == nil {
		http.Error(w, "no SSH client available", http.StatusBadGateway)
		return
	}

	addr := net.JoinHostPort(remoteHost, strconv.Itoa(remotePort))

	// WebSocket upgrade path.
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		remoteConn, dialErr := sess.SSHClient.Dial("tcp", addr)
		if dialErr != nil {
			http.Error(w, fmt.Sprintf("tunnel dial failed: %v", dialErr), http.StatusBadGateway)
			return
		}
		defer remoteConn.Close()

		// Forward the original HTTP upgrade request to the remote.
		if writeErr := r.Write(remoteConn); writeErr != nil {
			http.Error(w, fmt.Sprintf("request forward failed: %v", writeErr), http.StatusBadGateway)
			return
		}

		// Hijack the client connection.
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "hijacking not supported", http.StatusInternalServerError)
			return
		}
		clientConn, _, hijackErr := hijacker.Hijack()
		if hijackErr != nil {
			return
		}
		defer clientConn.Close()

		// Bidirectional copy.
		done := make(chan struct{}, 2)
		go func() { _, _ = io.Copy(remoteConn, clientConn); done <- struct{}{} }()
		go func() { _, _ = io.Copy(clientConn, remoteConn); done <- struct{}{} }()
		<-done
		return
	}

	// Plain HTTP/HTTPS reverse proxy path.
	transport := &http.Transport{
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			return sess.SSHClient.Dial("tcp", addr)
		},
	}
	if scheme == "https" {
		transport.TLSClientConfig = &tls.Config{
			// The remote end is accessed via SSH tunnel; skip cert verification
			// since the host's name may not match any issued certificate.
			InsecureSkipVerify: true, //nolint:gosec
			ServerName:         remoteHost,
		}
	}
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = scheme
			req.URL.Host = addr
			req.URL.Path = remainingPath
			if req.URL.RawQuery != "" {
				req.URL.Path = remainingPath
			}
			req.Host = addr
		},
		Transport: transport,
		ModifyResponse: func(resp *http.Response) error {
			loc := resp.Header.Get("Location")
			if loc == "" {
				return nil
			}
			// Rewrite absolute Location headers to go through the proxy.
			parsed, parseErr := http.NewRequest("GET", loc, nil)
			if parseErr != nil {
				return nil
			}
			base := "/api/forward/" + remoteHost + "/" + remotePortStr
			resp.Header.Set("Location", base+parsed.URL.Path)
			return nil
		},
	}
	proxy.ServeHTTP(w, r)
}
