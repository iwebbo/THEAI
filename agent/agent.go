package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"runtime"
	"time"
)

const (
	defaultInterval   = 30
	inventoryRefresh  = 30 * time.Minute
	portsRefresh      = 5 * time.Minute
	revokedRetryDelay = 5 * time.Minute
)

type enrollRequest struct {
	Token        string `json:"token"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Arch         string `json:"arch"`
	AgentVersion string `json:"agent_version"`
}

type enrollResponse struct {
	APIKey          string `json:"api_key"`
	ServerID        int    `json:"server_id"`
	IntervalSeconds int    `json:"interval_seconds"`
}

type heartbeatResponse struct {
	IntervalSeconds int  `json:"interval_seconds"`
	NeedInventory   bool `json:"need_inventory"`
}

type agentState struct {
	inv         *Inventory
	invAt       time.Time
	portsHash   string
	portsAt     time.Time
	interval    time.Duration
	lastWarning string
}

func clampInterval(sec int) time.Duration {
	if sec < 10 {
		sec = defaultInterval
	}
	if sec > 600 {
		sec = 600
	}
	return time.Duration(sec) * time.Second
}

func runAgent(ctx context.Context, cfg *Config) error {
	c, err := newClient(cfg.ServerURL, cfg.APIKey, cfg.CAFile, cfg.AllowInsecureHTTP)
	if err != nil {
		return err
	}
	st := &agentState{interval: clampInterval(cfg.IntervalSeconds)}
	log.Printf("agent %s démarré (%s/%s) -> %s", version, runtime.GOOS, runtime.GOARCH, cfg.ServerURL)

	for {
		wait := st.tick(ctx, c)
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(wait):
		}
	}
}

// tick réalise un cycle complet et retourne le délai avant le suivant.
func (st *agentState) tick(ctx context.Context, c *Client) time.Duration {
	if st.inv == nil || time.Since(st.invAt) >= inventoryRefresh {
		st.inv = collectInventory()
		st.invAt = time.Now()
	}

	m, err := collectMetrics()
	if err != nil {
		log.Printf("collecte des métriques partielle: %v", err)
	}
	if m == nil {
		m = &Metrics{}
	}
	if m.Disks == nil {
		m.Disks = []Disk{}
	}
	m.InventoryHash = st.inv.Hash
	m.AgentVersion = version

	var hb heartbeatResponse
	if err := c.post(ctx, "/api/v1/agent/heartbeat", 30*time.Second, m, &hb); err != nil {
		return st.handleError("heartbeat", err)
	}
	st.lastWarning = ""
	if hb.IntervalSeconds > 0 {
		st.interval = clampInterval(hb.IntervalSeconds)
	}

	if hb.NeedInventory {
		if err := c.post(ctx, "/api/v1/agent/inventory", 120*time.Second, st.inv, nil); err != nil {
			log.Printf("envoi de l'inventaire: %v", err)
		} else {
			log.Printf("inventaire envoyé (%d paquets)", len(st.inv.Packages))
		}
	}

	if st.portsAt.IsZero() || time.Since(st.portsAt) >= portsRefresh {
		ports := collectPorts()
		st.portsAt = time.Now()
		raw, _ := json.Marshal(ports)
		sum := sha256.Sum256(raw)
		h := hex.EncodeToString(sum[:])
		if h != st.portsHash {
			body := map[string]any{"ports": ports}
			if err := c.post(ctx, "/api/v1/agent/ports", 30*time.Second, body, nil); err != nil {
				log.Printf("envoi des ports: %v", err)
				st.portsAt = time.Time{}
			} else {
				st.portsHash = h
			}
		}
	}

	return jitter(st.interval)
}

func (st *agentState) handleError(what string, err error) time.Duration {
	var ae *apiError
	if errors.As(err, &ae) && ae.Status == 401 {
		msg := "identifiants refusés par le backend (agent révoqué ?) - nouvel essai dans 5 min"
		if st.lastWarning != msg {
			log.Printf("%s: %s", what, msg)
			st.lastWarning = msg
		}
		return revokedRetryDelay
	}
	log.Printf("%s: %v", what, err)
	return jitter(st.interval)
}

func jitter(d time.Duration) time.Duration {
	span := int64(d) / 5
	if span <= 0 {
		return d
	}
	return d - time.Duration(span/2) + time.Duration(rand.Int63n(span))
}
