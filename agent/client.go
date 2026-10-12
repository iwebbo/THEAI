package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Client parle uniquement en HTTPS sortant vers le backend THEAI.
type Client struct {
	base string
	key  string
	hc   *http.Client
}

type apiError struct {
	Status int
	Body   string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body)
}

func newClient(serverURL, apiKey, caFile string, allowHTTP bool) (*Client, error) {
	u, err := url.Parse(strings.TrimSpace(serverURL))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("URL serveur invalide: %q", serverURL)
	}
	switch u.Scheme {
	case "https":
	case "http":
		if !allowHTTP {
			return nil, fmt.Errorf("URL http:// refusée (TLS obligatoire). Utiliser https:// ou -allow-http en connaissance de cause")
		}
	default:
		return nil, fmt.Errorf("schéma non supporté: %q", u.Scheme)
	}

	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if caFile != "" {
		pem, err := os.ReadFile(caFile)
		if err != nil {
			return nil, fmt.Errorf("lecture de la CA %s: %w", caFile, err)
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("aucun certificat valide dans %s", caFile)
		}
	}

	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		TLSClientConfig:       &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
		IdleConnTimeout:       60 * time.Second,
		MaxIdleConns:          2,
	}
	return &Client{
		base: strings.TrimRight(u.String(), "/"),
		key:  apiKey,
		hc:   &http.Client{Transport: tr},
	}, nil
}

func (c *Client) post(ctx context.Context, path string, timeout time.Duration, body, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "theai-agent/"+version)
	if c.key != "" {
		req.Header.Set("Authorization", "Bearer "+c.key)
	}

	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &apiError{Status: resp.StatusCode, Body: clip(string(data), 300)}
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("réponse invalide: %w", err)
		}
	}
	return nil
}
