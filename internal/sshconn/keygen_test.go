package sshconn

import (
	"encoding/pem"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

// TestGenerateKeyPair_PrivateKeyPEM は秘密鍵が正しい OpenSSH PEM 形式であることを検証する。
func TestGenerateKeyPair_PrivateKeyPEM(t *testing.T) {
	t.Parallel()

	privPEM, _, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair() error: %v", err)
	}

	block, rest := pem.Decode(privPEM)
	if block == nil {
		t.Fatal("private key is not valid PEM")
	}
	if len(rest) != 0 {
		t.Errorf("unexpected trailing bytes after PEM block: %d bytes", len(rest))
	}
	// golang.org/x/crypto/ssh は "OPENSSH PRIVATE KEY" ヘッダを使う
	if block.Type != "OPENSSH PRIVATE KEY" {
		t.Errorf("PEM type = %q, want %q", block.Type, "OPENSSH PRIVATE KEY")
	}
}

// TestGenerateKeyPair_PublicKeyOpenSSH は公開鍵が ssh.ParseAuthorizedKey で
// パース可能な OpenSSH 形式であることを検証する。
func TestGenerateKeyPair_PublicKeyOpenSSH(t *testing.T) {
	t.Parallel()

	_, pubOpenSSH, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair() error: %v", err)
	}

	pub, _, _, _, parseErr := ssh.ParseAuthorizedKey([]byte(pubOpenSSH))
	if parseErr != nil {
		t.Fatalf("public key is not valid OpenSSH format: %v", parseErr)
	}
	// ED25519 鍵であることを確認
	if pub.Type() != "ssh-ed25519" {
		t.Errorf("key type = %q, want %q", pub.Type(), "ssh-ed25519")
	}
}

// TestGenerateKeyPair_KeyPairConsistency は同じ呼び出しで返った秘密鍵と公開鍵が
// 対応するペアであることを検証する。
func TestGenerateKeyPair_KeyPairConsistency(t *testing.T) {
	t.Parallel()

	privPEM, pubOpenSSH, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair() error: %v", err)
	}

	// 秘密鍵から ssh.Signer を生成
	signer, err := ssh.ParsePrivateKey(privPEM)
	if err != nil {
		t.Fatalf("ParsePrivateKey: %v", err)
	}

	// 公開鍵をパース
	pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(pubOpenSSH))
	if err != nil {
		t.Fatalf("ParseAuthorizedKey: %v", err)
	}

	// signer の公開鍵と返却された公開鍵が一致することを確認
	signerPubBytes := signer.PublicKey().Marshal()
	pubBytes := pub.Marshal()
	if string(signerPubBytes) != string(pubBytes) {
		t.Error("private key and public key are not a matching pair")
	}
}

// TestGenerateKeyPair_Uniqueness は連続呼び出しで異なる鍵ペアが生成されることを検証する。
func TestGenerateKeyPair_Uniqueness(t *testing.T) {
	t.Parallel()

	_, pub1, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("first GenerateKeyPair() error: %v", err)
	}
	_, pub2, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("second GenerateKeyPair() error: %v", err)
	}

	if pub1 == pub2 {
		t.Error("two consecutive calls returned identical public keys")
	}
}

// TestGenerateKeyPair_NoDiskWrite は返却値がメモリ上のみに存在することを
// 型・形式の観点から検証する（ディスクパスを含まない）。
func TestGenerateKeyPair_NoDiskWrite(t *testing.T) {
	t.Parallel()

	privPEM, pubOpenSSH, err := GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair() error: %v", err)
	}
	// ファイルパスやパス区切り文字が含まれていないことを確認
	if strings.Contains(string(privPEM), "/") && strings.Contains(string(privPEM), "home") {
		t.Error("private key PEM unexpectedly contains a file path")
	}
	if strings.Contains(pubOpenSSH, "/tmp") || strings.Contains(pubOpenSSH, "/home") {
		t.Error("public key unexpectedly contains a file path")
	}
}
