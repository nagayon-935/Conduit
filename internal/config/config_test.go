package config_test

// NOTE: t.Setenv は並列テストで使用できないため、このファイルでは t.Parallel() を呼ばない。
// t.Setenv は Cleanup で自動的に元の値に戻すため、テスト間の干渉は起きない。

import (
	"strings"
	"testing"
	"time"

	"github.com/nagayon-935/conduit/internal/config"
)

// setAllRequired は3つの必須環境変数をまとめてセットするヘルパー。
func setAllRequired(t *testing.T, vaultAddr, vaultToken, sshRole string) {
	t.Helper()
	t.Setenv("VAULT_ADDR", vaultAddr)
	t.Setenv("VAULT_TOKEN", vaultToken)
	t.Setenv("VAULT_SSH_ROLE", sshRole)
}

// TestLoad_AllFields は全フィールドが環境変数から正しく読み込まれることを検証する。
func TestLoad_AllFields(t *testing.T) {
	setAllRequired(t, "http://vault.test:8200", "s.mytoken", "conduit-role")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.VaultAddr != "http://vault.test:8200" {
		t.Errorf("VaultAddr = %q, want %q", cfg.VaultAddr, "http://vault.test:8200")
	}
	if cfg.VaultToken != "s.mytoken" {
		t.Errorf("VaultToken = %q, want %q", cfg.VaultToken, "s.mytoken")
	}
	if cfg.VaultSSHRole != "conduit-role" {
		t.Errorf("VaultSSHRole = %q, want %q", cfg.VaultSSHRole, "conduit-role")
	}
}

// TestLoad_Defaults はオプション項目のデフォルト値が正しく設定されることを検証する。
func TestLoad_Defaults(t *testing.T) {
	setAllRequired(t, "http://vault.test:8200", "tok", "role")
	// オプション項目はセットしない → デフォルト値が使われるはず
	t.Setenv("SERVER_ADDR", "")
	t.Setenv("VAULT_SSH_MOUNT", "")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.ServerAddr != ":8080" {
		t.Errorf("ServerAddr = %q, want %q", cfg.ServerAddr, ":8080")
	}
	if cfg.VaultSSHMount != "ssh" {
		t.Errorf("VaultSSHMount = %q, want %q", cfg.VaultSSHMount, "ssh")
	}
	if cfg.GracePeriod != 15*time.Minute {
		t.Errorf("GracePeriod = %v, want %v", cfg.GracePeriod, 15*time.Minute)
	}
	if cfg.SessionGCInterval != 1*time.Minute {
		t.Errorf("SessionGCInterval = %v, want %v", cfg.SessionGCInterval, time.Minute)
	}
}

// TestLoad_OverrideDefaults はオプション項目を明示的に上書きできることを検証する。
func TestLoad_OverrideDefaults(t *testing.T) {
	setAllRequired(t, "http://vault.test:8200", "tok", "role")
	t.Setenv("SERVER_ADDR", ":9090")
	t.Setenv("VAULT_SSH_MOUNT", "custom-ssh")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.ServerAddr != ":9090" {
		t.Errorf("ServerAddr = %q, want %q", cfg.ServerAddr, ":9090")
	}
	if cfg.VaultSSHMount != "custom-ssh" {
		t.Errorf("VaultSSHMount = %q, want %q", cfg.VaultSSHMount, "custom-ssh")
	}
}

// TestLoad_MissingVaultAddr は VAULT_ADDR が未設定の場合にエラーを返すことを検証する。
func TestLoad_MissingVaultAddr(t *testing.T) {
	t.Setenv("VAULT_ADDR", "")        // 未設定を模倣
	t.Setenv("VAULT_TOKEN", "tok")
	t.Setenv("VAULT_SSH_ROLE", "role")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected error for missing VAULT_ADDR, got nil")
	}
	if !strings.Contains(err.Error(), "VAULT_ADDR") {
		t.Errorf("error message %q should mention VAULT_ADDR", err.Error())
	}
}

// TestLoad_MissingVaultToken は VAULT_TOKEN が未設定の場合にエラーを返すことを検証する。
func TestLoad_MissingVaultToken(t *testing.T) {
	t.Setenv("VAULT_ADDR", "http://vault.test:8200")
	t.Setenv("VAULT_TOKEN", "")       // 未設定を模倣
	t.Setenv("VAULT_SSH_ROLE", "role")

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected error for missing VAULT_TOKEN, got nil")
	}
	if !strings.Contains(err.Error(), "VAULT_TOKEN") {
		t.Errorf("error message %q should mention VAULT_TOKEN", err.Error())
	}
}

// TestLoad_MissingVaultSSHRole は VAULT_SSH_ROLE が未設定の場合にエラーを返すことを検証する。
func TestLoad_MissingVaultSSHRole(t *testing.T) {
	t.Setenv("VAULT_ADDR", "http://vault.test:8200")
	t.Setenv("VAULT_TOKEN", "tok")
	t.Setenv("VAULT_SSH_ROLE", "")    // 未設定を模倣

	_, err := config.Load()
	if err == nil {
		t.Fatal("expected error for missing VAULT_SSH_ROLE, got nil")
	}
	if !strings.Contains(err.Error(), "VAULT_SSH_ROLE") {
		t.Errorf("error message %q should mention VAULT_SSH_ROLE", err.Error())
	}
}
