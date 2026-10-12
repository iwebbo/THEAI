"""
Corrélation paquets -> CVE.

Source de vérité : OSV.dev (données des trackers de sécurité Debian / Ubuntu / Alpine).
OSV associe directement (paquet source, version installée) aux avis de sécurité en tenant
compte des correctifs rétroportés : on évite ainsi les faux positifs d'une correspondance
CPE/NVD sur des noms de paquets de distribution. NVD / KEV / EPSS (schéma `cve`) ne servent
qu'à enrichir et prioriser : KEV d'abord, puis EPSS, puis CVSS.
"""
import asyncio
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import quote

import httpx
from sqlalchemy import or_

from core.database import SessionLocal
from models.agent import AgentInventory, AgentMetric, OsvCache, ServerVuln
from services.agent_service import METRICS_RETENTION_DAYS, utcnow

logger = logging.getLogger(__name__)

OSV_ENABLED = os.getenv("OSV_ENABLED", "true").lower() == "true"
OSV_URL = os.getenv("OSV_API_URL", "https://api.osv.dev").rstrip("/")
SCAN_INTERVAL_HOURS = float(os.getenv("VULN_SCAN_INTERVAL_HOURS", "12"))
BATCH_SIZE = 500
DETAIL_WORKERS = 8

CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}")


def extract_cves(vuln: dict) -> List[str]:
    """
    CVE d'une notice OSV : identifiant, alias et 'upstream' uniquement.
    'related' est volontairement ignoré (simple lien de proximité, source de faux positifs).
    """
    found: Set[str] = set()
    candidates = [vuln.get("id", "")]
    candidates += vuln.get("aliases") or []
    candidates += vuln.get("upstream") or []
    for c in candidates:
        if isinstance(c, str):
            found.update(CVE_RE.findall(c.upper()))
    return sorted(found)


def _request(client: httpx.Client, method: str, url: str, **kwargs) -> Optional[httpx.Response]:
    """Requête avec 3 essais (429/5xx/réseau). Retourne None sur 404."""
    last: Optional[Exception] = None
    for attempt in range(3):
        try:
            resp = client.request(method, url, **kwargs)
            if resp.status_code == 404:
                return None
            if resp.status_code == 429 or resp.status_code >= 500:
                raise RuntimeError(f"OSV HTTP {resp.status_code}")
            resp.raise_for_status()
            return resp
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"OSV injoignable: {last}")


def osv_querybatch(client: httpx.Client, queries: List[dict]) -> List[List[dict]]:
    """Résultats alignés sur `queries`, pagination OSV (next_page_token) incluse."""
    results: List[List[dict]] = [[] for _ in queries]
    todo: List[Tuple[int, dict]] = list(enumerate(queries))
    rounds = 0
    while todo and rounds < 50:
        rounds += 1
        next_todo: List[Tuple[int, dict]] = []
        for start in range(0, len(todo), BATCH_SIZE):
            chunk = todo[start:start + BATCH_SIZE]
            resp = _request(client, "POST", f"{OSV_URL}/v1/querybatch",
                            json={"queries": [q for _, q in chunk]})
            if resp is None:
                raise RuntimeError("OSV querybatch: 404")
            res = resp.json().get("results", [])
            if len(res) != len(chunk):
                raise RuntimeError("OSV querybatch: nombre de résultats inattendu")
            for (idx, query), r in zip(chunk, res):
                results[idx].extend(r.get("vulns") or [])
                token = r.get("next_page_token")
                if token:
                    nq = dict(query)
                    nq["page_token"] = token
                    next_todo.append((idx, nq))
        todo = next_todo
    return results


def _fetch_vuln(client: httpx.Client, vid: str) -> Tuple[str, Optional[dict]]:
    try:
        resp = _request(client, "GET", f"{OSV_URL}/v1/vulns/{quote(vid, safe='')}")
        return vid, (resp.json() if resp is not None else {})
    except Exception as exc:  # noqa: BLE001
        logger.warning("OSV détail %s indisponible: %s", vid, exc)
        return vid, None


def build_queries(packages: List[dict], ecosystem: str) -> Dict[Tuple[str, str], dict]:
    """Une requête par (paquet source, version source) : dédoublonnage des paquets binaires."""
    queries: Dict[Tuple[str, str], dict] = {}
    for p in packages:
        name = (p.get("source") or p.get("name") or "").strip()
        version = (p.get("source_version") or p.get("version") or "").strip()
        if not name or not version:
            continue
        key = (name, version)
        if key not in queries:
            queries[key] = {"package": {"name": name, "ecosystem": ecosystem}, "version": version}
    return queries


def _mark(db, inv: AgentInventory, status: str, error: Optional[str] = None, count: int = 0,
          retry_soon: bool = False) -> None:
    inv.vuln_status = status
    inv.vuln_error = error
    inv.vuln_count = count
    now = utcnow()
    # En erreur : nouvel essai dans ~1 h plutôt qu'après l'intervalle complet.
    inv.vuln_checked_at = now - timedelta(hours=max(SCAN_INTERVAL_HOURS - 1, 0)) if retry_soon else now


def scan_server(server_id: int) -> None:
    db = SessionLocal()
    try:
        inv = db.get(AgentInventory, server_id)
        if inv is None or not inv.pkg_hash:
            return

        if not inv.ecosystem:
            db.query(ServerVuln).filter(ServerVuln.server_id == server_id).delete(synchronize_session=False)
            _mark(db, inv, "unsupported",
                  "Corrélation CVE non disponible pour cet OS (supporté : Debian, Ubuntu, Alpine).")
            db.commit()
            return

        queries = build_queries(inv.packages or [], inv.ecosystem)
        if not queries:
            db.query(ServerVuln).filter(ServerVuln.server_id == server_id).delete(synchronize_session=False)
            _mark(db, inv, "ok", None, 0)
            db.commit()
            return

        keys = list(queries.keys())
        with httpx.Client(timeout=60, headers={"User-Agent": "theai-monitoring"}) as client:
            raw = osv_querybatch(client, [queries[k] for k in keys])

            # (source, version) -> {osv_id}
            hits: Dict[Tuple[str, str], Set[str]] = {}
            modified: Dict[str, str] = {}
            for key, vulns in zip(keys, raw):
                for v in vulns:
                    vid = v.get("id")
                    if not vid:
                        continue
                    hits.setdefault(key, set()).add(vid)
                    modified[vid] = v.get("modified") or ""

            cache: Dict[str, OsvCache] = {}
            ids = list(modified.keys())
            for i in range(0, len(ids), 1000):
                for row in db.query(OsvCache).filter(OsvCache.osv_id.in_(ids[i:i + 1000])).all():
                    cache[row.osv_id] = row

            need = [vid for vid in ids if vid not in cache or cache[vid].modified != modified[vid]]
            fetched: Dict[str, Optional[dict]] = {}
            if need:
                with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as pool:
                    for vid, data in pool.map(lambda x: _fetch_vuln(client, x), need):
                        fetched[vid] = data

        cves_by_id: Dict[str, List[str]] = {}
        for vid in ids:
            data = fetched.get(vid)
            if data:  # notice téléchargée
                cves = extract_cves(data)
                cves_by_id[vid] = cves
                row = cache.get(vid)
                if row is None:
                    row = OsvCache(osv_id=vid)
                    db.add(row)
                row.modified = modified[vid]
                row.cves = cves
                row.summary = (data.get("summary") or "")[:1000]
                row.fetched_at = utcnow()
            elif vid in cache:
                cves_by_id[vid] = list(cache[vid].cves or [])
            else:  # notice introuvable / indisponible : repli sur l'identifiant seul
                cves_by_id[vid] = extract_cves({"id": vid})

        found: Dict[Tuple[str, str], Tuple[str, str]] = {}
        for (source, version), osv_ids in hits.items():
            for vid in osv_ids:
                for cve in (cves_by_id.get(vid) or [vid]):
                    found[(cve, source)] = (version, vid)

        now = utcnow()
        existing = {(r.vuln_id, r.package): r
                    for r in db.query(ServerVuln).filter(ServerVuln.server_id == server_id).all()}
        for (vuln_id, package), (version, osv_id) in found.items():
            row = existing.pop((vuln_id, package), None)
            if row is None:
                db.add(ServerVuln(server_id=server_id, vuln_id=vuln_id[:64], package=package[:255],
                                  installed_version=version, osv_id=osv_id[:128],
                                  ecosystem=inv.ecosystem, first_seen=now, last_seen=now))
            else:
                row.installed_version = version
                row.osv_id = osv_id[:128]
                row.last_seen = now
        for stale in existing.values():  # corrigées depuis la dernière analyse
            db.delete(stale)

        _mark(db, inv, "ok", None, len(found))
        db.commit()
        logger.info("Analyse CVE serveur %s: %d vulnérabilités (%s)", server_id, len(found), inv.ecosystem)

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("Analyse CVE serveur %s en échec: %s", server_id, exc)
        try:
            inv = db.get(AgentInventory, server_id)
            if inv is not None:
                _mark(db, inv, "error", str(exc)[:500], inv.vuln_count or 0, retry_soon=True)
                db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
    finally:
        db.close()


def run_pending_scans() -> None:
    db = SessionLocal()
    try:
        cutoff = utcnow() - timedelta(hours=SCAN_INTERVAL_HOURS)
        ids = [r[0] for r in db.query(AgentInventory.server_id).filter(
            AgentInventory.pkg_hash.isnot(None),
            AgentInventory.ecosystem.isnot(None),
            or_(AgentInventory.vuln_checked_at.is_(None), AgentInventory.vuln_checked_at < cutoff),
        ).all()]
    finally:
        db.close()
    for sid in ids:
        scan_server(sid)


def purge_agent_metrics() -> None:
    db = SessionLocal()
    try:
        cutoff = utcnow() - timedelta(days=METRICS_RETENTION_DAYS)
        db.query(AgentMetric).filter(AgentMetric.ts < cutoff).delete(synchronize_session=False)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("Purge des métriques agent en échec: %s", exc)
    finally:
        db.close()


async def agent_jobs_loop() -> None:
    """Tâche de fond : analyses CVE en attente + purge horaire des métriques."""
    await asyncio.sleep(20)
    last_purge = 0.0
    while True:
        try:
            if OSV_ENABLED:
                await asyncio.to_thread(run_pending_scans)
            if time.time() - last_purge > 3600:
                await asyncio.to_thread(purge_agent_metrics)
                last_purge = time.time()
        except Exception as exc:  # noqa: BLE001
            logger.error("Erreur dans la boucle des tâches agent: %s", exc)
        await asyncio.sleep(120)


def start_agent_jobs() -> None:
    logger.info("Starting agent background jobs (OSV enabled: %s)", OSV_ENABLED)
    asyncio.create_task(agent_jobs_loop())


# Utilisé par les routes : requête SQL de lecture enrichie (sans caractère pourcent).
VULNS_SQL = """
SELECT v.server_id, s.name AS server_name, v.vuln_id, v.package, v.installed_version,
       v.osv_id, v.first_seen,
       COALESCE(e.kev, false) AS kev, e.kev_due_date, e.kev_ransomware,
       e.epss_score, e.epss_percentile, e.cvss_base, e.severity,
       left(e.description, 300) AS description
FROM server_vulns v
JOIN servers s ON s.id = v.server_id
LEFT JOIN cve.entries e ON e.cve_id = v.vuln_id
{where}
ORDER BY COALESCE(e.kev, false) DESC,
         e.epss_score DESC NULLS LAST,
         e.cvss_base DESC NULLS LAST,
         v.vuln_id
LIMIT :lim OFFSET :off
"""

VULNS_COUNT_SQL = """
SELECT count(*) AS total,
       count(*) FILTER (WHERE COALESCE(e.kev, false)) AS kev
FROM server_vulns v
LEFT JOIN cve.entries e ON e.cve_id = v.vuln_id
{where}
"""
