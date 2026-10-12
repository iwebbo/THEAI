//go:build linux

package main

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ---------- CPU ----------

var prevCPU struct {
	total, idle uint64
	ok          bool
}

func readCPU() (total, idle uint64, err error) {
	b, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		f := strings.Fields(line)[1:]
		var v [8]uint64
		for i := 0; i < len(v) && i < len(f); i++ {
			v[i], _ = strconv.ParseUint(f[i], 10, 64)
		}
		for _, x := range v {
			total += x
		}
		idle = v[3] + v[4] // idle + iowait
		return total, idle, nil
	}
	return 0, 0, fmt.Errorf("ligne cpu absente de /proc/stat")
}

func cpuPercent() *float64 {
	t1, i1, err := readCPU()
	if err != nil {
		return nil
	}
	if !prevCPU.ok {
		prevCPU.total, prevCPU.idle, prevCPU.ok = t1, i1, true
		time.Sleep(500 * time.Millisecond)
		t1, i1, err = readCPU()
		if err != nil {
			return nil
		}
	}
	pt, pi := prevCPU.total, prevCPU.idle
	prevCPU.total, prevCPU.idle = t1, i1
	if t1 < pt || i1 < pi {
		return nil
	}
	dt := t1 - pt
	di := i1 - pi
	if dt == 0 || di > dt {
		return nil
	}
	v := clampPercent(100 * float64(dt-di) / float64(dt))
	return &v
}

// ---------- Mémoire / load / uptime / réseau ----------

func readMeminfo() map[string]uint64 {
	out := map[string]uint64{}
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(b), "\n") {
		i := strings.Index(line, ":")
		if i < 0 {
			continue
		}
		f := strings.Fields(line[i+1:])
		if len(f) == 0 {
			continue
		}
		v, err := strconv.ParseUint(f[0], 10, 64)
		if err != nil {
			continue
		}
		out[line[:i]] = v * 1024 // kB -> octets
	}
	return out
}

func readNet() (rx, tx uint64) {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		i := strings.Index(line, ":")
		if i < 0 {
			continue
		}
		name := strings.TrimSpace(line[:i])
		if name == "lo" || strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "br-") {
			continue
		}
		fields := strings.Fields(line[i+1:])
		if len(fields) < 9 {
			continue
		}
		r, _ := strconv.ParseUint(fields[0], 10, 64)
		t, _ := strconv.ParseUint(fields[8], 10, 64)
		rx += r
		tx += t
	}
	return rx, tx
}

var fsAllowed = map[string]bool{
	"ext2": true, "ext3": true, "ext4": true, "xfs": true, "btrfs": true, "zfs": true,
	"vfat": true, "exfat": true, "ntfs": true, "ntfs3": true, "fuseblk": true, "f2fs": true,
	"jfs": true, "reiserfs": true, "nfs": true, "nfs4": true, "cifs": true, "smb3": true,
	"overlay": true,
}

var mountSkipPrefix = []string{"/proc", "/sys", "/dev", "/run", "/var/lib/docker", "/var/lib/containers", "/var/lib/kubelet", "/snap"}

func readDisks() []Disk {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer f.Close()
	var disks []Disk
	seen := map[string]bool{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 3 {
			continue
		}
		dev, mount, fst := fields[0], strings.ReplaceAll(fields[1], `\040`, " "), fields[2]
		if !fsAllowed[fst] {
			continue
		}
		if fst == "overlay" && mount != "/" {
			continue
		}
		skip := false
		for _, p := range mountSkipPrefix {
			if mount == p || strings.HasPrefix(mount, p+"/") {
				skip = true
				break
			}
		}
		if skip || seen[dev+"|"+fst] {
			continue
		}
		var st syscall.Statfs_t
		if err := syscall.Statfs(mount, &st); err != nil {
			continue
		}
		bs := uint64(st.Frsize)
		if bs == 0 {
			bs = uint64(st.Bsize)
		}
		total := uint64(st.Blocks) * bs
		free := uint64(st.Bfree) * bs
		if total == 0 || free > total {
			continue
		}
		seen[dev+"|"+fst] = true
		disks = append(disks, Disk{Mount: mount, Device: dev, FS: fst, Total: total, Used: total - free})
		if len(disks) >= 32 {
			break
		}
	}
	return disks
}

func collectMetrics() (*Metrics, error) {
	m := &Metrics{}
	m.CPUPercent = cpuPercent()

	mi := readMeminfo()
	m.MemTotal = mi["MemTotal"]
	if avail, ok := mi["MemAvailable"]; ok {
		if m.MemTotal >= avail {
			m.MemUsed = m.MemTotal - avail
		}
	} else if m.MemTotal > 0 {
		free := mi["MemFree"] + mi["Buffers"] + mi["Cached"]
		if m.MemTotal >= free {
			m.MemUsed = m.MemTotal - free
		}
	}
	m.SwapTotal = mi["SwapTotal"]
	if m.SwapTotal >= mi["SwapFree"] {
		m.SwapUsed = m.SwapTotal - mi["SwapFree"]
	}

	if b, err := os.ReadFile("/proc/loadavg"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 3 {
			l1, e1 := strconv.ParseFloat(f[0], 64)
			l5, e5 := strconv.ParseFloat(f[1], 64)
			l15, e15 := strconv.ParseFloat(f[2], 64)
			if e1 == nil && e5 == nil && e15 == nil {
				m.Load1, m.Load5, m.Load15 = &l1, &l5, &l15
			}
		}
	}
	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 1 {
			if v, err := strconv.ParseFloat(f[0], 64); err == nil && v >= 0 {
				m.UptimeSeconds = uint64(v)
			}
		}
	}
	m.NetRxBytes, m.NetTxBytes = readNet()
	m.Disks = readDisks()
	return m, nil
}

// ---------- Ports en écoute ----------

func hexToIP(s string) net.IP {
	if len(s) != 8 && len(s) != 32 {
		return nil
	}
	ip := make(net.IP, len(s)/2)
	for i := 0; i < len(s)/8; i++ {
		w, err := strconv.ParseUint(s[i*8:(i+1)*8], 16, 32)
		if err != nil {
			return nil
		}
		binary.NativeEndian.PutUint32(ip[i*4:], uint32(w))
	}
	return ip
}

// socketOwners associe inode de socket -> nom de processus (meilleur effort :
// les processus d'autres utilisateurs ne sont visibles qu'en root).
func socketOwners() map[string]string {
	owners := map[string]string{}
	procs, err := filepath.Glob("/proc/[0-9]*")
	if err != nil {
		return owners
	}
	for _, p := range procs {
		fds, err := os.ReadDir(filepath.Join(p, "fd"))
		if err != nil {
			continue
		}
		name := ""
		for _, fd := range fds {
			link, err := os.Readlink(filepath.Join(p, "fd", fd.Name()))
			if err != nil || !strings.HasPrefix(link, "socket:[") {
				continue
			}
			if name == "" {
				b, err := os.ReadFile(filepath.Join(p, "comm"))
				if err != nil {
					break
				}
				name = strings.TrimSpace(string(b))
			}
			owners[strings.TrimSuffix(strings.TrimPrefix(link, "socket:["), "]")] = name
		}
	}
	return owners
}

func readProcNet(path, proto, wantState string, owners map[string]string) []Port {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var ports []Port
	lines := strings.Split(string(b), "\n")
	for i, line := range lines {
		if i == 0 {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 10 || f[3] != wantState {
			continue
		}
		la := strings.Split(f[1], ":")
		if len(la) != 2 {
			continue
		}
		ip := hexToIP(la[0])
		port, err := strconv.ParseUint(la[1], 16, 16)
		if ip == nil || err != nil || port == 0 {
			continue
		}
		if proto == "udp" || proto == "udp6" {
			if f[2] != "00000000:0000" && !strings.HasPrefix(f[2], "00000000000000000000000000000000:") {
				continue
			}
		}
		ports = append(ports, Port{
			Proto:   strings.TrimSuffix(proto, "6"),
			Address: ip.String(),
			Port:    int(port),
			Process: owners[f[9]],
		})
	}
	return ports
}

func collectPorts() []Port {
	owners := socketOwners()
	var ports []Port
	ports = append(ports, readProcNet("/proc/net/tcp", "tcp", "0A", owners)...)
	ports = append(ports, readProcNet("/proc/net/tcp6", "tcp6", "0A", owners)...)
	ports = append(ports, readProcNet("/proc/net/udp", "udp", "07", owners)...)
	ports = append(ports, readProcNet("/proc/net/udp6", "udp6", "07", owners)...)
	return sortPorts(ports)
}

// ---------- Inventaire ----------

func parseKeyValueFile(path string) map[string]string {
	out := map[string]string{}
	b, err := os.ReadFile(path)
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		i := strings.Index(line, "=")
		if i < 0 {
			continue
		}
		v := strings.TrimSpace(line[i+1:])
		v = strings.Trim(v, `"'`)
		out[strings.TrimSpace(line[:i])] = v
	}
	return out
}

func collectOSInfo() OSInfo {
	rel := parseKeyValueFile("/etc/os-release")
	if len(rel) == 0 {
		rel = parseKeyValueFile("/usr/lib/os-release")
	}
	kernel := ""
	if b, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		kernel = strings.TrimSpace(string(b))
	}
	pretty := rel["PRETTY_NAME"]
	// Ubuntu : VERSION contient "LTS" ; on le garde pour choisir l'écosystème OSV.
	if v := rel["VERSION"]; v != "" && rel["ID"] == "ubuntu" {
		pretty = "Ubuntu " + v
	}
	return OSInfo{
		Family:    "linux",
		ID:        strings.ToLower(rel["ID"]),
		VersionID: rel["VERSION_ID"],
		Pretty:    pretty,
		Kernel:    kernel,
		Arch:      runtime.GOARCH,
	}
}

func collectInventory() *Inventory {
	osi := collectOSInfo()
	var pkgs []Package
	if p, ok := dpkgPackages("/var/lib/dpkg/status"); ok {
		pkgs = p
	} else if p, ok := apkPackages("/lib/apk/db/installed"); ok {
		pkgs = p
	} else {
		pkgs = rpmPackages()
	}
	return finalizeInventory(osi, pkgs)
}
