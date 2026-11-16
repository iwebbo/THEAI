"""Briques communes du version checker : statuts, structures de résultat, normalisation, TLS."""
from __future__ import annotations

import re
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

import httpx

# --- statuts de lecture (local / amont) ---------------------------------------------------
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_NOT_CONFIGURED = "not_configured"  # aucune URL renseignée pour cette application

# --- statuts de comparaison installé / publié ----------------------------------------------
UP_TO_DATE = "up_to_date"
PATCH_BEHIND = "patch_behind"
MINOR_BEHIND = "minor_behind"
MAJOR_BEHIND = "major_behind"
BEHIND = "behind"  # versions non numériques (MinIO RELEASE.<date>)
AHEAD = "ahead"
UNKNOWN = "unknown"

UPDATE_STATUSES = (UP_TO_DATE, PATCH_BEHIND, MINOR_BEHIND, MAJOR_BEHIND, BEHIND, AHEAD, UNKNOWN)


def utcnow() -> datetime:
    """UTC naïf (convention des colonnes DateTime de THEAI)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class AppConfig:
    """Paramètres de connexion à UNE instance (déchiffrés, jamais journalisés)."""

    app: str
    url: str
    username: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    verify_tls: bool = True
    ca_file: Optional[str] = None
    timeout: float = 10.0

    def __repr__(self) -> str:  # ne jamais exposer les secrets dans les logs
        return f"AppConfig(app={self.app!r}, url={self.url!r}, verify_tls={self.verify_tls})"


@dataclass
class LocalVersion:
    """Version installée d'une instance."""

    app: str
    url: Optional[str]
    status: str = STATUS_NOT_CONFIGURED
    version: Optional[str] = None  # normalisée (comparable)
    raw: Optional[str] = None  # valeur brute renvoyée par l'application
    error: Optional[str] = None
    latency_ms: Optional[int] = None
    checked_at: datetime = field(default_factory=utcnow)


@dataclass
class UpstreamVersion:
    """Dernières versions publiées par la source officielle d'une application."""

    app: str
    status: str = STATUS_ERROR
    latest: Optional[str] = None  # normalisée, toutes majeures confondues
    latest_raw: Optional[str] = None
    latest_by_major: Dict[int, str] = field(default_factory=dict)  # {2: "2.5.314", 3: "3.0.1"}
    channel: Optional[str] = None  # stable|weekly (Jenkins), lts|sts|any (Portainer)
    source: Optional[str] = None  # URL officielle réellement interrogée
    docs_url: Optional[str] = None  # page officielle lisible (notes de version / téléchargement)
    archived: Optional[bool] = None  # dépôt amont archivé (plus de mises à jour officielles)
    error: Optional[str] = None
    latency_ms: Optional[int] = None
    checked_at: datetime = field(default_factory=utcnow)


# --- normalisation -------------------------------------------------------------------------
_NUM = re.compile(r"^v?(\d+(?:\.\d+)*)")
_MINIO = re.compile(r"^RELEASE\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$")


def normalize_version(raw: str, max_parts: Optional[int] = None) -> str:
    """'v2.12.3+6b9cd82' -> '2.12.3' ; 'RELEASE.2024-10-02T17-50-41Z' inchangé.

    max_parts : nombre de composantes numériques conservées (le reste = build, ignoré),
    ex. 3 pour SonarQube : 10.6.0.92116 -> 10.6.0."""
    raw = raw.strip()
    if _MINIO.match(raw):
        return raw
    m = _NUM.match(raw)
    if not m:
        raise ValueError(f"version non reconnue : {raw!r}")
    parts = m.group(1).split(".")
    if max_parts:
        parts = parts[:max_parts]
    return ".".join(parts)


# --- TLS -----------------------------------------------------------------------------------
def ssl_context(verify_tls: bool = True, ca_file: Optional[str] = None) -> Union[bool, ssl.SSLContext]:
    """verify=False | contexte SSL basé sur le magasin système (ou CA_FILE).

    httpx utiliserait sinon le bundle certifi et ignorerait les CA internes installées
    dans /usr/local/share/ca-certificates. X509_STRICT (Python >= 3.13) est désactivé :
    il rejette à tort de nombreuses CA internes (chaîne et nom d'hôte restent vérifiés)."""
    if not verify_tls:
        return False
    ctx = ssl.create_default_context(cafile=ca_file)
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def describe_exception(exc: Exception) -> str:
    """Message d'erreur lisible, sans URL complète ni secret."""
    if isinstance(exc, httpx.TimeoutException):
        return "timeout"
    if isinstance(exc, httpx.ConnectError):
        text = str(exc).lower()
        if "certificate" in text or "ssl" in text:
            return "erreur TLS (certificat non reconnu) : installer la CA, renseigner ca_file ou désactiver verify_tls"
        return "connexion impossible"
    if isinstance(exc, httpx.ProxyError):
        return "proxy refusé/injoignable (variables HTTPS_PROXY / NO_PROXY ?)"
    if isinstance(exc, httpx.TooManyRedirects):
        return "trop de redirections"
    if isinstance(exc, httpx.HTTPError):
        return f"erreur HTTP : {type(exc).__name__}"
    return str(exc) or type(exc).__name__
