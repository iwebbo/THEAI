#!/bin/sh
# Installation de l'agent THEAI sur Linux.
#   curl -fsSL https://theai.example.com/downloads/agent/install.sh | \
#     sudo THEAI_URL=https://theai.example.com THEAI_TOKEN=<jeton> sh
# Variables optionnelles : THEAI_CA_FILE (CA interne PEM), THEAI_ALLOW_HTTP=1 (déconseillé).
set -eu

: "${THEAI_URL:?THEAI_URL est requis}"
: "${THEAI_TOKEN:?THEAI_TOKEN est requis}"

[ "$(id -u)" -eq 0 ] || { echo "Exécuter en root (sudo)." >&2; exit 1; }
[ "$(uname -s)" = "Linux" ] || { echo "install.sh ne gère que Linux ; voir README pour les autres OS." >&2; exit 1; }

BASE="${THEAI_URL%/}/downloads/agent"
case "$(uname -m)" in
  x86_64|amd64)         ARCH=amd64 ;;
  aarch64|arm64)        ARCH=arm64 ;;
  armv7*|armv6*|armhf)  ARCH=arm ;;
  ppc64le)              ARCH=ppc64le ;;
  *) echo "Architecture non supportée: $(uname -m)" >&2; exit 1 ;;
esac
NAME="theai-agent-linux-$ARCH"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL ${THEAI_CA_FILE:+--cacert "$THEAI_CA_FILE"} "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q ${THEAI_CA_FILE:+--ca-certificate="$THEAI_CA_FILE"} -O "$2" "$1"
  else
    echo "curl ou wget requis." >&2; exit 1
  fi
}

echo "Téléchargement de $NAME..."
fetch "$BASE/$NAME" "$TMP/agent"
fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"

EXPECTED="$(grep " $NAME\$" "$TMP/SHA256SUMS" | awk '{print $1}' | head -n1)"
ACTUAL="$(sha256sum "$TMP/agent" | awk '{print $1}')"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Somme de contrôle invalide pour $NAME, abandon." >&2
  exit 1
fi

install -m 0755 "$TMP/agent" /usr/local/bin/theai-agent

if ! id theai-agent >/dev/null 2>&1; then
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin theai-agent
  elif command -v adduser >/dev/null 2>&1; then
    adduser -S -H -s /sbin/nologin theai-agent
  else
    echo "Impossible de créer l'utilisateur theai-agent." >&2; exit 1
  fi
fi

ENROLL_ARGS="-url $THEAI_URL -token $THEAI_TOKEN"
[ -n "${THEAI_CA_FILE:-}" ] && ENROLL_ARGS="$ENROLL_ARGS -ca $THEAI_CA_FILE"
[ "${THEAI_ALLOW_HTTP:-0}" = "1" ] && ENROLL_ARGS="$ENROLL_ARGS -allow-http"
# shellcheck disable=SC2086
/usr/local/bin/theai-agent enroll $ENROLL_ARGS

chown -R theai-agent /etc/theai-agent
chmod 700 /etc/theai-agent
chmod 600 /etc/theai-agent/config.json

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  cat > /etc/systemd/system/theai-agent.service <<'UNIT'
[Unit]
Description=THEAI monitoring agent
After=network-online.target
Wants=network-online.target

[Service]
User=theai-agent
ExecStart=/usr/local/bin/theai-agent run
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now theai-agent
  echo "Agent installé et démarré (systemctl status theai-agent)."
else
  echo "systemd absent : lancer 'theai-agent run' sous votre superviseur (OpenRC, runit, supervisord...)."
  echo "Exemple : su -s /bin/sh theai-agent -c '/usr/local/bin/theai-agent run'"
fi
