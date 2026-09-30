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
  -f values.yaml  \
  -f ingress.yaml
```

## Values.yaml storageclass auto provisionning.
```yaml
# Default values for TheAI Helm chart
  nameOverride: ""
  fullnameOverride: ""

  replicaCount: 1

  # Container Registry
  registry: ghcr.io
  imagePullSecrets: []

  # Backend configuration
  backend:
    enabled: true
    name: backend
    image:
      repository: ghcr.io/iwebbo/theai/backend
      tag: "latest"  # GitHub Actions update ce tag
      pullPolicy: IfNotPresent
    
    replicas: 1
    
    service:
      type: ClusterIP
      port: 8000
      targetPort: 8000
    
    resources:
      requests:
        memory: "256Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
    
    env:
      - name: LOG_LEVEL
        value: "INFO"
      - name: DEBUG
        value: "false"

  # Frontend configuration
  frontend:
    enabled: true
    name: frontend
    image:
      repository: ghcr.io/iwebbo/theai/frontend
      tag: "latest"
      pullPolicy: IfNotPresent
    
    replicas: 1
    
    service:
      type: ClusterIP
      port: 80
      targetPort: 8080
    
    resources:
      requests:
        memory: "128Mi"
        cpu: "50m"
      limits:
        memory: "256Mi"
        cpu: "250m"

  # PostgreSQL configuration
  postgres:
    enabled: true
    name: postgres
    image:
      repository: postgres
      tag: "15-alpine"
      pullPolicy: IfNotPresent
    
    service:
      type: ClusterIP
      port: 5432
      targetPort: 5432
    
    storage:
      enabled: true
      size: 10Gi
      className: local-path
      mountPath: /var/lib/postgresql/data
      subPath: postgres
    
    resources:
      requests:
        memory: "256Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
    
    database: server_monitoring
    user: admindb
    password: "changeMe123!"

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

  configmap:
    create: true
    name: theai-users-config
    users_config_path: /etc/theai/users.yml

  # Service Account
  serviceAccount:
    create: true
    name: "theai-sa"

  # Pod Security
  podAnnotations: {}
  podSecurityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000

  securityContext:
    allowPrivilegeEscalation: false
    capabilities:
      drop:
        - ALL
    readOnlyRootFilesystem: true

  # Node selection
  nodeSelector: {}
  tolerations: []
  affinity: {}
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
