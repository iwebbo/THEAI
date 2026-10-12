from typing import Optional

import httpx

from core.config import settings


def _client() -> httpx.Client:
    auth = (settings.OPENSEARCH_USER, settings.OPENSEARCH_PASSWORD) if settings.OPENSEARCH_USER else None
    return httpx.Client(
        base_url=settings.OPENSEARCH_URL.rstrip("/"),
        auth=auth,
        verify=settings.OPENSEARCH_VERIFY_TLS,
        timeout=15.0,
    )


def get_stats() -> dict:
    """Compteurs globaux du referentiel CVE + derniere ingestion reussie."""
    index = settings.CVE_INDEX
    body = {
        "size": 0,
        "track_total_hits": True,
        "query": {"term": {"category": "cve"}},
        "aggs": {
            "by_severity": {"terms": {"field": "severity", "size": 10}},
            "kev": {"filter": {"term": {"kev": True}}},
            "epss_high": {"filter": {"range": {"epss_score": {"gte": 0.1}}}},
            "critical_recent": {"filter": {"bool": {"filter": [
                {"range": {"cvss_base": {"gte": 9}}},
                {"range": {"published": {"gte": "now-30d"}}},
            ]}}},
        },
    }
    last_run_body = {
        "size": 1,
        "query": {"bool": {"filter": [
            {"term": {"type": "ingest_run"}},
            {"term": {"success": True}},
        ]}},
        "sort": [{"timestamp": "desc"}],
        "_source": ["timestamp", "mode", "duration_s"],
    }

    with _client() as c:
        r = c.post(f"/{index}/_search", json=body)
        if r.status_code == 404:  # index pas encore cree (bootstrap en cours)
            return {"ready": False, "total": 0, "by_severity": {}, "kev": 0,
                    "epss_high": 0, "critical_recent": 0, "last_ingest": None}
        r.raise_for_status()
        data = r.json()

        last = None
        lr = c.post(f"/{index}/_search", json=last_run_body)
        if lr.status_code == 200:
            hits = lr.json()["hits"]["hits"]
            last = hits[0]["_source"] if hits else None

    aggs = data["aggregations"]
    return {
        "ready": True,
        "total": data["hits"]["total"]["value"],
        "by_severity": {b["key"]: b["doc_count"] for b in aggs["by_severity"]["buckets"]},
        "kev": aggs["kev"]["doc_count"],
        "epss_high": aggs["epss_high"]["doc_count"],
        "critical_recent": aggs["critical_recent"]["doc_count"],
        "last_ingest": last,
    }


def search_cve(
    q: Optional[str],
    severity: Optional[str],
    kev: Optional[bool],
    min_epss: Optional[float],
    sort: str,
    size: int,
    offset: int,
) -> dict:
    filters = [{"term": {"category": "cve"}}]
    if severity:
        filters.append({"term": {"severity": severity.lower()}})
    if kev:
        filters.append({"term": {"kev": True}})
    if min_epss is not None:
        filters.append({"range": {"epss_score": {"gte": min_epss}}})

    must = []
    if q and q.strip():
        term = q.strip()
        must.append({"bool": {"should": [
            {"term": {"cve_id": term.upper()}},
            {"term": {"products": term.lower()}},
            {"term": {"vendors": term.lower()}},
            {"match": {"description": term}},
        ], "minimum_should_match": 1}})

    body = {
        "from": offset,
        "size": size,
        "track_total_hits": True,
        "query": {"bool": {"filter": filters, "must": must}},
        "sort": [{sort: {"order": "desc", "missing": "_last"}}],
        "_source": {"excludes": ["affected", "refs", "cvss_vector", "category", "type"]},
    }

    with _client() as c:
        r = c.post(f"/{settings.CVE_INDEX}/_search", json=body)
        if r.status_code == 404:
            return {"total": 0, "items": []}
        r.raise_for_status()
        data = r.json()

    return {
        "total": data["hits"]["total"]["value"],
        "items": [h["_source"] for h in data["hits"]["hits"]],
    }
