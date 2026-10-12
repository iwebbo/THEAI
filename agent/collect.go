package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"
)

// Disk décrit un système de fichiers monté.
type Disk struct {
	Mount  string `json:"mount"`
	Device string `json:"device"`
	FS     string `json:"fs"`
	Total  uint64 `json:"total"`
	Used   uint64 `json:"used"`
}

// Metrics est le contenu d'un heartbeat.
type Metrics struct {
	CPUPercent    *float64 `json:"cpu_percent"`
	MemTotal      uint64   `json:"mem_total"`
	MemUsed       uint64   `json:"mem_used"`
	SwapTotal     uint64   `json:"swap_total"`
	SwapUsed      uint64   `json:"swap_used"`
	Load1         *float64 `json:"load1"`
	Load5         *float64 `json:"load5"`
	Load15        *float64 `json:"load15"`
	UptimeSeconds uint64   `json:"uptime_seconds"`
	NetRxBytes    uint64   `json:"net_rx_bytes"`
	NetTxBytes    uint64   `json:"net_tx_bytes"`
	Disks         []Disk   `json:"disks"`
	InventoryHash string   `json:"inventory_hash"`
	AgentVersion  string   `json:"agent_version"`
}

// Port est un port en écoute lu localement.
type Port struct {
	Proto   string `json:"proto"`
	Address string `json:"address"`
	Port    int    `json:"port"`
	Process string `json:"process"`
}

// OSInfo décrit le système d'exploitation.
type OSInfo struct {
	Family    string `json:"family"`
	ID        string `json:"id"`
	VersionID string `json:"version_id"`
	Pretty    string `json:"pretty"`
	Kernel    string `json:"kernel"`
	Arch      string `json:"arch"`
}

// Package est un paquet installé. Source/SourceVersion servent à la corrélation
// CVE (Debian/Ubuntu/Alpine raisonnent sur le paquet source).
type Package struct {
	Name          string `json:"name"`
	Version       string `json:"version"`
	Source        string `json:"source,omitempty"`
	SourceVersion string `json:"source_version,omitempty"`
	Arch          string `json:"arch,omitempty"`
}

// Inventory est l'inventaire logiciel envoyé quand son hash change.
type Inventory struct {
	Hash     string    `json:"pkg_hash"`
	OS       OSInfo    `json:"os"`
	Packages []Package `json:"packages"`
}

const maxPackages = 60000

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func clampPercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// finalizeInventory normalise, trie et calcule le hash de l'inventaire.
func finalizeInventory(osi OSInfo, pkgs []Package) *Inventory {
	osi.Family = clip(osi.Family, 32)
	osi.ID = clip(osi.ID, 64)
	osi.VersionID = clip(osi.VersionID, 64)
	osi.Pretty = clip(osi.Pretty, 255)
	osi.Kernel = clip(osi.Kernel, 255)
	osi.Arch = clip(osi.Arch, 32)

	clean := make([]Package, 0, len(pkgs))
	for _, p := range pkgs {
		p.Name = clip(p.Name, 255)
		p.Version = clip(p.Version, 255)
		if p.Name == "" || p.Version == "" {
			continue
		}
		p.Source = clip(p.Source, 255)
		p.SourceVersion = clip(p.SourceVersion, 255)
		p.Arch = clip(p.Arch, 32)
		clean = append(clean, p)
	}
	sort.Slice(clean, func(i, j int) bool {
		a, b := clean[i], clean[j]
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		if a.Version != b.Version {
			return a.Version < b.Version
		}
		return a.Arch < b.Arch
	})
	if len(clean) > maxPackages {
		clean = clean[:maxPackages]
	}

	h := sha256.New()
	fmt.Fprintf(h, "os\t%s\t%s\t%s\t%s\t%s\n", osi.Family, osi.ID, osi.VersionID, osi.Pretty, osi.Kernel)
	for _, p := range clean {
		fmt.Fprintf(h, "%s\t%s\t%s\t%s\t%s\n", p.Name, p.Version, p.Source, p.SourceVersion, p.Arch)
	}
	return &Inventory{Hash: hex.EncodeToString(h.Sum(nil)), OS: osi, Packages: clean}
}

// runCmd exécute une commande locale fixe (jamais fournie par le backend).
func runCmd(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C", "LANG=C")
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("%s: %w", name, err)
	}
	return out.String(), nil
}

func sortPorts(ports []Port) []Port {
	seen := make(map[string]bool, len(ports))
	out := make([]Port, 0, len(ports))
	for _, p := range ports {
		k := fmt.Sprintf("%s|%s|%d", p.Proto, p.Address, p.Port)
		if seen[k] {
			continue
		}
		seen[k] = true
		p.Process = clip(p.Process, 128)
		p.Address = clip(p.Address, 128)
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Port != out[j].Port {
			return out[i].Port < out[j].Port
		}
		if out[i].Proto != out[j].Proto {
			return out[i].Proto < out[j].Proto
		}
		return out[i].Address < out[j].Address
	})
	if len(out) > 2000 {
		out = out[:2000]
	}
	return out
}
