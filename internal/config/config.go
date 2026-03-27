package config

import (
	"fmt"
	"os"
	"time"
)

// Config holds all application configuration values.
type Config struct {
	ServerAddr        string
	VaultAddr         string
	VaultToken        string
	VaultSSHMount     string
	VaultSSHRole      string
	GracePeriod       time.Duration
	SessionGCInterval time.Duration
}

// Load reads configuration from environment variables and applies defaults.
func Load() (*Config, error) {
	cfg := &Config{
		ServerAddr:        ":8080",
		VaultSSHMount:     "ssh",
		GracePeriod:       15 * time.Minute,
		SessionGCInterval: 1 * time.Minute,
	}

	if v := os.Getenv("SERVER_PORT"); v != "" {
		cfg.ServerAddr = ":" + v
	}

	cfg.VaultAddr = os.Getenv("VAULT_ADDR")
	if cfg.VaultAddr == "" {
		return nil, fmt.Errorf("config: VAULT_ADDR environment variable is required")
	}

	cfg.VaultToken = os.Getenv("VAULT_TOKEN")
	if cfg.VaultToken == "" {
		return nil, fmt.Errorf("config: VAULT_TOKEN environment variable is required")
	}

	if v := os.Getenv("VAULT_SSH_MOUNT"); v != "" {
		cfg.VaultSSHMount = v
	}

	cfg.VaultSSHRole = os.Getenv("VAULT_SSH_ROLE")
	if cfg.VaultSSHRole == "" {
		return nil, fmt.Errorf("config: VAULT_SSH_ROLE environment variable is required")
	}

	return cfg, nil
}
