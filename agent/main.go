package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

// Renseigné au build : -ldflags "-X main.version=1.0.0"
var version = "dev"

func usage() {
	fmt.Fprintf(os.Stderr, `theai-agent %s

Usage:
  theai-agent enroll -url https://theai.example.com -token <jeton> [-config chemin] [-ca ca.pem] [-allow-http]
  theai-agent run    [-config chemin]
  theai-agent dump   (affiche ce que l'agent collecterait, sans rien envoyer)
  theai-agent version
`, version)
}

func main() {
	log.SetFlags(log.LstdFlags)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "enroll":
		cmdEnroll(os.Args[2:])
	case "run":
		cmdRun(os.Args[2:])
	case "dump":
		cmdDump()
	case "version", "-v", "--version":
		fmt.Println(version)
	default:
		usage()
		os.Exit(2)
	}
}

func cmdEnroll(args []string) {
	fs := flag.NewFlagSet("enroll", flag.ExitOnError)
	urlFlag := fs.String("url", os.Getenv("THEAI_URL"), "URL du backend THEAI (https://...)")
	token := fs.String("token", os.Getenv("THEAI_TOKEN"), "jeton d'enrôlement à usage unique")
	cfgPath := fs.String("config", defaultConfigPath(), "fichier de configuration")
	ca := fs.String("ca", os.Getenv("THEAI_CA_FILE"), "CA supplémentaire (PEM) pour une PKI interne")
	allowHTTP := fs.Bool("allow-http", false, "autoriser http:// (déconseillé)")
	_ = fs.Parse(args)

	if *urlFlag == "" || *token == "" {
		fmt.Fprintln(os.Stderr, "-url et -token sont obligatoires")
		os.Exit(2)
	}
	c, err := newClient(*urlFlag, "", *ca, *allowHTTP)
	if err != nil {
		log.Fatalf("enroll: %v", err)
	}
	host, _ := os.Hostname()
	var resp enrollResponse
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	err = c.post(ctx, "/api/v1/agent/enroll", 30*time.Second, enrollRequest{
		Token:        *token,
		Hostname:     host,
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
		AgentVersion: version,
	}, &resp)
	if err != nil {
		log.Fatalf("enroll: %v", err)
	}
	if resp.APIKey == "" {
		log.Fatalf("enroll: réponse sans clé API")
	}
	cfg := &Config{
		ServerURL:         *urlFlag,
		APIKey:            resp.APIKey,
		CAFile:            *ca,
		AllowInsecureHTTP: *allowHTTP,
		IntervalSeconds:   resp.IntervalSeconds,
	}
	if err := saveConfig(*cfgPath, cfg); err != nil {
		log.Fatalf("enroll: écriture de la configuration: %v", err)
	}
	fmt.Printf("enrôlement réussi (serveur #%d), configuration écrite dans %s\n", resp.ServerID, *cfgPath)
}

func cmdRun(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	cfgPath := fs.String("config", defaultConfigPath(), "fichier de configuration")
	_ = fs.Parse(args)

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		log.Fatalf("run: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := runAgent(ctx, cfg); err != nil {
		log.Fatalf("run: %v", err)
	}
}

func cmdDump() {
	inv := collectInventory()
	m, err := collectMetrics()
	if err != nil {
		fmt.Fprintf(os.Stderr, "métriques partielles: %v\n", err)
	}
	out := map[string]any{
		"version": version,
		"metrics": m,
		"ports":   collectPorts(),
		"inventory": map[string]any{
			"hash":          inv.Hash,
			"os":            inv.OS,
			"package_count": len(inv.Packages),
		},
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}
