# THEAI Helm Charts

Kubernetes deployment chart for THEAI Application (Backend + Frontend + PostgreSQL).

## Add Repository

```bash
helm repo add theai https://iwebbo.github.io/THEAI/
helm repo update
```

## Install Chart

```bash
helm install theai theai/theai \
  --namespace theai \
  --create-namespace \
  -f values.yml
```

## Initialise create ingress

```bash
kubectl apply -f ingress.yml -n theai
```

## Prerequisites

- Kubernetes 1.20+
- Helm 3.0+
- Ingress Controller (nginx-ingress)

## Configuration Files (at repo root)

- `values.yml` - Helm values (mandatory)
- `ingress.yml` - Ingress configuration (optional)
- `users.yml` - Application users (optional)

## Deploy with Generic Ansible Pipeline

```bash
ansible-playbook deploy_helm_generic_FINAL.yml \
  -e "repo_git=http://git.local/theai" \
  -e "chart_name=theai" \
  -e "namespace=theai" \
  -e "release_name=theai" \
  -e "values_file=values.yml" \
  -e "ingress_enabled=true" \
  -e "generate_token=true"
```

## Chart Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.replicas` | Backend replicas | 2 |
| `frontend.replicas` | Frontend replicas | 2 |
| `backend.image.tag` | Backend image tag | latest |
| `frontend.image.tag` | Frontend image tag | latest |
| `postgres.storage.size` | PostgreSQL volume size | 10Gi |
| `ingress.enabled` | Enable Ingress | true |

## Build & Push Flow

1. Push to `backend/**` → GitHub Actions builds and pushes to `ghcr.io`
2. Push to `frontend/**` → GitHub Actions builds and pushes to `ghcr.io`
3. Push to `charts/**` → GitHub Actions packages and publishes chart

## Verification

```bash
# List charts
helm search repo theai

# Get values
helm show values theai/theai

# Dry run
helm install theai theai/theai --dry-run --debug
```
