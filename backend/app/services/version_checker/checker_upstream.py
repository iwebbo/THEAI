"""Sources officielles des dernières versions publiées (phase « remote » / veille de versions).

Chaque application a une chaîne de sources (la première qui répond l'emporte) ; l'URL
réellement interrogée est conservée dans UpstreamVersion.source.

    Jenkins     updates.jenkins.io/{stable|current}/latestCore.txt         (LTS | weekly)
    SonarQube   community.sonarsource.com/c/sq/releases/24.json            (annonces Community Build)
                hub.docker.com/v2/repositories/library/sonarqube/tags      (image officielle, repli)
    Portainer   api.github.com/repos/portainer/portainer/releases          (filtre LTS | STS)
    Grafana     api.github.com/repos/grafana/grafana/releases
    ArgoCD      api.github.com/repos/argoproj/argo-cd/releases
    Wiki.js     api.github.com/repos/requarks/wiki/releases
    Gitea       dl.gitea.com/gitea/version.json ; repli api.github.com/repos/go-gitea/gitea/releases
    OpenSearch  repo1.maven.org/maven2/org/opensearch/opensearch/maven-metadata.xml
    MinIO       api.github.com/repos/minio/minio/releases (+ état « archivé »)
    Proxmox VE  download.proxmox.com/debian/pve/dists/<suite>/pve-no-subscription/binary-amd64/Packages.gz
"""
from __future__ import annotations

import gzip
import re
from dataclasses import dataclass
import asyncio
import dataclasses
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Pattern, Tuple

import httpx

from .checker_common import (STATUS_ERROR, STATUS_OK, UpstreamVersion, describe_exception,
                             normalize_version, ssl_context)
from .checker_compare import max_by_major, version_key

GITHUB_API = "https://api.github.com"
DEBIAN_SUITES = {7: "bullseye", 8: "bookworm", 9: "trixie"}  # majeure PVE -> suite Debian


class SourceError(Exception):
    """Source injoignable ou réponse inattendue."""


@dataclass
class UpstreamCtx:
    channel: Optional[str] = None
    local_version: Optional[str] = None
    github_token: Optional[str] = None
    suite_override: Optional[str] = None  # suite Debian du dépôt Proxmox (sinon déduite)

    @property
    def proxmox_suite(self) -> str:
        if self.suite_override:
            return self.suite_override
        try:
            return DEBIAN_SUITES.get(int((self.local_version or "").split(".")[0]), "trixie")
        except ValueError:
            return "trixie"


Fetched = Tuple[List[str], str]  # (versions stables, URL interrogée)
Source = Callable[[httpx.AsyncClient, UpstreamCtx], Awaitable[Fetched]]


# --------------------------------------------------------------------------- helpers

def _check(resp: httpx.Response) -> httpx.Response:
    if resp.status_code in (403, 429) and resp.headers.get("x-ratelimit-remaining") == "0":
        raise SourceError("limite d'API GitHub atteinte : définir VC_GITHUB_TOKEN")
    if resp.status_code >= 400:
        raise SourceError(f"HTTP {resp.status_code}")
    return resp


def _json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError as exc:
        raise SourceError("réponse non JSON") from exc


# --------------------------------------------------------------------------- sources

def jenkins_latest_core() -> Source:
    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        path = "stable" if ctx.channel == "stable" else "current"
        url = f"https://updates.jenkins.io/{path}/latestCore.txt"
        text = _check(await client.get(url)).text.strip()
        if not re.fullmatch(r"\d+(\.\d+){1,2}", text):
            raise SourceError("contenu inattendu (pas un numéro de version)")
        return [text], url
    return fetch


def github_releases(owner: str, repo: str, tag_re: str,
                    text_filter: Optional[Callable[[UpstreamCtx], Optional[Pattern[str]]]] = None) -> Source:
    rx = re.compile(tag_re)

    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = f"{GITHUB_API}/repos/{owner}/{repo}/releases?per_page=100"
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if ctx.github_token:
            headers["Authorization"] = f"Bearer {ctx.github_token}"
        data = _json(_check(await client.get(url, headers=headers)))
        if not isinstance(data, list):
            raise SourceError("réponse GitHub inattendue")
        wanted = text_filter(ctx) if text_filter else None
        out: List[str] = []
        for rel in data:
            if not isinstance(rel, dict) or rel.get("draft") or rel.get("prerelease"):
                continue
            m = rx.match(str(rel.get("tag_name", "")))
            if not m:
                continue
            if wanted and not wanted.search(f"{rel.get('name') or ''} {(rel.get('body') or '')[:500]}"):
                continue
            out.append(m.group(1))
        if not out:
            raise SourceError("aucune release stable correspondante")
        return out, url
    return fetch


def gitea_version_json() -> Source:
    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = "https://dl.gitea.com/gitea/version.json"
        data = _json(_check(await client.get(url)))
        try:
            version = data["latest"]["version"]
        except (KeyError, TypeError) as exc:
            raise SourceError("champ latest.version absent") from exc
        return [str(version)], url
    return fetch


def maven_metadata(group_path: str, artifact: str, version_re: str = r"\d+\.\d+\.\d+") -> Source:
    rx = re.compile(rf"<version>({version_re})</version>")

    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = f"https://repo1.maven.org/maven2/{group_path}/{artifact}/maven-metadata.xml"
        versions = rx.findall(_check(await client.get(url)).text)
        if not versions:
            raise SourceError("aucune version dans maven-metadata.xml")
        return versions, url
    return fetch


def sonar_community_announcements() -> Source:
    rx = re.compile(r"Community Build (\d+\.\d+\.\d+\.\d+) released")

    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = "https://community.sonarsource.com/c/sq/releases/24.json"
        data = _json(_check(await client.get(url)))
        try:
            topics = data["topic_list"]["topics"]
        except (KeyError, TypeError) as exc:
            raise SourceError("réponse Discourse inattendue") from exc
        versions = [m.group(1) for t in topics if isinstance(t, dict)
                    for m in [rx.search(str(t.get("title", "")))] if m]
        if not versions:
            raise SourceError("aucune annonce Community Build trouvée")
        return versions, url
    return fetch


def dockerhub_tags(namespace: str, repo: str, tag_re: str, name_hint: str = "") -> Source:
    rx = re.compile(tag_re)

    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = (f"https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags"
               f"?page_size=100&ordering=last_updated" + (f"&name={name_hint}" if name_hint else ""))
        data = _json(_check(await client.get(url)))
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            raise SourceError("réponse Docker Hub inattendue")
        versions = [m.group(1) for r in results if isinstance(r, dict)
                    for m in [rx.match(str(r.get("name", "")))] if m]
        if not versions:
            raise SourceError("aucun tag correspondant")
        return versions, url
    return fetch


def proxmox_packages(scheme: str) -> Source:
    async def fetch(client: httpx.AsyncClient, ctx: UpstreamCtx) -> Fetched:
        url = (f"{scheme}://download.proxmox.com/debian/pve/dists/{ctx.proxmox_suite}"
               "/pve-no-subscription/binary-amd64/Packages.gz")
        raw = _check(await client.get(url)).content
        try:
            text = gzip.decompress(raw).decode("utf-8", "replace")
        except (OSError, EOFError):  # déjà décompressé par le transport
            text = raw.decode("utf-8", "replace")
        versions: List[str] = []
        for stanza in text.split("\n\n"):
            if re.search(r"^Package: pve-manager$", stanza, re.M):
                m = re.search(r"^Version: (\d+\.\d+\.\d+)$", stanza, re.M)
                if m:
                    versions.append(m.group(1))
        if not versions:
            raise SourceError(f"pve-manager introuvable dans la suite {ctx.proxmox_suite}")
        return versions, url
    return fetch


# --------------------------------------------------------------------------- registre

def _portainer_filter(ctx: UpstreamCtx) -> Optional[Pattern[str]]:
    return {"lts": re.compile(r"\bLTS\b"), "sts": re.compile(r"\bSTS\b")}.get(ctx.channel or "")


@dataclass(frozen=True)
class UpstreamSpec:
    docs_url: str
    sources: Tuple[Source, ...]
    channels: Tuple[str, ...] = ()  # canaux acceptés ; le 1er est le défaut
    archived_repo: Optional[Tuple[str, str]] = None  # (owner, repo) à tester pour « archivé »


UPSTREAM: Dict[str, UpstreamSpec] = {
    "jenkins": UpstreamSpec(
        docs_url="https://www.jenkins.io/changelog-stable/",
        sources=(jenkins_latest_core(),),
        channels=("stable", "weekly")),
    "sonarqube": UpstreamSpec(
        docs_url="https://www.sonarsource.com/products/sonarqube/downloads/",
        sources=(sonar_community_announcements(),
                 dockerhub_tags("library", "sonarqube", r"^(\d+\.\d+\.\d+\.\d+)-community$", "community"))),
    "portainer": UpstreamSpec(
        docs_url="https://docs.portainer.io/start/lifecycle",
        sources=(github_releases("portainer", "portainer", r"^(\d+\.\d+\.\d+)$", _portainer_filter),),
        channels=("lts", "sts", "any")),
    "grafana": UpstreamSpec(
        docs_url="https://github.com/grafana/grafana/releases",
        sources=(github_releases("grafana", "grafana", r"^v(\d+\.\d+\.\d+)(?:\+security-\d+)?$"),)),
    "argocd": UpstreamSpec(
        docs_url="https://github.com/argoproj/argo-cd/releases",
        sources=(github_releases("argoproj", "argo-cd", r"^v(\d+\.\d+\.\d+)$"),)),
    "wikijs": UpstreamSpec(
        docs_url="https://github.com/requarks/wiki/releases",
        sources=(github_releases("requarks", "wiki", r"^v?(\d+\.\d+\.\d+)$"),)),
    "gitea": UpstreamSpec(
        docs_url="https://github.com/go-gitea/gitea/releases",
        sources=(gitea_version_json(), github_releases("go-gitea", "gitea", r"^v(\d+\.\d+\.\d+)$"))),
    "opensearch": UpstreamSpec(
        docs_url="https://opensearch.org/releases/",
        sources=(maven_metadata("org/opensearch", "opensearch"),)),
    "minio": UpstreamSpec(
        docs_url="https://github.com/minio/minio/releases",
        sources=(github_releases("minio", "minio", r"^(RELEASE\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$"),),
        archived_repo=("minio", "minio")),
    "proxmox": UpstreamSpec(
        docs_url="https://pve.proxmox.com/wiki/Roadmap",
        sources=(proxmox_packages("https"), proxmox_packages("http"))),
}


async def github_repo_archived(client: httpx.AsyncClient, ctx: UpstreamCtx, owner: str, repo: str) -> Optional[bool]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if ctx.github_token:
        headers["Authorization"] = f"Bearer {ctx.github_token}"
    try:
        data = _json(_check(await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)))
        return bool(data.get("archived")) if isinstance(data, dict) else None
    except (SourceError, httpx.HTTPError):
        return None


# --------------------------------------------------------------------------- exécution

DEFAULT_CACHE_TTL = 3600.0
USER_AGENT = "THEAI-version-checker/1.0"

# Point d'injection pour les tests (httpx.MockTransport). None en production.
_TRANSPORT: Optional[httpx.AsyncBaseTransport] = None
_CACHE: Dict[Tuple, Tuple[float, UpstreamVersion]] = {}


def set_transport_override(transport: Optional[httpx.AsyncBaseTransport]) -> None:
    global _TRANSPORT
    _TRANSPORT = transport


def clear_cache() -> None:
    _CACHE.clear()


@dataclass(frozen=True)
class UpstreamOptions:
    github_token: Optional[str] = None
    proxmox_suite: Optional[str] = None
    timeout: float = 15.0
    ca_file: Optional[str] = None
    cache_ttl: float = DEFAULT_CACHE_TTL


def resolve_channel(spec: UpstreamSpec, channel: Optional[str]) -> Optional[str]:
    """Canal demandé (ou défaut) ; ValueError si invalide pour cette application."""
    if not spec.channels:
        return None
    value = (channel or spec.channels[0]).lower()
    if value not in spec.channels:
        raise ValueError(f"canal {value!r} invalide (attendu : {', '.join(spec.channels)})")
    return value


def _summarize(versions: List[str], max_parts: Optional[int]):
    pairs = []
    for raw in versions:
        try:
            pairs.append((normalize_version(raw, max_parts), raw))
        except ValueError:
            continue
    if not pairs:
        raise SourceError("aucune version exploitable")
    numeric = [p for p in pairs if version_key(p[0])]
    if numeric:
        best = max(numeric, key=lambda p: (version_key(p[0]), p[1]))
        return best, max_by_major(p[0] for p in numeric)
    return max(pairs), {}


async def fetch_upstream(app: str, spec: UpstreamSpec, channel: Optional[str] = None,
                         local_version: Optional[str] = None, opts: Optional[UpstreamOptions] = None,
                         max_parts: Optional[int] = None, use_cache: bool = True) -> UpstreamVersion:
    """Dernière version officielle d'une application (chaîne de sources avec repli, cache mémoire)."""
    opts = opts or UpstreamOptions()
    result = UpstreamVersion(app=app, docs_url=spec.docs_url)
    try:
        result.channel = resolve_channel(spec, channel)
    except ValueError as exc:
        result.error = str(exc)
        return result
    ctx = UpstreamCtx(channel=result.channel, local_version=local_version,
                      github_token=opts.github_token, suite_override=opts.proxmox_suite)

    key = (app, result.channel, ctx.proxmox_suite if app == "proxmox" else None)
    cached = _CACHE.get(key)
    if use_cache and _TRANSPORT is None and cached and time.monotonic() - cached[0] < opts.cache_ttl:
        return dataclasses.replace(cached[1])

    started = time.monotonic()
    errors: List[str] = []
    try:
        async with httpx.AsyncClient(
            verify=ssl_context(True, opts.ca_file), timeout=opts.timeout, follow_redirects=True,
            transport=_TRANSPORT, headers={"User-Agent": USER_AGENT},
        ) as client:
            for source in spec.sources:
                try:
                    versions, url = await source(client, ctx)
                    (norm, raw), by_major = _summarize(versions, max_parts)
                except (SourceError, httpx.HTTPError) as exc:
                    errors.append(str(exc) if isinstance(exc, SourceError) else describe_exception(exc))
                    continue
                result.latest, result.latest_raw, result.latest_by_major = norm, raw, by_major
                result.source, result.status = url, STATUS_OK
                break
            else:
                result.error = " | ".join(errors) or "aucune source"
            if result.status == STATUS_OK and spec.archived_repo:
                result.archived = await github_repo_archived(client, ctx, *spec.archived_repo)
    except Exception as exc:  # pragma: no cover - garde-fou
        result.status, result.error = STATUS_ERROR, describe_exception(exc)
    finally:
        result.latency_ms = int((time.monotonic() - started) * 1000)

    if result.status == STATUS_OK and _TRANSPORT is None:
        _CACHE[key] = (time.monotonic(), dataclasses.replace(result))
    return result