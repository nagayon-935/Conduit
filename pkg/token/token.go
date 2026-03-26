package token

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// Generate returns a cryptographically secure random token as a 64-character hex string (32 bytes).
func Generate() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("token: failed to read random bytes: %w", err)
	}
	return hex.EncodeToString(b), nil
}
