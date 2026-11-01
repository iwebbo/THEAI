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
| `POST` | `/api/v1/synthetic/check` | Call the HTTPS Monitor |