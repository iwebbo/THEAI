# THEAI Helm Charts

Kubernetes deployment chart for THEAI Application (Backend + Frontend + PostgreSQL).

## Add Repository

```bash
helm repo add theai https://iwebbo.github.io/THEAI/
helm repo update
```

## Install Chart

```bash
helm upgrade --install theai theai/theai \
  --namespace theai \
  --create-namespace \
  -f ingress.yaml
```

## Values.yaml - change values.
```yaml

  secrets:
    create: true
    name: theai-secret
    data:
      SECRET_KEY: "changeMeSecretKey"
      POSTGRES_SERVER: "theai-postgres"
      POSTGRES_PORT: "5432"
      POSTGRES_DB: "server_monitoring"
      POSTGRES_USER: "admindb"
      POSTGRES_PASSWORD: "changeMe123!"
      SMTP_SERVER: "smtp.gmail.com"
      SMTP_PORT: "587"
      SMTP_USERNAME: "your-email@gmail.com"
      SMTP_PASSWORD: "your-app-password"
      SMTP_FROM_EMAIL: "monitoring@theai.local"
      SMTP_USE_TLS: "true"
      ENABLE_EMAIL_ALERTS: "true"
      DEFAULT_ADMIN_USERNAME: "admin"
      DEFAULT_ADMIN_PASSWORD: "AdminPass123"
      DEFAULT_ADMIN_EMAIL: "admin@theai.local"

```

## ingress.yaml
```yaml
    ingress:
      enabled: true
      className: "nginx"
      annotations:
        #nginx.ingress.kubernetes.io/rewrite-target: /
        nginx.ingress.kubernetes.io/proxy-body-size: "20m"
      
      hosts:
        - host: theai.local
          paths:
            - path: /
              pathType: Prefix
              service: frontend
              port: 80
            - path: /api
              pathType: Prefix
              service: backend
              port: 8000
      
      tls:
        enabled: false
```

## Prerequisites

- Kubernetes 1.20+
- Helm 3.0+
- Ingress Controller (nginx-ingress)

## Configuration Files (at repo root)

- `values.yml` - Helm values (mandatory)
- `ingress.yml` - Ingress configuration (mandatory)
- `users.yml` - Application users (optional)

## Deploy with Generic Ansible Pipeline

```bash
ansible-playbook deploy_helm_generic.yml 

use : https://github.com/iwebbo/Ansible/tree/main/roles/deploy_herlmchart_stack_standalone

```

## Check

```bash
# List charts
helm search repo theai

# Get values
helm show values theai/theai

# Dry run
helm install theai theai/theai --dry-run --debug
```
