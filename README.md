<p align="center">
<img width="500" height="500" alt="theai" src="https://github.com/user-attachments/assets/eeb2491b-34c0-4bf5-84e0-7a3cfa0f36af" />
</p>

# THEAI Monitoring & Vulnerability Platform

A modern, professional server monitoring & vulnerability CVE. Monitor your servers in real-time using multiple protocols (ICMP, HTTP, SSH, TCP) or a lightweight outbound-only agent (metrics, inventory, open ports, CVE correlation) with an intuitive dashboard interface.

![License](https://img.shields.io/badge/MIT-00599C?style=for-the-badge&logo=MIT&logoColor=black)
![Python](https://img.shields.io/badge/Python-4EAA25?style=for-the-badge&logo=Python&logoColor=black)
![React](https://img.shields.io/badge/React-4EAA25?style=for-the-badge&logo=React&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-0078D6?style=for-the-badge&logo=Docker&logoColor=black)
![GO](https://img.shields.io/badge/GO-0078D6?style=for-the-badge&logo=GO&logoColor=black)
---

## Demo

### Login page
<img width="1862" height="902" alt="theai-login-page" src="https://github.com/user-attachments/assets/cf5a313d-9750-4ebd-8397-0d8d7cfb8ec6" />

### Dashboard
<img width="1915" height="909" alt="image" src="https://github.com/user-attachments/assets/a11d0670-d24f-4526-b6c4-174b4a988d6e" />

### Server view
<img width="1903" height="907" alt="image" src="https://github.com/user-attachments/assets/a3206f01-6172-46c6-93fd-eb82a8dbe0c9" />

### Security Dashboard 
<img width="1909" height="909" alt="image" src="https://github.com/user-attachments/assets/6d1ce4a7-312b-43c4-b58d-ef846cd34a43" />

## Features

### Current Features
- **Multi-Protocol Monitoring**: Support for ICMP (ping), TCP, HTTP/HTTPS, and SSH monitoring
- **Agent Monitoring**: Optional Go agent (Linux, Windows, AIX, BSD, macOS) pushing metrics, inventory and open ports over HTTPS
- **CVE Correlation**: Installed packages matched against OSV.dev (Debian, Ubuntu, Alpine), sorted by KEV, EPSS, CVSS
- **Grafana Dashboards**: Monitoring and CVE dashboards provisioned automatically
- **Real-time Dashboard**: Modern, responsive interface with server status overview
- **Server Management**: Add, edit, delete, and configure servers to monitor
- **Automated Checks**: Periodic server health checks with configurable intervals
- **Status Tracking**: Visual status indicators and response time monitoring
- **Modern UI**: Professional interface with customizable themes
- **Settings Panel**: Configure monitoring intervals, alerts, and preferences
- **Dockerized Deployment**: Complete containerized setup with Docker Compose
- **Authentication System**: JWT-based login with environment-configured default user

### Monitoring Capabilities
- **Agent**: CPU, memory, swap, load, disks, network, uptime, open ports, installed packages (see [Agent](#agent))
- **ICMP Ping**: Basic connectivity testing with response time measurement
- **TCP**: TCP availability with custom ports
- **HTTP/HTTPS Monitoring**: Web service availability with custom ports and paths
- **SSH Connectivity**: SSH service monitoring with authentication support
- **Response Time Tracking**: Monitor and track server response times
- **Status History**: Track server status changes over time


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

### Vulnerabilities
- Source: **OSV.dev** (Debian, Ubuntu, Alpine). Source package + source version are queried, patched versions are taken into account.
- Ordered by **KEV**, then **EPSS**, then **CVSS** (NVD / KEV / EPSS from the ingestor are used for enrichment only).
- Re-scan from the UI, or automatically every `VULN_SCAN_INTERVAL_HOURS`.
- Debian data includes CVEs with no fix yet: the count can be high on a fresh host.
- Other OS: inventory only (no correlation).

### Coverage by OS

| OS | Metrics | Ports | Inventory | CVE correlation |
|---|---|---|---|---|
| Linux Debian / Ubuntu / Alpine | full | yes (+ process if root) | dpkg / apk | **yes** (OSV) |
| Linux RPM (RHEL, Rocky, SUSE...) | full | yes | rpm | no (inventory only) |
| Windows | CPU, RAM, disks, network (load: n/a) | yes | installed software | no |
| AIX | best effort (vmstat, df, uptime) | yes | lslpp, rpm | no |
| FreeBSD / Solaris / macOS | best effort | yes | pkg (FreeBSD) | no |

## Vulnerability Scanning & Security Assessment

### Overview
The platform now includes comprehensive vulnerability scanning capabilities to detect and report security issues across your monitored servers. The system provides two scanning approaches: **Quick Scan** for rapid security assessments and **Full Security Scan** for detailed vulnerability analysis.

### Quick Scan Features
Quick scans provide immediate security checks with minimal overhead:

- **Critical Ports Detection**: Identifies dangerous open ports that pose security risks
  - Detects: Telnet (23), NetBIOS (139), SMB (445), RDP (3389), VNC (5900), Redis (6379), Elasticsearch (9200), MongoDB (27017)
  - Categorizes risks by severity level (Critical, High, Medium, Low)
  
- **SSL/TLS Security Check**: Validates HTTPS protocol configuration
  - Detects outdated SSL/TLS versions (SSLv2, SSLv3, TLSv1, TLSv1.1)
  - Recommends upgrade to TLS 1.2 or higher
  - Provides certificate validation information
  
- **Real-time Results**: Synchronous execution with immediate feedback
  - Response time: Typically 5-15 seconds per server
  - Ideal for periodic monitoring and quick security audits

### Full Security Scan Features
Comprehensive vulnerability assessments for in-depth security analysis:

- **Advanced Port Scanning**: Extended port analysis and service detection
- **Protocol Vulnerability Detection**: Identifies protocol-specific weaknesses
- **Technology Stack Assessment**: Detects and analyzes installed services and versions
- **Detailed Vulnerability Reporting**: Complete vulnerability descriptions with severity ratings
  - Critical: Immediate action required
  - High: Must be addressed shortly
  - Medium: Should be resolved in planned maintenance
  - Low: Informational, address when possible
- **Background Execution**: Asynchronous scanning for large-scale deployments
- **Comprehensive Recommendations**: Actionable remediation steps for each vulnerability

### Vulnerability Severity Levels

| Severity | Impact | Example |
|----------|--------|---------|
| **Critical** | Immediate compromise risk | Unencrypted dangerous services |
| **High** | Significant security exposure | Weak SSL/TLS, exposed database ports |
| **Medium** | Moderate security concern | Outdated services, unnecessary open ports |
| **Low** | Minor security issue | Informational findings |

### Security Check Details

#### Dangerous Ports Analysis
The system monitors and flags potentially dangerous open ports:
- **SMB (445)**: Windows file sharing protocol - common attack vector
- **RDP (3389)**: Remote Desktop - frequent brute-force target
- **MongoDB (27017)**: Database - often exposed without authentication
- **Redis (6379)**: Cache service - frequently misconfigured
- **Elasticsearch (9200)**: Search engine - can expose sensitive data
- **Telnet (23)**: Unencrypted remote access - obsolete and dangerous
- **NetBIOS (139)**: Windows networking - legacy protocol with vulnerabilities
- **VNC (5900)**: Remote access - weak authentication protocols

#### SSL/TLS Validation
Ensures secure web communication:
- Detects minimum TLS version in use
- Flags obsolete protocols (SSL 2.0, 3.0, TLS 1.0, 1.1)
- Validates certificate chain
- Recommends modern TLS 1.2+ with strong cipher suites


## Prerequisites

- **Docker** and **Docker Compose** installed on your machine
- **Git** for cloning the repository
- Minimum **2GB RAM** and **1GB storage** for optimal performance

## Installation

### ☸️ **Quick start with Kubernetes** *(Production-ready)*

> **Helm Chart + Documentation**

[ **Documentation Kubernetes officiel** →](https://iwebbo.github.io/THEAI/)

### ☸️ **Quick Start with Docker Compose**

### Clone the repository
 
```bash
git clone https://github.com/iwebbo/THEAI
cd THEAI
```
 
### Prepare the Network
 
```bash
docker network create theai-net
```
 
### Run DB
 
```bash
docker run -d \
--name theai-db \
--network theai-net \
-e POSTGRES_DB=theaidb \
-e POSTGRES_USER=theaiuser \
-e POSTGRES_PASSWORD=theaidbpwd \
postgres:15-alpine
```
 
### Run the Backend
 
```bash
docker run -d \
--name theai-backend \
--network theai-net \
-p 8000:8000 \
-e POSTGRES_SERVER=theai-db \
-e POSTGRES_USER=theaiuser \
-e POSTGRES_PASSWORD=theaidbpwd \
-e POSTGRES_DB=theaidb \
-e POSTGRES_PORT=5432 \
-e SMTP_SERVER=smtp.gmail.com \
-e SMTP_PORT=587 \
-e SMTP_USERNAME=your-email@gmail.com \
-e SMTP_PASSWORD="your-app-specific-password" \
-e SMTP_FROM_EMAIL=monitoring@yourcompany.com \
-e SMTP_USE_TLS=true \
-e ENABLE_EMAIL_ALERTS=true \
-e ALERT_EMAILS=admin@yourcompany.com \
-e SECRET_KEY=your-super-secret-jwt-key-change-this-in-production \
-e ACCESS_TOKEN_EXPIRE_MINUTES=720 \
-e DEFAULT_ADMIN_USERNAME=admin \
-e DEFAULT_ADMIN_PASSWORD=MySecurePassword123! \
-e DEFAULT_ADMIN_EMAIL=admin@theai.local \
-e OSV_ENABLED=true \
-e VULN_SCAN_INTERVAL_HOURS=12 \
-e AGENT_DEFAULT_INTERVAL=30 \
-e AGENT_METRICS_RETENTION_DAYS=30 \
-e NVD_API_KEY="" \ #Optionnal, requested from .gov
ghcr.io/iwebbo/theai/backend:latest
```
 
New agent variables (optional, defaults shown): `OSV_ENABLED` (agent CVE correlation, needs outbound access to `api.osv.dev`), `VULN_SCAN_INTERVAL_HOURS`, `AGENT_DEFAULT_INTERVAL` (heartbeat, seconds), `AGENT_METRICS_RETENTION_DAYS`.
 
### Build the Agent binaries (one-shot)
 
Builds the agent for all OS and copies the binaries and install scripts into the `theai-agent-dist` volume, served by the frontend under `/downloads/agent/`.
 
```bash
docker run --rm \
--name theai-agent-build \
-v theai-agent-dist:/out \
ghcr.io/iwebbo/theai/agent:latest
```

### Grafana

```bash
docker run -d \
--name theai-grafana \
--network theai-net \
-e GF_SECURITY_ADMIN_USER=admin \
-e GF_SECURITY_ADMIN_PASSWORD=change-me \
-e GF_SERVER_ROOT_URL=http://192.168.1.110/grafana/ \
-e GF_SERVER_SERVE_FROM_SUB_PATH=true \
-e GF_AUTH_ANONYMOUS_ENABLED=true \
-e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
-e GF_SECURITY_ALLOW_EMBEDDING=true \
-e GF_ANALYTICS_REPORTING_ENABLED=false \
-e POSTGRES_SERVER=theai-db \
-e POSTGRES_PORT=5432 \
-e POSTGRES_DB=theaidb \
-e POSTGRES_USER=theaiuser \
-e POSTGRES_PASSWORD=theaidbpwd \
-v theai-grafana-data:/var/lib/grafana \
-v $(pwd)/charts/theai/files/grafana/datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml:ro \
-v $(pwd)/charts/theai/files/grafana/providers.yml:/etc/grafana/provisioning/dashboards/providers.yml:ro \
-v $(pwd)/charts/theai/files/grafana/dashboards:/etc/grafana/dashboards:ro \
grafana/grafana:11.2.0
```
### Run the Frontend
 
```bash
docker run -d \
--name theai-ingestor \
--network theai-net \
-e POSTGRES_SERVER=theai-db \
-e POSTGRES_PORT=5432 \
-e POSTGRES_DB=theaidb \
-e POSTGRES_USER=theaiuser \
-e POSTGRES_PASSWORD=theaidbpwd \
-e NVD_API_KEY= \
-e INGEST_DAILY_HOUR_UTC=3 \
ghcr.io/iwebbo/theai/ingestor:latest serve
```

### Run the Frontend
 
```bash
docker run -d \
--name theai-frontend \
--network theai-net \
-p 80:80 \
-e API_URL=http://192.168.1.110:8000 \
-v theai-agent-dist:/usr/share/nginx/agent-dist:ro \
ghcr.io/iwebbo/theai/frontend:latest
```

## API Documentation

Access the interactive API documentation at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints
- `GET /api/v1/servers` - List all servers
- `POST /api/v1/servers` - Create new server
- `GET /api/v1/servers/{id}/check` - Check server status
- `GET /api/v1/servers/check/all` - Check all servers
- `POST /api/v1/auth/login` - User authentication
- `GET /api/v1/auth/me` - Get current user info
- `POST /api/v1/agents/servers/{id}/enrollment` - Generate an enrollment token (JWT)
- `GET /api/v1/agents/servers/{id}` - Agent status and details (JWT)
- `GET /api/v1/agents/servers/{id}/metrics` - Metrics history (JWT)
- `GET /api/v1/agents/servers/{id}/packages` - Installed packages (JWT)
- `GET /api/v1/agents/servers/{id}/vulns` - Vulnerabilities (JWT)
- `POST /api/v1/agents/servers/{id}/vulns/refresh` - Trigger a re-scan (JWT)
- `DELETE /api/v1/agents/servers/{id}` - Remove the agent (JWT)
- `POST /api/v1/agent/enroll`, `/heartbeat`, `/inventory`, `/ports` - Called by the agent (one-time token, then agent API key)

**Permission denied for ping**:
```bash
# On Linux, you may need to allow ping for non-root users
sudo sysctl net.ipv4.ping_group_range="0 2000"
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for system administrators and DevOps engineers**

For questions, suggestions, or support, please open an issue or contact the maintainers.