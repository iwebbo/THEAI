//go:build windows

package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64       = kernel32.NewProc("GetTickCount64")
	procGetLogicalDrives     = kernel32.NewProc("GetLogicalDrives")
	procGetDriveTypeW        = kernel32.NewProc("GetDriveTypeW")
	procGetDiskFreeSpaceExW  = kernel32.NewProc("GetDiskFreeSpaceExW")
)

type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var prevCPU struct {
	busy, total uint64
	ok          bool
}

func ft(f syscall.Filetime) uint64 {
	return uint64(f.HighDateTime)<<32 | uint64(f.LowDateTime)
}

func readCPU() (busy, total uint64, err error) {
	var idle, kern, user syscall.Filetime
	r, _, e := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kern)),
		uintptr(unsafe.Pointer(&user)),
	)
	if r == 0 {
		return 0, 0, e
	}
	total = ft(kern) + ft(user) // le temps noyau inclut l'idle
	busy = total - ft(idle)
	return busy, total, nil
}

func cpuPercent() *float64 {
	b1, t1, err := readCPU()
	if err != nil {
		return nil
	}
	if !prevCPU.ok {
		prevCPU.busy, prevCPU.total, prevCPU.ok = b1, t1, true
		time.Sleep(500 * time.Millisecond)
		b1, t1, err = readCPU()
		if err != nil {
			return nil
		}
	}
	pb, pt := prevCPU.busy, prevCPU.total
	prevCPU.busy, prevCPU.total = b1, t1
	if t1 <= pt || b1 < pb {
		return nil
	}
	v := clampPercent(100 * float64(b1-pb) / float64(t1-pt))
	return &v
}

func readDisks() []Disk {
	mask, _, _ := procGetLogicalDrives.Call()
	var disks []Disk
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		root := fmt.Sprintf("%c:\\", 'A'+i)
		p, err := syscall.UTF16PtrFromString(root)
		if err != nil {
			continue
		}
		dt, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(p)))
		if dt != 3 { // DRIVE_FIXED
			continue
		}
		var avail, total, free uint64
		r, _, _ := procGetDiskFreeSpaceExW.Call(
			uintptr(unsafe.Pointer(p)),
			uintptr(unsafe.Pointer(&avail)),
			uintptr(unsafe.Pointer(&total)),
			uintptr(unsafe.Pointer(&free)),
		)
		if r == 0 || total == 0 || free > total {
			continue
		}
		disks = append(disks, Disk{Mount: root, Device: root, FS: "ntfs", Total: total, Used: total - free})
	}
	return disks
}

func readNet() (rx, tx uint64) {
	out, err := runCmd(10*time.Second, "netstat", "-e")
	if err != nil {
		return 0, 0
	}
	// La première ligne dont les deux derniers champs sont numériques est la ligne "Bytes".
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) < 3 {
			continue
		}
		r, e1 := strconv.ParseUint(f[len(f)-2], 10, 64)
		t, e2 := strconv.ParseUint(f[len(f)-1], 10, 64)
		if e1 == nil && e2 == nil {
			return r, t
		}
	}
	return 0, 0
}

func collectMetrics() (*Metrics, error) {
	m := &Metrics{}
	m.CPUPercent = cpuPercent()

	var ms memoryStatusEx
	ms.Length = uint32(unsafe.Sizeof(ms))
	if r, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms))); r != 0 {
		m.MemTotal = ms.TotalPhys
		if ms.TotalPhys >= ms.AvailPhys {
			m.MemUsed = ms.TotalPhys - ms.AvailPhys
		}
		if ms.TotalPageFile > ms.TotalPhys {
			m.SwapTotal = ms.TotalPageFile - ms.TotalPhys
			usedPF := ms.TotalPageFile - ms.AvailPageFile
			if usedPF > m.MemUsed {
				m.SwapUsed = usedPF - m.MemUsed
			}
			if m.SwapUsed > m.SwapTotal {
				m.SwapUsed = m.SwapTotal
			}
		}
	}
	if r, _, _ := procGetTickCount64.Call(); r != 0 {
		m.UptimeSeconds = uint64(r) / 1000
	}
	m.NetRxBytes, m.NetTxBytes = readNet()
	m.Disks = readDisks()
	return m, nil
}

// ---------- Ports ----------

func processNames() map[string]string {
	names := map[string]string{}
	out, err := runCmd(20*time.Second, "tasklist", "/FO", "CSV", "/NH")
	if err != nil {
		return names
	}
	r := csv.NewReader(strings.NewReader(out))
	r.FieldsPerRecord = -1
	recs, _ := r.ReadAll()
	for _, rec := range recs {
		if len(rec) >= 2 {
			names[rec[1]] = rec[0]
		}
	}
	return names
}

func splitHostPort(addr string) (string, int, bool) {
	i := strings.LastIndex(addr, ":")
	if i < 0 {
		return "", 0, false
	}
	p, err := strconv.Atoi(addr[i+1:])
	if err != nil || p <= 0 || p > 65535 {
		return "", 0, false
	}
	return strings.Trim(addr[:i], "[]"), p, true
}

func collectPorts() []Port {
	out, err := runCmd(20*time.Second, "netstat", "-ano")
	if err != nil {
		return nil
	}
	names := processNames()
	var ports []Port
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) < 4 {
			continue
		}
		switch strings.ToUpper(f[0]) {
		case "TCP":
			// Indépendant de la langue : un port en écoute a une destination 0.0.0.0:0 ou [::]:0.
			if len(f) < 5 || (f[2] != "0.0.0.0:0" && f[2] != "[::]:0") {
				continue
			}
			host, port, ok := splitHostPort(f[1])
			if ok {
				ports = append(ports, Port{Proto: "tcp", Address: host, Port: port, Process: names[f[len(f)-1]]})
			}
		case "UDP":
			host, port, ok := splitHostPort(f[1])
			if ok {
				ports = append(ports, Port{Proto: "udp", Address: host, Port: port, Process: names[f[len(f)-1]]})
			}
		}
	}
	return sortPorts(ports)
}

// ---------- Inventaire ----------

const psPrefix = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; $ErrorActionPreference = 'SilentlyContinue'; "

func powershell(script string) string {
	out, _ := runCmd(90*time.Second, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psPrefix+script)
	return strings.TrimPrefix(strings.TrimSpace(out), "\ufeff")
}

// jsonObjects accepte un objet unique ou un tableau (ConvertTo-Json simplifie à 1 élément).
func jsonObjects(s string) []map[string]any {
	if s == "" {
		return nil
	}
	var arr []map[string]any
	if err := json.Unmarshal([]byte(s), &arr); err == nil {
		return arr
	}
	var one map[string]any
	if err := json.Unmarshal([]byte(s), &one); err == nil {
		return []map[string]any{one}
	}
	return nil
}

func str(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func collectInventory() *Inventory {
	osi := OSInfo{Family: "windows", ID: "windows", Arch: runtime.GOARCH}
	for _, o := range jsonObjects(powershell("Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber | ConvertTo-Json -Compress")) {
		osi.Pretty = str(o["Caption"])
		osi.VersionID = str(o["Version"])
		osi.Kernel = str(o["Version"])
		break
	}

	script := `$p='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'; ` +
		`Get-ItemProperty $p | Where-Object { $_.DisplayName -and $_.DisplayVersion } | Select-Object DisplayName,DisplayVersion | ConvertTo-Json -Compress`
	var pkgs []Package
	for _, o := range jsonObjects(powershell(script)) {
		name, ver := str(o["DisplayName"]), str(o["DisplayVersion"])
		if name != "" && ver != "" {
			pkgs = append(pkgs, Package{Name: name, Version: ver})
		}
	}
	return finalizeInventory(osi, pkgs)
}
