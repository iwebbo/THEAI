## Agent

The agent is an optional static Go binary installed on the monitored server. It only makes **outbound HTTPS** calls to THEAI (nothing listens on the host, no remote command execution).

### What it does
- **Heartbeat + metrics** every ~30s: CPU, memory, swap, load, disks, network, uptime
- **Inventory**: OS info and installed packages (sent only when changed)
- **Open ports**: listening ports and processes (sent only when changed)
- **Status**: a server is `online` while its last heartbeat is recent, `unknown` until the agent is enrolled

### Add an agent in the UI
1. **Servers > Add Server**, tick **Agent** (default: `agent` + `icmp`; ICMP/TCP/HTTP/SSH checks can still be combined). The IP is only used by the active checks, the agent does not need it.
2. Open the server page, **Agent** panel: generate a one-time **enrollment token**.
3. Run the displayed command on the target (token is exchanged for a per-server API key stored hashed in DB, config is written locally with restricted permissions).

Linux / Unix:
```bash
curl -fsSL https://<theai-url>/downloads/agent/install.sh | sudo THEAI_URL=https://<theai-url> THEAI_TOKEN=<token> sh
```

Windows (PowerShell as Administrator):
```powershell
$env:THEAI_URL='https://<theai-url>'; $env:THEAI_TOKEN='<token>'; iwr "$env:THEAI_URL/downloads/agent/install.ps1" -UseBasicParsing | iex
```

Internal CA: set `THEAI_CA_FILE=/path/ca.pem` (HTTP is refused unless `THEAI_ALLOW_HTTP=1`). Binaries and scripts are served by the frontend under `/downloads/agent/` (checksums in `SHA256SUMS`).

[![Agents Badge](https://img.shields.io/badge/Agent_Management-green?style=for-the-badge&logo=robot)](./agents.md)
[![Agents Badge](https://img.shields.io/badge/Inventory-green?style=for-the-badge&logo=robot)](./inventory.md)
