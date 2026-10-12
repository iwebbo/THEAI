package main

import (
	"bufio"
	"os"
	"os/exec"
	"strings"
	"time"
)

// dpkgPackages lit /var/lib/dpkg/status (sans exécuter dpkg). Pour chaque paquet
// installé on garde le paquet source et sa version : c'est la clé utilisée par
// OSV/Debian/Ubuntu.
func dpkgPackages(path string) ([]Package, bool) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()

	var pkgs []Package
	var name, status, version, source, arch string
	flush := func() {
		defer func() { name, status, version, source, arch = "", "", "", "", "" }()
		if name == "" || version == "" {
			return
		}
		st := strings.Fields(status)
		if len(st) != 3 || st[2] != "installed" {
			return
		}
		src, srcVer := name, version
		if source != "" {
			if i := strings.Index(source, " ("); i > 0 && strings.HasSuffix(source, ")") {
				src = strings.TrimSpace(source[:i])
				srcVer = strings.TrimSpace(source[i+2 : len(source)-1])
			} else {
				src = strings.TrimSpace(source)
			}
		}
		pkgs = append(pkgs, Package{Name: name, Version: version, Source: src, SourceVersion: srcVer, Arch: arch})
	}

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			flush()
			continue
		}
		if line[0] == ' ' || line[0] == '\t' {
			continue
		}
		i := strings.Index(line, ":")
		if i < 0 {
			continue
		}
		val := strings.TrimSpace(line[i+1:])
		switch line[:i] {
		case "Package":
			name = val
		case "Status":
			status = val
		case "Version":
			version = val
		case "Source":
			source = val
		case "Architecture":
			arch = val
		}
	}
	flush()
	return pkgs, true
}

// apkPackages lit /lib/apk/db/installed. "o:" est le paquet d'origine (source).
func apkPackages(path string) ([]Package, bool) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()

	var pkgs []Package
	var name, version, origin, arch string
	flush := func() {
		if name != "" && version != "" {
			if origin == "" {
				origin = name
			}
			pkgs = append(pkgs, Package{Name: name, Version: version, Source: origin, Arch: arch})
		}
		name, version, origin, arch = "", "", "", ""
	}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			flush()
			continue
		}
		if len(line) < 3 || line[1] != ':' {
			continue
		}
		switch line[0] {
		case 'P':
			name = line[2:]
		case 'V':
			version = line[2:]
		case 'o':
			origin = line[2:]
		case 'A':
			arch = line[2:]
		}
	}
	flush()
	return pkgs, true
}

// rpmPackages liste les paquets via la commande rpm (si présente). Inventaire
// seulement : la corrélation CVE n'est pas faite pour les distributions RPM.
func rpmPackages() []Package {
	if _, err := exec.LookPath("rpm"); err != nil {
		return nil
	}
	out, err := runCmd(60*time.Second, "rpm", "-qa", "--qf", "%{NAME}\t%{EPOCH}\t%{VERSION}-%{RELEASE}\t%{SOURCERPM}\t%{ARCH}\n")
	if err != nil && out == "" {
		return nil
	}
	var pkgs []Package
	for _, line := range strings.Split(out, "\n") {
		f := strings.Split(line, "\t")
		if len(f) < 5 || f[0] == "" {
			continue
		}
		ver := f[2]
		if f[1] != "" && f[1] != "(none)" {
			ver = f[1] + ":" + ver
		}
		src := f[3]
		if src == "(none)" {
			src = ""
		}
		pkgs = append(pkgs, Package{Name: f[0], Version: ver, Source: src, Arch: f[4]})
	}
	return pkgs
}
