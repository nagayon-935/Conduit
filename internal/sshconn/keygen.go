package sshconn

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"

	"golang.org/x/crypto/ssh"
)

// GenerateKeyPair generates an in-memory ED25519 key pair.
// Returns (privateKeyPEM, publicKeyOpenSSH, error).
// The private key is never written to disk.
func GenerateKeyPair() ([]byte, string, error) {
	pubKey, privKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, "", fmt.Errorf("keygen: failed to generate ED25519 key pair: %w", err)
	}

	// Encode private key as OpenSSH PEM format.
	privPEM, err := ssh.MarshalPrivateKey(privKey, "")
	if err != nil {
		return nil, "", fmt.Errorf("keygen: failed to marshal private key: %w", err)
	}

	privPEMBytes := pem.EncodeToMemory(privPEM)
	if privPEMBytes == nil {
		return nil, "", fmt.Errorf("keygen: failed to PEM-encode private key")
	}

	// Encode public key in OpenSSH authorized_keys format.
	sshPub, err := ssh.NewPublicKey(pubKey)
	if err != nil {
		return nil, "", fmt.Errorf("keygen: failed to create SSH public key: %w", err)
	}

	pubOpenSSH := string(ssh.MarshalAuthorizedKey(sshPub))

	return privPEMBytes, pubOpenSSH, nil
}
