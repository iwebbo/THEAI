"""Lecture de la version *installée* d'une instance (phase « local »).

Un provider = une fonction async qui lit la version installée d'une application.

Chaque fonction retourne la version brute (str) ou lève VersionError.
Endpoints utilisés (tous en lecture seule) :

    Jenkins     GET /api/json                    -> en-tête X-Jenkins
    SonarQube   GET /api/server/version          -> texte brut (public)
    Portainer   GET /api/system/status           -> {"Version": ...} (public)
    Grafana     GET /api/health                  -> {"version": ...}
                (repli : /api/frontend/settings -> buildInfo.version)
    ArgoCD      GET /api/version                 -> {"Version": ...} (public)
    Wiki.js     POST /graphql  system.info.currentVersion (clé API requise)
    Gitea       GET /api/v1/version              -> {"version": ...}
    OpenSearch  GET /                            -> {"version": {"number": ...}}
    MinIO       GET /minio/v2/metrics/cluster    -> minio_software_version_info{version=...}
    Proxmox     GET /api2/json/version           -> {"data": {"version": ...}} (token requis)
"""
from __future__ import annotations

import re
import time
from typing import Any, Awaitable, Callable, Dict, Optional
from urllib.parse import urlsplit

import httpx

from .checker_common import (STATUS_ERROR, STATUS_NOT_CONFIGURED, STATUS_OK, AppConfig, LocalVersion,
                             describe_exception, normalize_version, ssl_context)


class VersionError(Exception):
    """Version introuvable ou réponse inattendue."""


def _auth(cfg: AppConfig) -> Optional[httpx.BasicAuth]:
    if cfg.username and cfg.password:
        return httpx.BasicAuth(cfg.username, cfg.password)
    return None


async def _get(client: httpx.AsyncClient, cfg: AppConfig, path: str,
               headers: Optional[Dict[str, str]] = None,
               auth: Optional[httpx.Auth] = None) -> httpx.Response:
    return await client.get(cfg.url + path, headers=headers or {}, auth=auth)


def _json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError as exc:
        raise VersionError(f"réponse non JSON (HTTP {resp.status_code})") from exc


def _dig(data: Any, *keys: str) -> str:
    cur = data
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            raise VersionError(f"champ '{'.'.join(keys)}' absent de la réponse")
        cur = cur[k]
    if not isinstance(cur, str) or not cur.strip():
        raise VersionError(f"champ '{'.'.join(keys)}' vide")
    return cur.strip()


def _ok(resp: httpx.Response) -> httpx.Response:
    if resp.status_code in (401, 403):
        raise VersionError(f"accès refusé (HTTP {resp.status_code}) : vérifier USER/PASSWORD/TOKEN")
    if resp.status_code >= 400:
        raise VersionError(f"HTTP {resp.status_code}")
    return resp


# --------------------------------------------------------------------------- #

async def jenkins(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    # L'en-tête X-Jenkins est renvoyé même sur 403 : l'auth n'est pas indispensable.
    resp = await _get(client, cfg, "/api/json?tree=mode", auth=_auth(cfg))
    version = resp.headers.get("X-Jenkins")
    if not version:
        raise VersionError(f"en-tête X-Jenkins absent (HTTP {resp.status_code})")
    return version.strip()


async def sonarqube(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    # Token SonarQube : en Basic avec le token comme utilisateur et mot de passe vide.
    auth = httpx.BasicAuth(cfg.token, "") if cfg.token else _auth(cfg)
    resp = _ok(await _get(client, cfg, "/api/server/version", auth=auth))
    text = resp.text.strip()
    if not re.fullmatch(r"\d[\w.\-]*", text):
        raise VersionError("réponse inattendue (pas un numéro de version)")
    return text


async def portainer(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    headers = {"X-API-Key": cfg.token} if cfg.token else {}
    resp = _ok(await _get(client, cfg, "/api/system/status", headers=headers))
    return _dig(_json(resp), "Version")


async def grafana(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    headers = {"Authorization": f"Bearer {cfg.token}"} if cfg.token else {}
    resp = _ok(await _get(client, cfg, "/api/health", headers=headers, auth=_auth(cfg)))
    data = _json(resp)
    if isinstance(data, dict) and isinstance(data.get("version"), str) and data["version"].strip():
        return data["version"].strip()
    # /api/health masque la version selon la config : repli sur les settings.
    resp = _ok(await _get(client, cfg, "/api/frontend/settings", headers=headers, auth=_auth(cfg)))
    return _dig(_json(resp), "buildInfo", "version")


async def argocd(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    headers = {"Authorization": f"Bearer {cfg.token}"} if cfg.token else {}
    resp = _ok(await _get(client, cfg, "/api/version", headers=headers))
    return _dig(_json(resp), "Version")


async def wikijs(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    if not cfg.token:
        raise VersionError("VC_WIKIJS_TOKEN requis (clé API avec droit manage:system)")
    query = {"query": "{ system { info { currentVersion } } }"}
    resp = _ok(await client.post(cfg.url + "/graphql", json=query,
                                 headers={"Authorization": f"Bearer {cfg.token}"}))
    data = _json(resp)
    if isinstance(data, dict) and data.get("errors"):
        msg = data["errors"][0].get("message", "erreur GraphQL") if isinstance(data["errors"][0], dict) else "erreur GraphQL"
        raise VersionError(f"GraphQL : {msg}")
    return _dig(data, "data", "system", "info", "currentVersion")


async def gitea(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    headers = {"Authorization": f"token {cfg.token}"} if cfg.token else {}
    resp = _ok(await _get(client, cfg, "/api/v1/version", headers=headers))
    return _dig(_json(resp), "version")


async def opensearch(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    resp = _ok(await _get(client, cfg, "/", auth=_auth(cfg)))
    data = _json(resp)
    dist = data.get("version", {}).get("distribution") if isinstance(data, dict) else None
    if dist is not None and dist != "opensearch":
        raise VersionError(f"distribution inattendue : {dist}")
    return _dig(data, "version", "number")


_MINIO_RE = re.compile(r'^minio_software_version_info\{[^}]*\bversion="([^"]+)"', re.M)


async def minio(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    # Pas d'API de version publique sur MinIO : on lit la métrique Prometheus.
    # Nécessite soit MINIO_PROMETHEUS_AUTH_TYPE=public, soit un JWT (mc admin prometheus generate).
    headers = {"Authorization": f"Bearer {cfg.token}"} if cfg.token else {}
    resp = _ok(await _get(client, cfg, "/minio/v2/metrics/cluster", headers=headers))
    m = _MINIO_RE.search(resp.text)
    if not m:
        raise VersionError("métrique minio_software_version_info introuvable")
    return m.group(1)


async def proxmox(client: httpx.AsyncClient, cfg: AppConfig) -> str:
    if not cfg.token:
        raise VersionError("VC_PROXMOX_TOKEN requis (format user@realm!tokenid=secret)")
    if not re.fullmatch(r"[^@!=\s]+@[^@!=\s]+![^@!=\s]+=\S+", cfg.token):
        raise VersionError("VC_PROXMOX_TOKEN mal formé : format attendu user@realm!tokenid=<secret> (secret manquant ?)")
    resp = _ok(await _get(client, cfg, "/api2/json/version",
                          headers={"Authorization": f"PVEAPIToken={cfg.token}"}))
    return _dig(_json(resp), "data", "version")


PROVIDERS: Dict[str, Callable[[httpx.AsyncClient, AppConfig], Awaitable[str]]] = {
    "jenkins": jenkins,
    "sonarqube": sonarqube,
    "portainer": portainer,
    "grafana": grafana,
    "argocd": argocd,
    "wikijs": wikijs,
    "gitea": gitea,
    "opensearch": opensearch,
    "minio": minio,
    "proxmox": proxmox,
}


# --------------------------------------------------------------------------- exécution

LocalProvider = Callable[[httpx.AsyncClient, AppConfig], Awaitable[str]]

# Point d'injection pour les tests (httpx.MockTransport). None en production.
_TRANSPORT: Optional[httpx.AsyncBaseTransport] = None


def set_transport_override(transport: Optional[httpx.AsyncBaseTransport]) -> None:
    global _TRANSPORT
    _TRANSPORT = transport


def _host_guard(expected_host: str):
    """Refuse toute requête (redirection comprise) vers un autre hôte que celui configuré :
    empêche qu'une redirection ne fasse fuiter un en-tête d'authentification (X-API-Key...)."""
    async def guard(request: httpx.Request) -> None:
        if (request.url.host or "").lower() != expected_host:
            raise VersionError("redirection vers un autre hôte refusée")
    return guard


async def check_local(app: str, provider: LocalProvider, cfg: Optional[AppConfig],
                      max_parts: Optional[int] = None) -> LocalVersion:
    """Lit la version installée. cfg=None -> « non configurée » (aucun appel réseau)."""
    if cfg is None:
        return LocalVersion(app=app, url=None, status=STATUS_NOT_CONFIGURED, error="URL non renseignée")

    result = LocalVersion(app=app, url=cfg.url, status=STATUS_ERROR)
    started = time.monotonic()
    try:
        host = (urlsplit(cfg.url).hostname or "").lower()
        async with httpx.AsyncClient(
            verify=ssl_context(cfg.verify_tls, cfg.ca_file),
            timeout=cfg.timeout,
            follow_redirects=True,
            transport=_TRANSPORT,
            event_hooks={"request": [_host_guard(host)]},
        ) as client:
            raw = await provider(client, cfg)
        result.raw = raw
        result.version = normalize_version(raw, max_parts)
        result.status = STATUS_OK
    except (VersionError, ValueError) as exc:
        result.error = str(exc)
    except Exception as exc:  # réseau, TLS, ...
        result.error = describe_exception(exc)
    finally:
        result.latency_ms = int((time.monotonic() - started) * 1000)
    return result
