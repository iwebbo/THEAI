package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Config est stockée localement après l'enrôlement (fichier en 0600).
type Config struct {
	ServerURL         string `json:"server_url"`
	APIKey            string `json:"api_key"`
	CAFile            string `json:"ca_file,omitempty"`
	AllowInsecureHTTP bool   `json:"allow_insecure_http,omitempty"`
	IntervalSeconds   int    `json:"interval_seconds,omitempty"`
}

func defaultConfigPath() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "theai-agent", "config.json")
	}
	return "/etc/theai-agent/config.json"
}

func loadConfig(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("lecture de la configuration %s: %w", path, err)
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("configuration %s invalide: %w", path, err)
	}
	if c.ServerURL == "" || c.APIKey == "" {
		return nil, fmt.Errorf("configuration %s incomplète (server_url / api_key): lancer 'enroll'", path)
	}
	return &c, nil
}

func saveConfig(path string, c *Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
