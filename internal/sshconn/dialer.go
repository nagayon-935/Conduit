package sshconn

import (
	"context"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	dialTimeout     = 15 * time.Second
	defaultPTYRows  = 24
	defaultPTYCols  = 80
	termBaudRate    = 14400
	termType        = "xterm-256color"
)

// ConnectRequest carries all parameters needed to establish an SSH session.
type ConnectRequest struct {
	Host     string
	Port     int
	User     string
	AuthType string // "vault" | "password" | "pubkey"
	// vault
	PrivateKey  []byte // PEM-encoded ED25519 private key
	Certificate []byte // Vault-issued SSH certificate (OpenSSH format string as bytes)
	// password
	Password string
	// pubkey (user-provided)
	UserPrivateKey []byte
}

// SSHDialer is the interface for dialing SSH connections.
type SSHDialer interface {
	// Dial opens an SSH connection and allocates a PTY session.
	// Returns: SSH client, SSH session, stdin writer, stdout reader, error.
	Dial(ctx context.Context, req ConnectRequest) (*ssh.Client, *ssh.Session, io.WriteCloser, io.Reader, error)
}

// Dialer is the concrete implementation of SSHDialer.
type Dialer struct{}

// NewDialer constructs a Dialer.
func NewDialer() *Dialer {
	return &Dialer{}
}

// Dial connects to the SSH server described in req, requests a PTY, and starts a shell.
func (d *Dialer) Dial(ctx context.Context, req ConnectRequest) (*ssh.Client, *ssh.Session, io.WriteCloser, io.Reader, error) {
	var authMethods []ssh.AuthMethod

	switch req.AuthType {
	case "password":
		authMethods = []ssh.AuthMethod{ssh.Password(req.Password)}
	case "pubkey":
		signer, err := ssh.ParsePrivateKey(req.UserPrivateKey)
		if err != nil {
			return nil, nil, nil, nil, fmt.Errorf("sshconn: parse user private key: %w", err)
		}
		authMethods = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	default: // "vault" or ""
		signer, err := buildCertSigner(req.PrivateKey, req.Certificate)
		if err != nil {
			return nil, nil, nil, nil, fmt.Errorf("sshconn: build cert signer: %w", err)
		}
		authMethods = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	}

	sshCfg := &ssh.ClientConfig{
		User: req.User,
		Auth: authMethods,
		// In a production environment this should be replaced with a proper host key callback.
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
		Timeout:         dialTimeout,
	}

	addr := net.JoinHostPort(req.Host, fmt.Sprintf("%d", req.Port))

	// Honour context deadline / cancellation for the dial phase.
	type dialResult struct {
		client *ssh.Client
		err    error
	}
	ch := make(chan dialResult, 1)
	go func() {
		client, err := ssh.Dial("tcp", addr, sshCfg)
		ch <- dialResult{client, err}
	}()

	var client *ssh.Client
	select {
	case <-ctx.Done():
		return nil, nil, nil, nil, fmt.Errorf("sshconn: context cancelled while dialing: %w", ctx.Err())
	case res := <-ch:
		if res.err != nil {
			return nil, nil, nil, nil, fmt.Errorf("sshconn: dial %s: %w", addr, res.err)
		}
		client = res.client
	}

	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, nil, nil, nil, fmt.Errorf("sshconn: new session: %w", err)
	}

	// If anything fails after session creation, clean up both session and client.
	cleanup := func() { sess.Close(); client.Close() }

	// Request PTY with sane defaults.
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: termBaudRate,
		ssh.TTY_OP_OSPEED: termBaudRate,
	}
	if err := sess.RequestPty(termType, defaultPTYRows, defaultPTYCols, modes); err != nil {
		cleanup()
		return nil, nil, nil, nil, fmt.Errorf("sshconn: request PTY: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		cleanup()
		return nil, nil, nil, nil, fmt.Errorf("sshconn: stdin pipe: %w", err)
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		cleanup()
		return nil, nil, nil, nil, fmt.Errorf("sshconn: stdout pipe: %w", err)
	}

	if err := sess.Shell(); err != nil {
		cleanup()
		return nil, nil, nil, nil, fmt.Errorf("sshconn: start shell: %w", err)
	}

	return client, sess, stdin, stdout, nil
}

// buildCertSigner constructs an ssh.Signer that authenticates with a Vault-issued certificate.
func buildCertSigner(privateKeyPEM []byte, certBytes []byte) (ssh.Signer, error) {
	signer, err := ssh.ParsePrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	certStr := strings.TrimSpace(string(certBytes))
	if certStr == "" {
		return nil, fmt.Errorf("certificate is empty")
	}

	pubKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(certStr))
	if err != nil {
		return nil, fmt.Errorf("parse certificate: %w", err)
	}

	cert, ok := pubKey.(*ssh.Certificate)
	if !ok {
		return nil, fmt.Errorf("parsed key is not an SSH certificate")
	}

	certSigner, err := ssh.NewCertSigner(cert, signer)
	if err != nil {
		return nil, fmt.Errorf("new cert signer: %w", err)
	}

	return certSigner, nil
}
