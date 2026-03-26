package token_test

import (
	"encoding/hex"
	"testing"

	"github.com/nagayon-935/conduit/pkg/token"
)

// TestGenerate_Length はトークンが必ず64文字（32バイト hex）であることを検証する。
func TestGenerate_Length(t *testing.T) {
	t.Parallel()

	tok, err := token.Generate()
	if err != nil {
		t.Fatalf("Generate() returned unexpected error: %v", err)
	}
	if got := len(tok); got != 64 {
		t.Errorf("token length = %d, want 64", got)
	}
}

// TestGenerate_HexFormat はトークンが有効な小文字 hex 文字列であることを検証する。
func TestGenerate_HexFormat(t *testing.T) {
	t.Parallel()

	tok, err := token.Generate()
	if err != nil {
		t.Fatalf("Generate() returned unexpected error: %v", err)
	}
	if _, decErr := hex.DecodeString(tok); decErr != nil {
		t.Errorf("token %q is not valid hex: %v", tok, decErr)
	}
}

// TestGenerate_Uniqueness は1000回生成して重複がないことを検証する。
// crypto/rand の出力で重複が発生する確率は天文学的に低いため、
// 重複が発生した場合は乱数源の実装バグを意味する。
func TestGenerate_Uniqueness(t *testing.T) {
	t.Parallel()

	const n = 1000
	seen := make(map[string]struct{}, n)

	for i := range n {
		tok, err := token.Generate()
		if err != nil {
			t.Fatalf("Generate() [iteration %d] returned error: %v", i, err)
		}
		if _, exists := seen[tok]; exists {
			t.Fatalf("duplicate token generated at iteration %d: %s", i, tok)
		}
		seen[tok] = struct{}{}
	}
}

// TestGenerate_NoError は通常の環境でエラーが返らないことを検証する。
func TestGenerate_NoError(t *testing.T) {
	t.Parallel()

	if _, err := token.Generate(); err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
}
