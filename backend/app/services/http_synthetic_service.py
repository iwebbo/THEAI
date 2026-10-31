"""
HTTP/HTTPS synthetic monitoring.

Collecte pour une URL :
  - timings (DNS, TCP, TLS, TTFB, total), statut HTTP, redirections, version HTTP
  - paramètres TLS négociés (version, cipher, ALPN) + support TLS 1.0 → 1.3
  - certificat serveur complet (sujet, émetteur, SAN, clé, signature, extensions, empreintes...)
  - chaîne envoyée par le serveur, validation de confiance, correspondance hostname
  - en-têtes de sécurité (HSTS, CSP, ...)

Dépendance : cryptography >= 42
"""
import asyncio
import ipaddress
import math
import socket
import ssl
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

import httpx
from cryptography import x509
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import dsa, ec, ed448, ed25519, rsa
from cryptography.x509.oid import AuthorityInformationAccessOID

USER_AGENT = "THEAI-Synthetic/1.0"
MAX_BODY_BYTES = 1_000_000
CERT_WARN_DAYS = 30

_TLS_VERSIONS = [
    ("TLSv1.0", ssl.TLSVersion.TLSv1),
    ("TLSv1.1", ssl.TLSVersion.TLSv1_1),
    ("TLSv1.2", ssl.TLSVersion.TLSv1_2),
    ("TLSv1.3", ssl.TLSVersion.TLSv1_3),
]
_SECURITY_HEADERS = [
    "strict-transport-security", "content-security-policy", "x-frame-options",
    "x-content-type-options", "referrer-policy", "permissions-policy",
]
_POLICY_LEVELS = {
    "2.23.140.1.1": "EV", "2.23.140.1.2.1": "DV",
    "2.23.140.1.2.2": "OV", "2.23.140.1.2.3": "IV",
}


# --------------------------------------------------------------------------- #
# Helpers certificat
# --------------------------------------------------------------------------- #
def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _oid_name(oid) -> str:
    return getattr(oid, "_name", None) or oid.dotted_string


def _fmt_name(name: x509.Name) -> Dict[str, Any]:
    attrs: Dict[str, Any] = {}
    for a in name:
        key = _oid_name(a.oid)
        if key in attrs:
            if not isinstance(attrs[key], list):
                attrs[key] = [attrs[key]]
            attrs[key].append(a.value)
        else:
            attrs[key] = a.value
    return {"rfc4514": name.rfc4514_string(), "attributes": attrs}


def _cn(name: x509.Name) -> Optional[str]:
    vals = name.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
    return vals[0].value if vals else None


def _ext(cert: x509.Certificate, cls):
    try:
        return cert.extensions.get_extension_for_class(cls).value
    except Exception:
        return None


def _colon_hex(b: bytes) -> str:
    return ":".join(f"{x:02X}" for x in b)


def _public_key_info(cert: x509.Certificate) -> Dict[str, Any]:
    key = cert.public_key()
    if isinstance(key, rsa.RSAPublicKey):
        return {"type": "RSA", "size": key.key_size, "exponent": key.public_numbers().e}
    if isinstance(key, ec.EllipticCurvePublicKey):
        return {"type": "EC", "size": key.curve.key_size, "curve": key.curve.name}
    if isinstance(key, ed25519.Ed25519PublicKey):
        return {"type": "Ed25519", "size": 256}
    if isinstance(key, ed448.Ed448PublicKey):
        return {"type": "Ed448", "size": 456}
    if isinstance(key, dsa.DSAPublicKey):
        return {"type": "DSA", "size": key.key_size}
    return {"type": type(key).__name__, "size": None}


def _host_matches(host: str, dns_names: List[str], ips: List[str], cn: Optional[str]) -> bool:
    if _is_ip(host):
        return str(ipaddress.ip_address(host)) in ips
    h = host.lower().rstrip(".")
    names = dns_names or ([cn] if cn else [])  # CN uniquement si pas de SAN (legacy)
    for n in names:
        n = n.lower().rstrip(".")
        if n == h:
            return True
        if n.startswith("*.") and "." in h:
            left, rest = h.split(".", 1)
            if left and rest == n[2:]:
                return True
    return False


def parse_certificate(der: bytes, host: Optional[str] = None) -> Dict[str, Any]:
    cert = x509.load_der_x509_certificate(der)
    now = datetime.now(timezone.utc)
    nb, na = cert.not_valid_before_utc, cert.not_valid_after_utc
    days_remaining = math.floor((na - now).total_seconds() / 86400)

    try:
        sig_hash = cert.signature_hash_algorithm.name if cert.signature_hash_algorithm else None
    except UnsupportedAlgorithm:
        sig_hash = None

    san = _ext(cert, x509.SubjectAlternativeName)
    dns_names = san.get_values_for_type(x509.DNSName) if san else []
    ips = [str(i) for i in san.get_values_for_type(x509.IPAddress)] if san else []
    emails = san.get_values_for_type(x509.RFC822Name) if san else []
    uris = san.get_values_for_type(x509.UniformResourceIdentifier) if san else []

    ku = _ext(cert, x509.KeyUsage)
    key_usage = None
    if ku:
        key_usage = [n for n in ("digital_signature", "content_commitment", "key_encipherment",
                                 "data_encipherment", "key_agreement", "key_cert_sign", "crl_sign")
                     if getattr(ku, n)]
        if ku.key_agreement:
            key_usage += [n for n in ("encipher_only", "decipher_only") if getattr(ku, n)]

    eku = _ext(cert, x509.ExtendedKeyUsage)
    bc = _ext(cert, x509.BasicConstraints)
    ski = _ext(cert, x509.SubjectKeyIdentifier)
    aki = _ext(cert, x509.AuthorityKeyIdentifier)
    aia = _ext(cert, x509.AuthorityInformationAccess)
    crl = _ext(cert, x509.CRLDistributionPoints)
    sct = _ext(cert, x509.PrecertificateSignedCertificateTimestamps)
    tls_feature = _ext(cert, x509.TLSFeature)
    policies = _ext(cert, x509.CertificatePolicies)

    ocsp, ca_issuers = [], []
    if aia:
        for d in aia:
            if d.access_method == AuthorityInformationAccessOID.OCSP:
                ocsp.append(d.access_location.value)
            elif d.access_method == AuthorityInformationAccessOID.CA_ISSUERS:
                ca_issuers.append(d.access_location.value)

    crl_urls = []
    if crl:
        for dp in crl:
            for n in (dp.full_name or []):
                crl_urls.append(getattr(n, "value", str(n)))

    policy_oids = [p.policy_identifier.dotted_string for p in policies] if policies else []
    validation_level = next((_POLICY_LEVELS[o] for o in policy_oids if o in _POLICY_LEVELS), None)

    cn = _cn(cert.subject)
    info: Dict[str, Any] = {
        "version": cert.version.name,
        "serial_number": f"{cert.serial_number:X}",
        "subject": _fmt_name(cert.subject),
        "issuer": _fmt_name(cert.issuer),
        "subject_cn": cn,
        "issuer_cn": _cn(cert.issuer),
        "not_before": nb.isoformat(),
        "not_after": na.isoformat(),
        "validity_days": (na - nb).days,
        "days_remaining": days_remaining,
        "expired": now > na,
        "not_yet_valid": now < nb,
        "self_signed": cert.subject == cert.issuer,
        "signature_algorithm": _oid_name(cert.signature_algorithm_oid),
        "signature_hash": sig_hash,
        "public_key": _public_key_info(cert),
        "fingerprint_sha256": _colon_hex(cert.fingerprint(hashes.SHA256())),
        "fingerprint_sha1": _colon_hex(cert.fingerprint(hashes.SHA1())),  # nosec - affichage uniquement
        "san": {"dns": dns_names, "ip": ips, "email": emails, "uri": uris},
        "key_usage": key_usage,
        "extended_key_usage": [_oid_name(o) for o in eku] if eku else None,
        "basic_constraints": {"ca": bc.ca, "path_length": bc.path_length} if bc else None,
        "is_ca": bool(bc.ca) if bc else False,
        "subject_key_id": ski.digest.hex(":") if ski else None,
        "authority_key_id": aki.key_identifier.hex(":") if aki and aki.key_identifier else None,
        "ocsp_urls": ocsp,
        "ca_issuers_urls": ca_issuers,
        "crl_urls": crl_urls,
        "ocsp_must_staple": bool(tls_feature and x509.TLSFeatureType.status_request in tls_feature),
        "sct_count": len(sct) if sct else 0,
        "policy_oids": policy_oids,
        "validation_level": validation_level,
        "extensions": [{"oid": e.oid.dotted_string, "name": _oid_name(e.oid), "critical": e.critical}
                       for e in cert.extensions],
    }
    if host:
        info["hostname_match"] = _host_matches(host, dns_names, ips, cn)
    return info


# --------------------------------------------------------------------------- #
# Sondes réseau (synchrones, exécutées via asyncio.to_thread)
# --------------------------------------------------------------------------- #
def _chain_der(ssock: ssl.SSLSocket) -> List[bytes]:
    getters = (getattr(ssock, "get_unverified_chain", None),
               getattr(getattr(ssock, "_sslobj", None), "get_unverified_chain", None))
    for getter in getters:
        if not getter:
            continue
        try:
            out = []
            for c in getter() or []:
                out.append(c if isinstance(c, bytes) else ssl.PEM_cert_to_DER_cert(c.public_bytes()))
            if out:
                return out
        except Exception:
            continue
    return []


def _tls_probe(host: str, port: int, timeout: int) -> Dict[str, Any]:
    t0 = time.perf_counter()
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    dns_ms = (time.perf_counter() - t0) * 1000
    family, _, _, _, sockaddr = infos[0]
    ip = sockaddr[0]

    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        t1 = time.perf_counter()
        sock.connect(sockaddr)
        tcp_ms = (time.perf_counter() - t1) * 1000

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # on veut le certificat même s'il est invalide
        ctx.set_alpn_protocols(["h2", "http/1.1"])

        t2 = time.perf_counter()
        ssock = ctx.wrap_socket(sock, server_hostname=None if _is_ip(host) else host)
    except Exception:
        sock.close()
        raise

    try:
        tls_ms = (time.perf_counter() - t2) * 1000
        cipher = ssock.cipher()
        der = ssock.getpeercert(binary_form=True)
        chain = _chain_der(ssock) or ([der] if der else [])
        return {
            "ip": ip, "dns_ms": dns_ms, "tcp_ms": tcp_ms, "tls_ms": tls_ms,
            "tls_version": ssock.version(),
            "cipher_suite": cipher[0] if cipher else None,
            "cipher_bits": cipher[2] if cipher else None,
            "alpn": ssock.selected_alpn_protocol(),
            "leaf_der": der, "chain_der": chain,
        }
    finally:
        ssock.close()


def _verify_trust(ip: str, host: str, port: int, timeout: int) -> Tuple[bool, Optional[str]]:
    """Validation de la chaîne contre le magasin système (hostname vérifié séparément)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    try:
        with socket.create_connection((ip, port), timeout=timeout) as s:
            with ctx.wrap_socket(s, server_hostname=None if _is_ip(host) else host):
                return True, None
    except ssl.SSLCertVerificationError as e:
        return False, e.verify_message or str(e)
    except (ssl.SSLError, OSError) as e:
        return False, str(e)


def _probe_version(ip: str, host: str, port: int, timeout: int, name: str, ver: ssl.TLSVersion):
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        if ver < ssl.TLSVersion.TLSv1_2:
            ctx.set_ciphers("ALL:@SECLEVEL=0")
        ctx.minimum_version = ver
        ctx.maximum_version = ver
    except (ssl.SSLError, ValueError):
        return name, {"supported": None, "note": "non testable avec l'OpenSSL local"}
    try:
        with socket.create_connection((ip, port), timeout=timeout) as s:
            with ctx.wrap_socket(s, server_hostname=None if _is_ip(host) else host) as ss:
                c = ss.cipher()
                return name, {"supported": True, "cipher": c[0] if c else None}
    except (ssl.SSLError, OSError):
        return name, {"supported": False}


# --------------------------------------------------------------------------- #
# Requête HTTP
# --------------------------------------------------------------------------- #
async def _http_request(url: str, method: str, timeout: int, verify_tls: bool,
                        follow_redirects: bool) -> Dict[str, Any]:
    start = time.perf_counter()
    async with httpx.AsyncClient(verify=verify_tls, follow_redirects=follow_redirects,
                                 timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
        async with client.stream(method, url) as resp:
            ttfb = (time.perf_counter() - start) * 1000
            size = 0
            if method == "GET":
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size >= MAX_BODY_BYTES:
                        break
            total = (time.perf_counter() - start) * 1000
            headers = {k.lower(): v for k, v in resp.headers.items()}
            redirects = [{"status_code": r.status_code, "url": str(r.url),
                          "location": r.headers.get("location")} for r in resp.history]
            return {
                "status_code": resp.status_code, "http_version": resp.http_version,
                "final_url": str(resp.url), "headers": headers, "redirects": redirects,
                "ttfb_ms": ttfb, "total_ms": total, "size": size,
            }


def _analyze_security_headers(headers: Dict[str, str]) -> Dict[str, Any]:
    present = {h: headers[h] for h in _SECURITY_HEADERS if h in headers}
    missing = [h for h in _SECURITY_HEADERS if h not in headers]
    hsts = None
    if "strict-transport-security" in headers:
        v = headers["strict-transport-security"].lower()
        max_age = None
        for part in (p.strip() for p in v.split(";")):
            if part.startswith("max-age="):
                try:
                    max_age = int(part.split("=", 1)[1].strip('"'))
                except ValueError:
                    pass
        hsts = {"max_age": max_age, "include_subdomains": "includesubdomains" in v, "preload": "preload" in v}
    return {"present": present, "missing": missing, "hsts": hsts}


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #
class HttpSyntheticService:
    @staticmethod
    def normalize_url(url: str) -> str:
        url = url.strip()
        if "://" not in url:
            url = "https://" + url
        return url

    @staticmethod
    async def run_check(url: str, timeout: int = 10, verify_tls: bool = True,
                        follow_redirects: bool = True, probe_protocols: bool = True,
                        method: str = "GET") -> Dict[str, Any]:
        """Retourne un dict dont les clés correspondent aux colonnes de HttpSyntheticCheck."""
        url = HttpSyntheticService.normalize_url(url)
        parts = urlsplit(url)
        scheme = parts.scheme.lower()
        if scheme not in ("http", "https") or not parts.hostname:
            raise ValueError("URL invalide : schéma http(s) et hostname requis")
        host = parts.hostname
        port = parts.port or (443 if scheme == "https" else 80)

        r: Dict[str, Any] = {
            "url": url, "scheme": scheme, "hostname": host, "port": port, "resolved_ip": None,
            "status": "offline", "error": None, "warnings": [],
            "http_status_code": None, "http_version": None, "final_url": None,
            "redirect_count": 0, "redirects": [], "response_headers": None,
            "security_headers": None, "response_size": None,
            "dns_ms": None, "tcp_ms": None, "tls_ms": None, "ttfb_ms": None, "total_ms": None,
            "tls_version": None, "cipher_suite": None, "cipher_bits": None, "alpn_protocol": None,
            "tls_trusted": None, "tls_verify_error": None, "tls_protocols": None,
            "cert_subject_cn": None, "cert_issuer_cn": None, "cert_not_before": None,
            "cert_not_after": None, "cert_days_remaining": None, "cert_fingerprint_sha256": None,
            "cert_hostname_match": None, "certificate": None, "chain": None,
        }
        warnings: List[str] = r["warnings"]

        # ---- 1. Handshake TLS + certificat ------------------------------------
        if scheme == "https":
            try:
                tls = await asyncio.to_thread(_tls_probe, host, port, timeout)
            except socket.gaierror as e:
                r["error"] = f"DNS resolution failed: {e}"
                return r
            except (ssl.SSLError, OSError) as e:
                r["error"] = f"TLS handshake failed: {type(e).__name__}: {e}"
                return r

            r.update(resolved_ip=tls["ip"], dns_ms=tls["dns_ms"], tcp_ms=tls["tcp_ms"], tls_ms=tls["tls_ms"],
                     tls_version=tls["tls_version"], cipher_suite=tls["cipher_suite"],
                     cipher_bits=tls["cipher_bits"], alpn_protocol=tls["alpn"])

            if tls["leaf_der"]:
                cert = parse_certificate(tls["leaf_der"], host)
                r["certificate"] = cert
                r.update(
                    cert_subject_cn=cert["subject_cn"], cert_issuer_cn=cert["issuer_cn"],
                    cert_not_before=datetime.fromisoformat(cert["not_before"]),
                    cert_not_after=datetime.fromisoformat(cert["not_after"]),
                    cert_days_remaining=cert["days_remaining"],
                    cert_fingerprint_sha256=cert["fingerprint_sha256"],
                    cert_hostname_match=cert.get("hostname_match"),
                )
                chain = []
                for i, der in enumerate(tls["chain_der"]):
                    c = parse_certificate(der)
                    chain.append({
                        "position": i, "subject_cn": c["subject_cn"], "issuer_cn": c["issuer_cn"],
                        "subject": c["subject"]["rfc4514"], "issuer": c["issuer"]["rfc4514"],
                        "not_before": c["not_before"], "not_after": c["not_after"],
                        "days_remaining": c["days_remaining"], "is_ca": c["is_ca"],
                        "self_signed": c["self_signed"], "public_key": c["public_key"],
                        "signature_algorithm": c["signature_algorithm"],
                        "fingerprint_sha256": c["fingerprint_sha256"],
                    })
                r["chain"] = chain

            # Validation chaîne + support des versions TLS, en parallèle
            tasks = [asyncio.to_thread(_verify_trust, tls["ip"], host, port, timeout)]
            if probe_protocols:
                tasks += [asyncio.to_thread(_probe_version, tls["ip"], host, port, timeout, n, v)
                          for n, v in _TLS_VERSIONS]
            results = await asyncio.gather(*tasks)
            r["tls_trusted"], r["tls_verify_error"] = results[0]
            if probe_protocols:
                r["tls_protocols"] = dict(results[1:])

        # ---- 2. Requête HTTP ----------------------------------------------------
        http_error = None
        try:
            h = await _http_request(url, method, timeout, verify_tls, follow_redirects)
            r.update(http_status_code=h["status_code"], http_version=h["http_version"],
                     final_url=h["final_url"], redirects=h["redirects"],
                     redirect_count=len(h["redirects"]), response_headers=h["headers"],
                     security_headers=_analyze_security_headers(h["headers"]),
                     response_size=h["size"], ttfb_ms=h["ttfb_ms"], total_ms=h["total_ms"])
            if scheme == "http":
                r["dns_ms"] = None
        except httpx.HTTPError as e:
            http_error = f"{type(e).__name__}: {e}"
        except Exception as e:  # pragma: no cover
            http_error = f"{type(e).__name__}: {e}"

        # ---- 3. Statut + warnings ----------------------------------------------
        if http_error:
            r["error"] = http_error
        elif r["http_status_code"] is not None and r["http_status_code"] >= 400:
            r["error"] = f"HTTP {r['http_status_code']}"
        else:
            r["status"] = "online"

        if scheme == "https":
            cert = r["certificate"] or {}
            if cert:
                if cert["expired"]:
                    warnings.append("Certificate expired")
                elif cert["not_yet_valid"]:
                    warnings.append("Certificate not yet valid")
                elif cert["days_remaining"] <= CERT_WARN_DAYS:
                    warnings.append(f"Certificate expires in {cert['days_remaining']} days")
                if cert.get("hostname_match") is False:
                    warnings.append("Certificate does not match hostname")
                if cert["self_signed"]:
                    warnings.append("Self-signed certificate")
                if cert["signature_hash"] in ("md5", "sha1"):
                    warnings.append(f"Weak signature hash: {cert['signature_hash']}")
                pk = cert["public_key"]
                if pk["type"] == "RSA" and (pk["size"] or 0) < 2048:
                    warnings.append(f"Weak RSA key size: {pk['size']}")
            if r["tls_trusted"] is False:
                warnings.append(f"Certificate chain not trusted: {r['tls_verify_error']}")
            if r["tls_version"] in ("TLSv1", "TLSv1.1", "SSLv3"):
                warnings.append(f"Deprecated TLS version negotiated: {r['tls_version']}")
            for name in ("TLSv1.0", "TLSv1.1"):
                if (r["tls_protocols"] or {}).get(name, {}).get("supported"):
                    warnings.append(f"Server still accepts deprecated {name}")
            if r["security_headers"] and not r["security_headers"]["hsts"]:
                warnings.append("HSTS header missing")

        if r["status"] == "online" and warnings:
            r["status"] = "warning"

        return r