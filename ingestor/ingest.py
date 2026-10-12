#!/usr/bin/env python3
"""
THEAI - Ingestion CVE (NVD) + KEV (CISA) + EPSS (FIRST) vers PostgreSQL (schema `cve`).

Le schema est cree par le backend au demarrage (backend/app/sql/cve_schema.sql) ;
l'ingestor attend qu'il existe. Toute la configuration passe par des variables
d'environnement (memes noms que le backend : POSTGRES_*, SMTP_*, ...).

Modes :
  serve      boucle de fond (Docker) : bootstrap si aucun curseur, puis daily a heure fixe
  auto       bootstrap si aucun curseur, sinon daily (CronJob Kubernetes)
  bootstrap  tout NVD + KEV + EPSS
  daily      delta NVD + KEV + EPSS
  delta | kev | epss | init | stats
"""
import csv
import gzip
import io
import json
import os
import smtplib
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import psycopg2
import requests
from psycopg2.extras import execute_values


def env_bool(name, default):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")


# --------------------------------------------------------------------------- #
#  CONFIG
# --------------------------------------------------------------------------- #
PG = dict(
    host=os.getenv("POSTGRES_SERVER", "db"),
    port=int(os.getenv("POSTGRES_PORT", "5432")),
    dbname=os.getenv("POSTGRES_DB", "server_monitoring"),
    user=os.getenv("POSTGRES_USER", "postgres"),
    password=os.getenv("POSTGRES_PASSWORD", "postgres"),
)
SCHEMA_WAIT_SECONDS = int(os.getenv("SCHEMA_WAIT_SECONDS", "900"))

# Cle NVD gratuite : https://nvd.nist.gov/developers/request-an-api-key
# Sans cle : 6,5 s entre requetes, le bootstrap passe de ~3 a ~20 minutes.
NVD_API_KEY = os.getenv("NVD_API_KEY", "")
NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
EPSS_URL = "https://epss.cyentia.com/epss_scores-current.csv.gz"

PAGE_SIZE = 2000          # maximum autorise par NVD
RATE_DELAY = 0.7 if NVD_API_KEY else 6.5
BULK_SIZE = 500
DELTA_LOOKBACK = 7        # jours, si aucun curseur n'est trouve
MAX_WINDOW_DAYS = 120     # contrainte NVD sur lastModStartDate/EndDate
INGEST_DAILY_HOUR_UTC = int(os.getenv("INGEST_DAILY_HOUR_UTC", "3"))


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------- #
#  NOTIFICATION EMAIL (memes variables que le backend THEAI)
# --------------------------------------------------------------------------- #
def notify(subject, body):
    if not env_bool("ENABLE_EMAIL_ALERTS", False):
        return
    server = os.getenv("SMTP_SERVER")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM_EMAIL") or username
    recipients = [e.strip() for e in os.getenv("ALERT_EMAILS", "").split(",") if e.strip()]
    if not (server and username and password and recipients):
        return

    try:
        msg = MIMEMultipart()
        msg["From"] = sender
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(server, int(os.getenv("SMTP_PORT", "587")), timeout=30) as s:
            if env_bool("SMTP_USE_TLS", True):
                s.starttls()
            s.login(username, password)
            s.sendmail(sender, recipients, msg.as_string())
        print("Email envoye")
    except Exception as e:
        print(f"Echec envoi email : {e}")


# --------------------------------------------------------------------------- #
#  POSTGRES
# --------------------------------------------------------------------------- #
@contextmanager
def db():
    """Connexion courte : commit a la sortie, rollback sur erreur, fermeture dans tous les cas."""
    conn = psycopg2.connect(connect_timeout=10, options="-c timezone=UTC", **PG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def wait_for_schema(max_wait=None):
    """Attend que Postgres soit joignable et que le schema `cve` existe (cree par le backend)."""
    deadline = time.time() + (SCHEMA_WAIT_SECONDS if max_wait is None else max_wait)
    last = None
    while True:
        try:
            with db() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT to_regclass('cve.entries') IS NOT NULL"
                    " AND to_regclass('cve.sync_state') IS NOT NULL"
                    " AND to_regclass('cve.ingest_runs') IS NOT NULL"
                )
                if cur.fetchone()[0]:
                    return
                last = "schema cve absent (cree par le backend au demarrage)"
        except Exception as e:
            last = str(e).strip()[:200]
        if time.time() >= deadline:
            raise RuntimeError(f"Base CVE indisponible : {last}")
        print(f"En attente de la base / du schema cve... ({last})")
        time.sleep(5)


def get_cursor():
    """Curseur NVD (derniere modification ingeree) : stocke en base, aucun etat local."""
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT cursor_ts FROM cve.sync_state WHERE name = 'nvd'")
        row = cur.fetchone()
    return row[0] if row else None


def save_cursor(cursor, mode, indexed):
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO cve.sync_state (name, cursor_ts, mode, indexed, updated_at)"
            " VALUES ('nvd', %s, %s, %s, now())"
            " ON CONFLICT (name) DO UPDATE SET cursor_ts = EXCLUDED.cursor_ts,"
            " mode = EXCLUDED.mode, indexed = EXCLUDED.indexed, updated_at = now()",
            (cursor, mode, indexed),
        )


UPSERT_SQL = """
INSERT INTO cve.entries (
    cve_id, published, last_modified, description, cvss_base, severity,
    cvss_vector, attack_vector, cwe, vendors, products, refs, affected
) VALUES %s
ON CONFLICT (cve_id) DO UPDATE SET
    published     = EXCLUDED.published,
    last_modified = EXCLUDED.last_modified,
    description   = EXCLUDED.description,
    cvss_base     = EXCLUDED.cvss_base,
    severity      = EXCLUDED.severity,
    cvss_vector   = EXCLUDED.cvss_vector,
    attack_vector = EXCLUDED.attack_vector,
    cwe           = EXCLUDED.cwe,
    vendors       = EXCLUDED.vendors,
    products      = EXCLUDED.products,
    refs          = EXCLUDED.refs,
    affected      = EXCLUDED.affected,
    updated_at    = now()
"""
# Les colonnes KEV et EPSS ne sont volontairement pas dans le DO UPDATE :
# une CVE re-livree par NVD conserve ses indicateurs KEV / EPSS.
UPSERT_TEMPLATE = (
    "(%s, %s::timestamptz, %s::timestamptz, %s, %s::numeric, %s, %s, %s,"
    " %s::text[], %s::text[], %s::text[], %s::text[], %s::jsonb)"
)


def upsert_batch(conn, docs):
    """Upsert idempotent d'un lot (dict cve_id -> doc, deja deduplique). Commit inclus."""
    rows = [
        (
            d["cve_id"], d["published"], d["last_modified"], d["description"], d["cvss_base"],
            d["severity"], d["cvss_vector"], d["attack_vector"], d["cwe"], d["vendors"],
            d["products"], d["refs"], json.dumps(d["affected"], ensure_ascii=False),
        )
        for d in docs.values()
    ]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, rows, template=UPSERT_TEMPLATE, page_size=BULK_SIZE)
    conn.commit()
    return len(rows)


# --------------------------------------------------------------------------- #
#  SOURCES
# --------------------------------------------------------------------------- #
def nvd_get(params, retries=5):
    """Limites NVD : 5 req/30s sans cle, 50 req/30s avec. Les depasser fait bannir l'IP."""
    headers = {"User-Agent": "theai-cve-ingestor/1.0"}
    if NVD_API_KEY:
        headers["apiKey"] = NVD_API_KEY

    delay = 3
    for _ in range(retries):
        try:
            r = requests.get(NVD_URL, params=params, headers=headers, timeout=90)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (403, 429, 502, 503, 504):
                print(f"  NVD HTTP {r.status_code}, pause {delay}s...")
                time.sleep(delay)
                delay = min(delay * 2, 120)
                continue
            print(f"  NVD HTTP {r.status_code} - {r.text[:300]}")
            return {}
        except Exception as e:
            print(f"  NVD {e}, pause {delay}s...")
            time.sleep(delay)
            delay = min(delay * 2, 120)
    return {}


def parse_cpe(criteria):
    """cpe:2.3:part:vendor:product:version:..."""
    parts = criteria.split(":") if criteria else []

    def g(i):
        v = parts[i] if i < len(parts) else ""
        return None if v in ("*", "-", "") else v.lower()

    return g(3), g(4), g(5)


def normalize(raw):
    """Entree NVD -> document plat."""
    cve_id = raw.get("id", "")

    description = ""
    for d in raw.get("descriptions") or []:
        if d.get("lang") == "en":
            description = d.get("value", "")
            break

    # CVSS : v4.0 > v3.1 > v3.0 > v2, source primaire en priorite
    cvss_base = severity = vector = attack_vector = None
    metrics = raw.get("metrics") or {}
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key) or []
        if not entries:
            continue
        entry = next((e for e in entries if e.get("type") == "Primary"), entries[0])
        data = entry.get("cvssData") or {}
        cvss_base = data.get("baseScore")
        severity = (data.get("baseSeverity") or entry.get("baseSeverity") or "").lower() or None
        vector = data.get("vectorString")
        attack_vector = (data.get("attackVector") or data.get("accessVector") or "").upper() or None
        break

    cwe = []
    for w in raw.get("weaknesses") or []:
        for d in w.get("description") or []:
            v = d.get("value", "")
            if v.startswith("CWE-") and v not in cwe:
                cwe.append(v)

    affected, seen = [], set()
    for config in raw.get("configurations") or []:
        for node in config.get("nodes") or []:
            for m in node.get("cpeMatch") or []:
                # vulnerable=false : condition d'environnement, pas une cible (faux positifs)
                if not m.get("vulnerable"):
                    continue
                vendor, product, version = parse_cpe(m.get("criteria", ""))
                if not product:
                    continue
                start = m.get("versionStartIncluding") or m.get("versionStartExcluding")
                end = m.get("versionEndIncluding") or m.get("versionEndExcluding")
                key = (vendor, product, version, start, end)
                if key in seen:
                    continue
                seen.add(key)
                affected.append({
                    "vendor": vendor or "",
                    "product": product,
                    "exact_version": version,
                    "version_start": start,
                    "version_end": end,
                })

    products = sorted({a["product"] for a in affected})
    vendors = sorted({a["vendor"] for a in affected if a["vendor"]})

    return {
        "cve_id": cve_id,
        "published": raw.get("published"),
        "last_modified": raw.get("lastModified"),
        "description": description[:4000].replace("\x00", ""),
        "cvss_base": cvss_base,
        "severity": severity,
        "cvss_vector": vector,
        "attack_vector": attack_vector,
        "cwe": cwe,
        "refs": [r["url"] for r in (raw.get("references") or [])[:10] if r.get("url")],
        "products": products,
        "vendors": vendors,
        "affected": affected[:200],
    }


def sync_nvd(mode="delta"):
    """'bootstrap' (tout NVD, ~155 requetes) ou 'delta' (depuis le curseur)."""
    stats = {"fetched": 0, "indexed": 0, "api_requests": 0, "cursor": None}
    started = time.time()

    windows = []
    if mode == "bootstrap":
        windows = [{}]
    else:
        cursor = get_cursor()
        if cursor:
            # Recouvrement de 2h : NVD republie parfois avec un leger retard
            start = cursor.astimezone(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
        else:
            start = utcnow() - timedelta(days=DELTA_LOOKBACK)
            print(f"  Aucun curseur, repli sur {DELTA_LOOKBACK} jours")
        end = utcnow()
        while start < end:
            w_end = min(start + timedelta(days=MAX_WINDOW_DAYS), end)
            windows.append({
                "lastModStartDate": start.strftime("%Y-%m-%dT%H:%M:%S.000") + "+00:00",
                "lastModEndDate": w_end.strftime("%Y-%m-%dT%H:%M:%S.000") + "+00:00",
            })
            start = w_end

    max_modified = None
    batch = {}

    with db() as conn:
        for win in windows:
            start_index, total = 0, None
            while True:
                payload = nvd_get(dict(win, startIndex=start_index, resultsPerPage=PAGE_SIZE))
                stats["api_requests"] += 1
                if not payload:
                    # Echec apres retries : on remonte l'erreur plutot que d'avancer le curseur
                    raise RuntimeError("NVD indisponible (reponse vide apres retries)")

                if total is None:
                    total = payload.get("totalResults", 0)
                    print(f"  {total} resultats a traiter")

                vulns = payload.get("vulnerabilities") or []
                for item in vulns:
                    raw = item.get("cve")
                    if not raw:
                        continue
                    stats["fetched"] += 1
                    doc = normalize(raw)

                    lm = doc["last_modified"]
                    if lm and (max_modified is None or lm > max_modified):
                        max_modified = lm

                    # Dedoublonnage dans le lot : une meme CVE ne peut pas etre upsertee deux fois
                    # dans la meme commande SQL (pagination NVD qui bouge pendant l'ingestion).
                    batch[doc["cve_id"]] = doc
                    if len(batch) >= BULK_SIZE:
                        stats["indexed"] += upsert_batch(conn, batch)
                        batch = {}

                if stats["api_requests"] % 10 == 0:
                    print(f"  {stats['fetched']}/{total} en {int(time.time() - started)}s")

                start_index += len(vulns)
                if not vulns or start_index >= (total or 0):
                    break
                time.sleep(RATE_DELAY)

        if batch:
            stats["indexed"] += upsert_batch(conn, batch)

    if max_modified:
        stats["cursor"] = max_modified
        save_cursor(max_modified, mode, stats["indexed"])

    stats["duration_s"] = round(time.time() - started, 1)
    print(f"  NVD {mode} : {stats['indexed']} CVE en {stats['duration_s']}s")
    return stats


def sync_kev():
    """
    Catalogue CISA des vulnerabilites activement exploitees (~1300 entrees).
    Mises a jour uniquement : une CVE absente de la base sera marquee au passage suivant.
    """
    started = time.time()
    r = requests.get(KEV_URL, timeout=120)
    r.raise_for_status()
    entries = [e for e in r.json().get("vulnerabilities", []) if e.get("cveID")]
    if not entries:
        raise RuntimeError("Flux KEV vide")

    ids = [e["cveID"] for e in entries]
    rows = [
        (
            e["cveID"],
            e.get("dateAdded") or None,
            e.get("dueDate") or None,
            str(e.get("knownRansomwareCampaignUse", "")).lower() == "known",
            e.get("requiredAction"),
        )
        for e in entries
    ]

    with db() as conn, conn.cursor() as cur:
        # Sortie du catalogue (rare, mais CISA reevalue)
        cur.execute(
            "UPDATE cve.entries SET kev = false, kev_ransomware = false,"
            " kev_date_added = NULL, kev_due_date = NULL, kev_action = NULL"
            " WHERE kev AND NOT (cve_id = ANY(%s::text[]))",
            (ids,),
        )
        execute_values(
            cur,
            "UPDATE cve.entries e SET kev = true, kev_date_added = v.date_added::date,"
            " kev_due_date = v.due_date::date, kev_ransomware = v.ransomware,"
            " kev_action = v.action, updated_at = now()"
            " FROM (VALUES %s) AS v(cve_id, date_added, due_date, ransomware, action)"
            " WHERE e.cve_id = v.cve_id",
            rows,
            template="(%s, %s, %s, %s::boolean, %s)",
            page_size=len(rows) + 1,
        )
        updated = cur.rowcount

    missing = len(entries) - updated
    print(f"  KEV : {updated} mises a jour, {missing} absentes du referentiel")
    return {"fetched": len(entries), "indexed": updated, "missing": missing,
            "duration_s": round(time.time() - started, 1)}


def sync_epss():
    """
    Scores EPSS (probabilite d'exploitation a 30 jours). ~310k lignes chargees par COPY dans une
    table temporaire, puis un seul UPDATE qui ne touche que les lignes dont la valeur change.
    """
    started = time.time()
    r = requests.get(EPSS_URL, timeout=180)
    r.raise_for_status()

    stream = io.StringIO(gzip.decompress(r.content).decode("utf-8", errors="replace"))
    first = stream.readline()
    if not first.startswith("#"):
        stream.seek(0)

    buf = io.StringIO()
    writer = csv.writer(buf)
    fetched = 0
    for row in csv.DictReader(stream):
        cid = (row.get("cve") or "").strip()
        if not cid.startswith("CVE-"):
            continue
        try:
            float(row.get("epss") or 0)
            float(row.get("percentile") or 0)
        except ValueError:
            continue
        writer.writerow((cid, row.get("epss") or 0, row.get("percentile") or 0))
        fetched += 1

    if fetched == 0:
        raise RuntimeError("Flux EPSS vide")
    buf.seek(0)

    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE epss_tmp (cve_id text, epss numeric(6,5), pct numeric(6,5))"
            " ON COMMIT DROP"
        )
        cur.copy_expert("COPY epss_tmp (cve_id, epss, pct) FROM STDIN WITH (FORMAT csv)", buf)
        cur.execute(
            "UPDATE cve.entries e SET epss_score = t.epss, epss_percentile = t.pct, updated_at = now()"
            " FROM epss_tmp t WHERE e.cve_id = t.cve_id"
            " AND (e.epss_score IS DISTINCT FROM t.epss OR e.epss_percentile IS DISTINCT FROM t.pct)"
        )
        updated = cur.rowcount

    print(f"  EPSS : {updated} lignes modifiees sur {fetched} scores")
    return {"fetched": fetched, "indexed": updated,
            "duration_s": round(time.time() - started, 1)}


# --------------------------------------------------------------------------- #
#  STATS
# --------------------------------------------------------------------------- #
def get_stats():
    out = {}
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT count(*),"
                " count(*) FILTER (WHERE kev),"
                " count(*) FILTER (WHERE epss_score >= 0.1),"
                " count(*) FILTER (WHERE cvss_base >= 9 AND published >= now() - interval '30 days'),"
                " pg_total_relation_size('cve.entries')"
                " FROM cve.entries"
            )
            total, kev, epss_high, critical_recent, size_bytes = cur.fetchone()
            cur.execute(
                "SELECT severity, count(*) FROM cve.entries"
                " WHERE severity IS NOT NULL GROUP BY severity"
            )
            by_severity = {sev: n for sev, n in cur.fetchall()}
        out.update(
            total=total, kev=kev, epss_high=epss_high, critical_recent=critical_recent,
            by_severity=by_severity, size_mb=round(size_bytes / 1024 / 1024, 1),
        )
    except Exception as e:
        out["error"] = str(e)[:200]
    return out


def record_run(mode, success, duration, steps=None, stats=None, error=None):
    """Une ligne par execution : alimente les panneaux de fraicheur Grafana."""
    steps = steps or {}
    stats = stats or {}
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cve.ingest_runs (mode, success, duration_s, fetched, indexed,"
                " api_requests, cursor_ts, total_cve, kev_count, size_mb, error)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    mode, success, duration,
                    sum(s.get("fetched", 0) for s in steps.values()),
                    sum(s.get("indexed", 0) for s in steps.values()),
                    steps.get("nvd", {}).get("api_requests", 0),
                    steps.get("nvd", {}).get("cursor"),
                    stats.get("total"), stats.get("kev"), stats.get("size_mb"),
                    error[:1000] if error else None,
                ),
            )
            cur.execute("DELETE FROM cve.ingest_runs WHERE run_at < now() - interval '1 year'")
    except Exception as e:
        print(f"Impossible d'enregistrer l'execution : {e}")


# --------------------------------------------------------------------------- #
#  RUN
# --------------------------------------------------------------------------- #
def run_sync(mode):
    started = time.time()
    date_str = datetime.now().strftime("%d/%m/%Y a %H:%M")

    try:
        wait_for_schema()
        if mode == "auto":
            mode = "daily" if get_cursor() else "bootstrap"
    except Exception as e:
        print(f"Erreur avant synchro : {e}")
        notify("THEAI - Ingestion CVE - ECHEC",
               f"Ingestion CVE ECHOUEE\n\n- Date: {date_str}\n- Mode: {mode}\n- Erreur: {e}")
        return 1

    print(f"Ingestion CVE ({mode}) vers PostgreSQL...")

    plans = {
        "bootstrap": [("nvd", lambda: sync_nvd("bootstrap")), ("kev", sync_kev), ("epss", sync_epss)],
        "delta": [("nvd", lambda: sync_nvd("delta"))],
        "kev": [("kev", sync_kev)],
        "epss": [("epss", sync_epss)],
        # NVD d'abord : KEV et EPSS ne font que des mises a jour de CVE deja presentes
        "daily": [("nvd", lambda: sync_nvd("delta")), ("kev", sync_kev), ("epss", sync_epss)],
    }

    steps, errors = {}, []
    for name, fn in plans[mode]:
        try:
            steps[name] = fn()
        except Exception as e:
            print(f"Erreur etape {name} : {e}")
            errors.append(f"{name}: {e}")
            if mode == "bootstrap" and name == "nvd":
                break  # sans CVE en base, KEV et EPSS n'ont rien a mettre a jour

    stats = get_stats()
    duration = round(time.time() - started, 1)

    if errors:
        record_run(mode, False, duration, steps, stats, "; ".join(errors))
        notify(f"THEAI - Ingestion CVE ({mode}) - ECHEC",
               f"Ingestion CVE ECHOUEE\n\n- Date: {date_str}\n- Mode: {mode}\n- Duree: {duration}s\n"
               f"- Erreurs:\n" + "\n".join("  - " + e for e in errors))
        return 1

    record_run(mode, True, duration, steps, stats)
    print("Ingestion terminee.")

    sev = stats.get("by_severity", {})
    fetched = sum(s.get("fetched", 0) for s in steps.values())
    indexed = sum(s.get("indexed", 0) for s in steps.values())
    body = f"""Ingestion CVE terminee.

- Date: {date_str}
- Mode: {mode}
- Duree: {duration}s

Cette execution:
- Elements recuperes: {fetched}
- Lignes ecrites: {indexed}
- Requetes API NVD: {steps.get('nvd', {}).get('api_requests', 0)}
- Curseur: {steps.get('nvd', {}).get('cursor') or 'inchange'}

Etat du referentiel:
- Total CVE: {stats.get('total')}
- Taille table: {stats.get('size_mb')} Mo
- KEV (exploitees dans la nature): {stats.get('kev')}
- EPSS >= 0.10: {stats.get('epss_high')}
- Critiques publiees sous 30j: {stats.get('critical_recent')}
- Par severite: critical={sev.get('critical', 0)}, high={sev.get('high', 0)}, medium={sev.get('medium', 0)}, low={sev.get('low', 0)}"""
    notify(f"THEAI - Ingestion CVE ({mode}) - Succes", body)
    return 0


def serve():
    """Boucle de fond (remplace le crontab) : bootstrap initial, puis daily a heure fixe UTC."""
    wait_for_schema()

    while not get_cursor():
        print("Aucun curseur : bootstrap initial")
        if run_sync("bootstrap") != 0:
            print("Bootstrap en echec, nouvel essai dans 1h")
            time.sleep(3600)

    while True:
        now = utcnow()
        nxt = now.replace(hour=INGEST_DAILY_HOUR_UTC, minute=0, second=0, microsecond=0)
        if nxt <= now:
            nxt += timedelta(days=1)
        print(f"Prochaine ingestion : {nxt.isoformat()} UTC")
        time.sleep((nxt - now).total_seconds())
        run_sync("auto")


MODES = ("serve", "auto", "init", "bootstrap", "delta", "kev", "epss", "daily", "stats")

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "daily"
    if mode not in MODES:
        print(f"Usage: {sys.argv[0]} [{'|'.join(MODES)}]")
        sys.exit(2)

    if mode == "serve":
        serve()
    elif mode == "stats":
        print(json.dumps(get_stats(), indent=2, ensure_ascii=False))
    elif mode == "init":
        try:
            wait_for_schema()
            print("Schema cve OK")
        except RuntimeError as e:
            print(e)
            sys.exit(1)
    else:
        sys.exit(run_sync(mode))
