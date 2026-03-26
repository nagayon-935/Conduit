package token

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

const tokenBytes = 32 // produces a 64-character hex string

// Generate returns a cryptographically secure random token as a 64-character hex string.
func Generate() (string, error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("token: failed to read random bytes: %w", err)
	}
	return hex.EncodeToString(b), nil
}
