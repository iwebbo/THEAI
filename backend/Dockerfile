FROM python:3.11-slim

WORKDIR /app

# Installation des dépendances système nécessaires incluant les outils de sécurité
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build essentials
    gcc \
    python3-dev \
    libpq-dev \
    # Networking tools
    iputils-ping \
    net-tools \
    dnsutils \
    curl \
    wget \
    # Security scanning tools
    nmap \
    netcat-traditional \
    # SSL testing
    openssl \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copie des fichiers de dépendances
COPY requirements.txt .

# Installation des dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code de l'application
COPY ./app .

# Créer un utilisateur non-root pour la sécurité
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Mais on doit rester en root pour pouvoir utiliser nmap et ping
# qui nécessitent des capacités réseau élevées
# Alternative: utiliser setcap pour donner les permissions nécessaires
RUN setcap cap_net_raw+ep /usr/bin/nmap || true
RUN setcap cap_net_raw+ep /bin/ping || true

# Exposition du port
EXPOSE 8000

# Commande de démarrage
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]