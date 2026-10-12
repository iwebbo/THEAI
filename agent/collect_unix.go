//go:build !linux && !windows

package main

import (
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Collecteur générique pour AIX, FreeBSD, OpenBSD, NetBSD, Solaris/illumos et macOS.
// Il s'appuie sur des commandes POSIX locales ; tout champ non déterminé reste vide
// (le backend l'affiche comme indisponible) plutôt que de faire échouer le cycle.

func cmdOut(timeout time.Duration, name string, args ...string) string {
	out, _ := runCmd(timeout, name, args...)
	return out
}

func lastNonEmptyLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			return lines[i]
		}
	}
	return ""
}

func cpuPercent() *float64 {
	out := cmdOut(20*time.Second, "vmstat", "1", "2")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	idx := -1
	for _, l := range lines {
		f := strings.Fields(l)
		for i, tok := range f {
			if tok == "id" {
				idx = i
			}
		}
	}
	if idx < 0 {
		return nil
	}
	data := strings.Fields(lastNonEmptyLine(out))
	if idx >= len(data) {
		return nil
	}
	idle, err := strconv.ParseFloat(data[idx], 64)
	if err != nil {
		return nil
	}
	v := clampPercent(100 - idle)
	return &v
}

var loadRe = regexp.MustCompile(`(\d+\.\d+)[, ]+(\d+\.\d+)[, ]+(\d+\.\d+)\s*$`)

func loadAvg() (l1, l5, l15 *float64) {
	m := loadRe.FindStringSubmatch(strings.TrimSpace(cmdOut(10*time.Second, "uptime")))
	if m == nil {
		return nil, nil, nil
	}
	a, e1 := strconv.ParseFloat(m[1], 64)
	b, e2 := strconv.ParseFloat(m[2], 64)
	c, e3 := strconv.ParseFloat(m[3], 64)
	if e1 != nil || e2 != nil || e3 != nil {
		return nil, nil, nil
	}
	return &a, &b, &c
}

// uptimeSeconds : durée écoulée du processus 1 ([[jj-]hh:]mm:ss).
func uptimeSeconds() uint64 {
	s := strings.TrimSpace(cmdOut(10*time.Second, "ps", "-o", "etime=", "-p", "1"))
	if s == "" {
		return 0
	}
	days := 0
	if i := strings.Index(s, "-"); i > 0 {
		days, _ = strconv.Atoi(s[:i])
		s = s[i+1:]
	}
	parts := strings.Split(s, ":")
	var h, m, sec int
	var err error
	switch len(parts) {
	case 3:
		h, err = strconv.Atoi(parts[0])
		if err == nil {
			m, err = strconv.Atoi(parts[1])
		}
		if err == nil {
			sec, err = strconv.Atoi(parts[2])
		}
	case 2:
		m, err = strconv.Atoi(parts[0])
		if err == nil {
			sec, err = strconv.Atoi(parts[1])
		}
	default:
		return 0
	}
	if err != nil {
		return 0
	}
	return uint64(days)*86400 + uint64(h)*3600 + uint64(m)*60 + uint64(sec)
}

func sysctlUint(key string) uint64 {
	v, err := strconv.ParseUint(strings.TrimSpace(cmdOut(10*time.Second, "sysctl", "-n", key)), 10, 64)
	if err != nil {
		return 0
	}
	return v
}

var leadingNumRe = regexp.MustCompile(`^\s*(\d+)\s+(.*)$`)

func memory() (total, used uint64) {
	switch runtime.GOOS {
	case "aix":
		var memPages, freePages uint64
		for _, l := range strings.Split(cmdOut(10*time.Second, "vmstat", "-v"), "\n") {
			m := leadingNumRe.FindStringSubmatch(l)
			if m == nil {
				continue
			}
			n, _ := strconv.ParseUint(m[1], 10, 64)
			switch strings.TrimSpace(m[2]) {
			case "memory pages":
				memPages = n
			case "free pages":
				freePages = n
			}
		}
		if memPages > 0 && freePages <= memPages {
			return memPages * 4096, (memPages - freePages) * 4096
		}
	case "darwin":
		total = sysctlUint("hw.memsize")
		out := cmdOut(10*time.Second, "vm_stat")
		pageSize := uint64(4096)
		if i := strings.Index(out, "page size of "); i >= 0 {
			rest := out[i+len("page size of "):]
			if j := strings.Index(rest, " "); j > 0 {
				if v, err := strconv.ParseUint(rest[:j], 10, 64); err == nil {
					pageSize = v
				}
			}
		}
		var free uint64
		for _, l := range strings.Split(out, "\n") {
			k, v, ok := strings.Cut(l, ":")
			if !ok {
				continue
			}
			n, err := strconv.ParseUint(strings.TrimSuffix(strings.TrimSpace(v), "."), 10, 64)
			if err != nil {
				continue
			}
			switch strings.TrimSpace(k) {
			case "Pages free", "Pages inactive", "Pages speculative":
				free += n
			}
		}
		if total > 0 && free*pageSize <= total {
			return total, total - free*pageSize
		}
	case "freebsd":
		total = sysctlUint("hw.physmem")
		ps := sysctlUint("hw.pagesize")
		free := sysctlUint("vm.stats.vm.v_free_count") + sysctlUint("vm.stats.vm.v_inactive_count")
		if total > 0 && ps > 0 && free*ps <= total {
			return total, total - free*ps
		}
	}
	return 0, 0 // inconnu
}

var dfSkipFS = map[string]bool{
	"tmpfs": true, "devfs": true, "procfs": true, "proc": true, "fdescfs": true, "mnttab": true,
	"objfs": true, "ctfs": true, "sharefs": true, "swap": true, "devtmpfs": true, "map": true,
	"lofs": true, "linprocfs": true, "linsysfs": true, "nullfs": true,
}

func disks() []Disk {
	out, err := runCmd(20*time.Second, "df", "-k", "-P")
	if err != nil && out == "" {
		out = cmdOut(20*time.Second, "df", "-k")
	}
	var res []Disk
	for i, line := range strings.Split(out, "\n") {
		if i == 0 {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 6 {
			continue
		}
		dev, mount := f[0], f[len(f)-1]
		if dfSkipFS[dev] || strings.HasPrefix(mount, "/proc") || strings.HasPrefix(mount, "/dev") ||
			strings.HasPrefix(mount, "/System/Volumes/") && mount != "/System/Volumes/Data" {
			continue
		}
		blocks, e1 := strconv.ParseUint(f[1], 10, 64)
		used, e2 := strconv.ParseUint(f[2], 10, 64)
		if e1 != nil || e2 != nil || blocks == 0 || used > blocks {
			continue
		}
		res = append(res, Disk{Mount: mount, Device: dev, FS: "", Total: blocks * 1024, Used: used * 1024})
		if len(res) >= 32 {
			break
		}
	}
	return res
}

func collectMetrics() (*Metrics, error) {
	m := &Metrics{}
	m.CPUPercent = cpuPercent()
	m.Load1, m.Load5, m.Load15 = loadAvg()
	m.UptimeSeconds = uptimeSeconds()
	m.MemTotal, m.MemUsed = memory()
	m.Disks = disks()
	return m, nil
}

func parsePortSuffix(addr string) (string, int, bool) {
	i := strings.LastIndexAny(addr, ".:")
	if i < 0 {
		return "", 0, false
	}
	p, err := strconv.Atoi(addr[i+1:])
	if err != nil || p <= 0 || p > 65535 {
		return "", 0, false
	}
	host := addr[:i]
	if host == "" || host == "*" {
		host = "*"
	}
	return host, p, true
}

func collectPorts() []Port {
	out := cmdOut(30*time.Second, "netstat", "-an")
	var ports []Port
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) < 5 || f[len(f)-1] != "LISTEN" {
			continue
		}
		local := ""
		if strings.HasPrefix(f[0], "tcp") {
			local = f[3] // BSD / AIX / macOS : Proto Recv-Q Send-Q Local Foreign State
		} else {
			local = f[0] // Solaris : Local Remote Swind Send-Q Rwind Recv-Q State
		}
		host, port, ok := parsePortSuffix(local)
		if ok {
			ports = append(ports, Port{Proto: "tcp", Address: host, Port: port})
		}
	}
	return sortPorts(ports)
}

func collectInventory() *Inventory {
	osi := OSInfo{Family: runtime.GOOS, ID: runtime.GOOS, Arch: runtime.GOARCH}
	uname := strings.TrimSpace(cmdOut(10*time.Second, "uname", "-sr"))
	osi.Kernel = uname
	osi.Pretty = uname
	if runtime.GOOS == "aix" {
		lvl := strings.TrimSpace(cmdOut(10*time.Second, "oslevel", "-s"))
		if lvl != "" {
			osi.VersionID = lvl
			osi.Pretty = "AIX " + lvl
		}
	}

	var pkgs []Package
	switch runtime.GOOS {
	case "aix":
		for _, line := range strings.Split(cmdOut(60*time.Second, "lslpp", "-Lc"), "\n") {
			if strings.HasPrefix(line, "#") {
				continue
			}
			f := strings.Split(line, ":")
			if len(f) >= 3 && f[1] != "" && f[2] != "" {
				pkgs = append(pkgs, Package{Name: f[1], Version: f[2]})
			}
		}
	case "freebsd":
		if _, err := exec.LookPath("pkg"); err == nil {
			for _, line := range strings.Split(cmdOut(60*time.Second, "pkg", "query", "%n\t%v"), "\n") {
				n, v, ok := strings.Cut(line, "\t")
				if ok && n != "" && v != "" {
					pkgs = append(pkgs, Package{Name: n, Version: v})
				}
			}
		}
	}
	pkgs = append(pkgs, rpmPackages()...)
	return finalizeInventory(osi, pkgs)
}
