<p align="center">
<img width="500" height="500" alt="theai" src="https://github.com/user-attachments/assets/eeb2491b-34c0-4bf5-84e0-7a3cfa0f36af" />
</p>

# THEAI Monitoring & Vulnerability Platform

A modern, professional server monitoring & vulnerability CVE. Monitor your servers in real-time using multiple protocols (ICMP, HTTP, SSH, TCP) or a lightweight outbound-only agent (metrics, inventory, open ports, CVE correlation) HTTPS Monitor (SSL/HTTPS Lifecycle) are now available.

![License](https://img.shields.io/badge/MIT-00599C?style=for-the-badge&logo=MIT&logoColor=black)
![Python](https://img.shields.io/badge/Python-4EAA25?style=for-the-badge&logo=Python&logoColor=black)
![React](https://img.shields.io/badge/React-4EAA25?style=for-the-badge&logo=React&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-0078D6?style=for-the-badge&logo=Docker&logoColor=black)
![GO](https://img.shields.io/badge/GO-0078D6?style=for-the-badge&logo=GO&logoColor=black)
---
[![Version](https://img.shields.io/badge/Version-v1.1.28-blue?style=for-the-badge&logo=github)](https://github.com/iwebbo/THEAI/releases/tag/v1.1.28)
---

## Features

### Current Features
- **HTTPS Monitor** : HTTPS/TLS and Certificate checks (SSL/HTTPS Lifecyle)
- **Multi-Protocol Monitoring**: Support for ICMP (ping), TCP, HTTP/HTTPS, and SSH monitoring
- **Agent Monitoring**: Optional Go agent (Linux, Windows, AIX, BSD, macOS) pushing metrics, inventory and open ports over HTTPS
- **CVE Correlation**: Installed packages matched against OSV.dev (Debian, Ubuntu, Alpine), sorted by KEV, EPSS, CVSS
- **Grafana Dashboards**: Monitoring and CVE dashboards provisioned automatically
- **Real-time Dashboard**: Modern, responsive interface with server status overview
- **Server Management**: Add, edit, delete, and configure servers to monitor
- **Automated Checks**: Periodic server health checks with configurable intervals
- **Status Tracking**: Visual status indicators and response time monitoring
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

---
### Demo
> **Screenshot** : 

[![Demo Badge](https://img.shields.io/badge/Demo-blue?style=for-the-badge&logo=github)](doc/screenshot/doc.md)

### Vulnerability
> **Documentation of Vulnerability** :

[![Vulnerability Badge](https://img.shields.io/badge/Vuln-red?style=for-the-badge&logo=security)](doc/vulnerability/doc.md)

### Agents
> **Documentation of Agents** : 

[![Agents Badge](https://img.shields.io/badge/Agent-green?style=for-the-badge&logo=robot)](doc/agents/install.md)

### HTTPS Monitor
> **Documentation of HTTPS Monitor** : 

[![Shield Badge](https://img.shields.io/badge/Security-blue?style=for-the-badge&logo=shield)](doc/https_monitor/doc.md)

### API
> **Documentation of API** :

[![API Badge](https://img.shields.io/badge/API-orange?style=for-the-badge&logo=code)](docs/api/doc.md)

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
### Run Ingestor
 
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

### Run Frontend
 
```bash
docker run -d \
--name theai-frontend \
--network theai-net \
-p 80:80 \
-e API_URL=http://192.168.1.110:8000 \
-v theai-agent-dist:/usr/share/nginx/agent-dist:ro \
ghcr.io/iwebbo/theai/frontend:latest
```

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
