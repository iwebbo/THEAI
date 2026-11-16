## API Documentation

Access the interactive API documentation at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

***

# API Endpoints Reference

This document outlines the key endpoints available for interacting with the system.

## Server Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/servers` | List all servers |
| `POST` | `/api/v1/servers` | Create a new server |
| `GET` | `/api/v1/servers/{id}/check` | Check the status of a specific server |
| `GET` | `/api/v1/servers/check/all` | Check the status of all servers |

## Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | User authentication (Login) |
| `GET` | `/api/v1/auth/me` | Get current user information |

## Agent and Server Details (Requires JWT)
These endpoints relate to agent enrollment, status, metrics, packages, and vulnerabilities.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/agents/servers/{id}/enrollment` | Generate an enrollment token (JWT) for a server |
| `GET` | `/api/v1/agents/servers/{id}` | Get agent status and details (Requires JWT) |
| `GET` | `/api/v1/agents/servers/{id}/metrics` | Retrieve metrics history (Requires JWT) |
| `GET` | `/api/v1/agents/servers/{id}/packages` | List installed packages (Requires JWT) |
| `GET` | `/api/v1/agents/servers/{id}/vulns` | List vulnerabilities (Requires JWT) |
| `POST` | `/api/v1/agents/servers/{id}/vulns/refresh` | Trigger a re-scan for vulnerabilities (Requires JWT) |
| `DELETE` | `/api/v1/agents/servers/{id}` | Remove the agent association (Requires JWT) |

## Agent Communication (Agent Side)
These endpoints are called by the agent, typically using a one-time token followed by an agent API key.

*   `POST /api/v1/agent/enroll`
*   `POST /api/v1/agent/heartbeat`
*   `POST /api/v1/agent/inventory`
*   `POST /api/v1/agent/ports`

## Synthetic Monitoring
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/targets` | **Create a new target.** Sends the target details (URL, interval). |
| **GET** | `/targets` | List all configured synthetic targets. |
| **POST** | `/targets/{id}/check` | Manually trigger an immediate check for the specific target `{id}`. |
| **GET** | `/targets/{id}` | Retrieve the current status, configuration details, and overall health of a specific target. |
| **GET** | `/targets/{id}/checks` | Get the complete history of checks performed for target `{id}` (status code, duration, etc.). |
| **POST** | `/check` | Execute a check in form/standalone mode. Can create/update a target if the `save: true` parameter is used. |
| **PUT** | `/targets/{id}` | Modify the parameters of a target (e.g., disable it or change the interval). |
| **POST** | `/targets/check-all` | Trigger checks simultaneously for all active targets in the system. |
| **DELETE** | `/targets/{id}` | Completely delete a specific synthetic target. |

## Version Checker

| Application | Description & Authentication | JSON Payload (`-d`) |
| :--- | :--- | :--- |
| **SonarQube** | Public, optional token | `{"app_type":"sonarqube","url":"http://sonarqube.lan:9000"}` |
| **Portainer** | Public, optional token (optional channel: `lts` \| `sts` \| `any`) | `{"app_type":"portainer","url":"https://portainer.lan:9443","verify_tls":false}` |
| **Grafana** | Optional token | `{"app_type":"grafana","url":"https://grafana.lan:3000","verify_tls":true}` |
| **Argo CD** | Public | `{"app_type":"argocd","url":"https://argocd.lan"}` |
| **Wiki.js** | **MANDATORY Token** (API key) | `{"app_type":"wikijs","url":"https://wiki.lan","token":"<Wiki.js API key>"}` |
| **Gitea** | Optional token | `{"app_type":"gitea","url":"http://gitea.lan:3000"}` |
| **OpenSearch** | `username` + `password` authentication | `{"app_type":"opensearch","url":"https://opensearch.lan:9200","verify_tls":false,"username":"<user>","password":"<password>"}` |
| **MinIO** | Token = JWT from `mc admin prometheus generate` (or empty if public) | `{"app_type":"minio","url":"http://minio.lan:9000"}` |
| **Proxmox** | **MANDATORY Token** in format `user@realm!tokenid=<secret>` | `{"app_type":"proxmox","url":"https://proxmox.lan:8006","verify_tls":false,"token":"theai@pam!check=<secret>"}` |