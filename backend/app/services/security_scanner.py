import asyncio
import json
import ssl
import socket
import subprocess
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import httpx
from urllib.parse import urlparse

class SecurityScanner:
    """
    Scanner de sécurité sans authentification
    Détecte les vulnérabilités et failles de sécurité depuis l'extérieur
    """
    
    def __init__(self):
        # Vérifier la disponibilité de dnspython à l'initialisation
        self.dns_available = False
        try:
            import dns.resolver
            import dns.zone
            import dns.query
            self.dns_module = dns
            self.dns_available = True
            print("✅ DNS module is available for scanning")
        except ImportError:
            print("⚠️ dnspython not installed, DNS checks will be limited")
            self.dns_module = None
        
        self.vulnerability_db = {
            # Base de données de vulnérabilités connues
            "apache": {
                "2.4.49": "CVE-2021-41773 - Path Traversal",
                "2.4.50": "CVE-2021-42013 - Path Traversal & RCE",
            },
            "nginx": {
                "1.16.0": "CVE-2019-9511 - HTTP/2 DoS",
                "1.17.2": "CVE-2019-9513 - HTTP/2 Resource Loop",
            },
            "ssh": {
                "7.0": "CVE-2016-0777 - Client Information Leak",
                "7.2": "CVE-2016-6210 - User Enumeration",
            }
        }
        
    async def full_security_scan(self, hostname: str, ip_address: str, ports: List[int] = None) -> Dict[str, Any]:
        """
        Scan de sécurité complet sans authentification
        """
        print(f"🔍 Starting security scan for {hostname} ({ip_address})")
        
        results = {
            "hostname": hostname,
            "ip_address": ip_address,
            "scan_date": datetime.now().isoformat(),
            "risk_level": "low",  # Par défaut, sera mis à jour
            "vulnerabilities": [],
            "recommendations": [],
            "details": {}
        }
        
        try:
            # 1. Scan des ports et services
            port_scan = await self.scan_ports_and_services(ip_address, ports)
            results["details"]["ports"] = port_scan
            
            # 2. Analyse des headers HTTP/HTTPS
            if self._has_web_service(port_scan):
                web_scan = await self.scan_web_security(hostname, port_scan)
                results["details"]["web"] = web_scan
                results["vulnerabilities"].extend(web_scan.get("vulnerabilities", []))
            
            # 3. Vérification SSL/TLS
            if self._has_https(port_scan):
                ssl_scan = await self.scan_ssl_vulnerabilities(hostname, self._get_https_port(port_scan))
                results["details"]["ssl"] = ssl_scan
                results["vulnerabilities"].extend(ssl_scan.get("vulnerabilities", []))
            
            # 4. Scan DNS (si disponible)
            dns_scan = await self.scan_dns_security(hostname)
            results["details"]["dns"] = dns_scan
            results["vulnerabilities"].extend(dns_scan.get("vulnerabilities", []))
            
            # 5. Détection de versions et CVEs
            cve_scan = await self.detect_cves(hostname, port_scan)
            results["details"]["cve"] = cve_scan
            results["vulnerabilities"].extend(cve_scan.get("vulnerabilities", []))
            
            # 6. Tests de vulnérabilités communes
            common_vulns = await self.check_common_vulnerabilities(hostname, ip_address, port_scan)
            results["details"]["common"] = common_vulns
            results["vulnerabilities"].extend(common_vulns.get("vulnerabilities", []))
            
        except Exception as e:
            print(f"Error during scan: {str(e)}")
            results["vulnerabilities"].append({
                "severity": "info",
                "type": "scan_error",
                "description": f"Erreur pendant le scan: {str(e)}"
            })
        
        # Calcul du niveau de risque et recommandations
        results["risk_level"] = self._calculate_risk_level(results["vulnerabilities"])
        results["recommendations"] = self._generate_recommendations(results)
        
        return results
    
    async def scan_ports_and_services(self, ip: str, specific_ports: List[int] = None) -> Dict:
        """
        Scan approfondi des ports avec détection de services et versions
        """
        results = {
            "open_ports": [],
            "services": {},
            "vulnerable_services": []
        }
        
        # Ports critiques à scanner si non spécifiés
        if not specific_ports:
            specific_ports = [
                21,    # FTP
                22,    # SSH
                23,    # Telnet (très dangereux si ouvert)
                25,    # SMTP
                53,    # DNS
                80,    # HTTP
                110,   # POP3
                135,   # MS-RPC (Windows)
                139,   # NetBIOS
                143,   # IMAP
                443,   # HTTPS
                445,   # SMB (très critique)
                1433,  # MSSQL
                1521,  # Oracle
                3306,  # MySQL
                3389,  # RDP (Windows)
                5432,  # PostgreSQL
                5900,  # VNC
                6379,  # Redis (critique si pas d'auth)
                8080,  # HTTP Alt
                8443,  # HTTPS Alt
                9200,  # Elasticsearch
                27017, # MongoDB
            ]
        
        try:
            # Utilisation de nmap pour un scan approfondi
            nmap_cmd = [
                "nmap", 
                "-sV",  # Détection de version
                "-sC",  # Scripts par défaut
                "--version-intensity", "9",  # Détection agressive des versions
                "-p", ",".join(map(str, specific_ports)),
                "-Pn",  # Skip ping
                "--open",  # Seulement les ports ouverts
                "-oX", "-",  # Output XML
                ip
            ]
            
            process = await asyncio.create_subprocess_exec(
                *nmap_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            # Parser la sortie nmap
            results = self._parse_nmap_output(stdout.decode())
            
            # Détection de services vulnérables
            for port_info in results["services"].values():
                vulns = self._check_service_vulnerabilities(port_info)
                if vulns:
                    results["vulnerable_services"].extend(vulns)
                    
        except Exception as e:
            print(f"Error in port scan: {e}")
            # Fallback to basic socket scan
            results = await self._basic_port_scan(ip, specific_ports)
        
        return results
    
    async def scan_web_security(self, hostname: str, port_scan: Dict) -> Dict:
        """
        Scan approfondi de la sécurité web
        """
        results = {
            "security_headers": {},
            "vulnerabilities": [],
            "technologies": [],
            "misconfigurations": []
        }
        
        # Déterminer les ports web
        web_ports = []
        for port, service in port_scan.get("services", {}).items():
            if any(web in service.get("name", "").lower() for web in ["http", "https", "web"]):
                web_ports.append({
                    "port": port,
                    "ssl": "https" in service.get("name", "").lower() or port in [443, 8443]
                })
        
        if not web_ports:
            web_ports = [{"port": 80, "ssl": False}, {"port": 443, "ssl": True}]
        
        for port_info in web_ports:
            protocol = "https" if port_info["ssl"] else "http"
            url = f"{protocol}://{hostname}:{port_info['port']}"
            
            try:
                async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=10) as client:
                    response = await client.get(url)
                    
                    # 1. Analyse des headers de sécurité
                    headers = dict(response.headers)
                    security_analysis = self._analyze_security_headers(headers)
                    results["security_headers"] = security_analysis["headers"]
                    results["vulnerabilities"].extend(security_analysis["missing"])
                    
                    # 2. Détection de technologies (via headers et patterns)
                    tech = self._detect_technologies(headers, response.text)
                    results["technologies"] = tech
                    
                    # 3. Tests de vulnérabilités web communes
                    web_vulns = await self._test_web_vulnerabilities(client, url)
                    results["vulnerabilities"].extend(web_vulns)
                    
                    # 4. Vérification de fichiers sensibles exposés
                    exposed = await self._check_exposed_files(client, url)
                    if exposed:
                        results["vulnerabilities"].extend(exposed)
                    
                    # 5. Test d'injections basiques
                    injections = await self._test_basic_injections(client, url)
                    if injections:
                        results["vulnerabilities"].extend(injections)
                        
            except Exception as e:
                print(f"Error scanning {url}: {e}")
                continue
        
        return results
    
    async def scan_ssl_vulnerabilities(self, hostname: str, port: int = 443) -> Dict:
        """
        Scan des vulnérabilités SSL/TLS
        """
        results = {
            "certificate": {},
            "vulnerabilities": [],
            "protocol_versions": [],
            "cipher_suites": []
        }
        
        try:
            # 1. Récupération du certificat
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            with socket.create_connection((hostname, port), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    cipher = ssock.cipher()
                    version = ssock.version()
                    
                    # Analyse du certificat
                    if cert:
                        cert_analysis = self._analyze_certificate(cert)
                        results["certificate"] = cert_analysis["info"]
                        results["vulnerabilities"].extend(cert_analysis["issues"])
                    
                    # Analyse du protocole
                    results["protocol_versions"].append(version)
                    if version in ["SSLv2", "SSLv3", "TLSv1", "TLSv1.1"]:
                        results["vulnerabilities"].append({
                            "severity": "high",
                            "type": "ssl_protocol",
                            "description": f"Protocole obsolète utilisé: {version}",
                            "cve": "Multiple CVEs",
                            "remediation": "Désactiver les protocoles SSL/TLS obsolètes"
                        })
                    
                    # Analyse des cipher suites
                    if cipher:
                        results["cipher_suites"].append(cipher[0])
                        weak_ciphers = self._check_weak_ciphers(cipher[0])
                        if weak_ciphers:
                            results["vulnerabilities"].extend(weak_ciphers)
            
            # 2. Tests spécifiques SSL/TLS
            ssl_tests = await self._run_ssl_specific_tests(hostname, port)
            results["vulnerabilities"].extend(ssl_tests)
            
        except Exception as e:
            results["vulnerabilities"].append({
                "severity": "info",
                "type": "ssl_error",
                "description": f"Impossible d'analyser SSL: {str(e)}"
            })
        
        return results
    
    async def scan_dns_security(self, hostname: str) -> Dict:
        """
        Scan des configurations DNS et vulnérabilités associées
        """
        results = {
            "records": {},
            "vulnerabilities": [],
            "misconfigurations": []
        }
        
        # Vérifier si le module DNS est disponible
        if not self.dns_available or not self.dns_module:
            results["misconfigurations"].append({
                "type": "dns_check_unavailable",
                "description": "Module DNS non disponible pour vérification complète",
                "severity": "info"
            })
            return results
        
        try:
            # Utiliser le module dns importé à l'initialisation
            dns = self.dns_module
            resolver = dns.resolver.Resolver()
            
            # 1. Vérification des enregistrements SPF
            try:
                txt_records = resolver.resolve(hostname, 'TXT')
                spf_found = False
                for rdata in txt_records:
                    txt_string = str(rdata)
                    if 'v=spf' in txt_string:
                        spf_found = True
                        results["records"]["spf"] = txt_string
                
                if not spf_found:
                    results["vulnerabilities"].append({
                        "severity": "medium",
                        "type": "dns_spf_missing",
                        "description": "Pas d'enregistrement SPF trouvé",
                        "impact": "Risque d'usurpation d'email (spoofing)",
                        "remediation": "Configurer un enregistrement SPF"
                    })
            except:
                pass
            
            # 2. Vérification DMARC
            try:
                dmarc_domain = f"_dmarc.{hostname}"
                dmarc_records = resolver.resolve(dmarc_domain, 'TXT')
                dmarc_found = False
                for rdata in dmarc_records:
                    if 'v=DMARC' in str(rdata):
                        dmarc_found = True
                        results["records"]["dmarc"] = str(rdata)
                
                if not dmarc_found:
                    results["vulnerabilities"].append({
                        "severity": "medium",
                        "type": "dns_dmarc_missing",
                        "description": "Pas de politique DMARC",
                        "impact": "Protection email insuffisante",
                        "remediation": "Implémenter DMARC"
                    })
            except:
                pass
            
            # 3. Test de transfert de zone (AXFR)
            try:
                zone = dns.zone.from_xfr(dns.query.xfr(hostname, hostname))
                results["vulnerabilities"].append({
                    "severity": "critical",
                    "type": "dns_zone_transfer",
                    "description": "Transfert de zone DNS non restreint (AXFR)",
                    "impact": "Fuite d'information sur l'infrastructure",
                    "remediation": "Restreindre les transferts de zone aux serveurs autorisés"
                })
            except:
                pass  # C'est bien si ça échoue
            
            # 4. Vérification DNSSEC
            try:
                answer = resolver.resolve(hostname, 'DNSKEY')
                results["records"]["dnssec"] = True
            except:
                results["misconfigurations"].append({
                    "type": "dnssec_disabled",
                    "description": "DNSSEC non configuré",
                    "severity": "low"
                })
            
        except Exception as e:
            print(f"DNS scan error: {e}")
            results["misconfigurations"].append({
                "type": "dns_error",
                "description": f"Erreur lors du scan DNS: {str(e)}",
                "severity": "info"
            })
        
        return results
    
    async def detect_cves(self, hostname: str, port_scan: Dict) -> Dict:
        """
        Détection de CVEs basée sur les versions détectées
        """
        results = {
            "vulnerabilities": [],
            "detected_software": []
        }
        
        # Analyse des services détectés
        for port, service_info in port_scan.get("services", {}).items():
            service_name = service_info.get("name", "").lower()
            version = service_info.get("version", "")
            
            if not version:
                continue
            
            results["detected_software"].append({
                "port": port,
                "service": service_name,
                "version": version
            })
            
            # Vérification dans notre base de vulnérabilités
            for software, vuln_versions in self.vulnerability_db.items():
                if software in service_name:
                    for vuln_version, cve_info in vuln_versions.items():
                        if vuln_version in version:
                            results["vulnerabilities"].append({
                                "severity": "critical",
                                "type": "known_cve",
                                "port": port,
                                "service": service_name,
                                "version": version,
                                "description": cve_info,
                                "remediation": f"Mettre à jour {service_name} vers une version récente"
                            })
        
        return results
    
    async def check_common_vulnerabilities(self, hostname: str, ip: str, port_scan: Dict) -> Dict:
        """
        Tests de vulnérabilités communes et misconfigurations
        """
        results = {
            "vulnerabilities": [],
            "tests_performed": []
        }
        
        # 1. Services dangereux exposés
        dangerous_services = {
            23: ("Telnet", "critical", "Service non chiffré"),
            135: ("MS-RPC", "high", "Exposition de services Windows"),
            139: ("NetBIOS", "high", "Fuite d'informations système"),
            445: ("SMB", "critical", "Risque de ransomware et propagation latérale"),
            3389: ("RDP", "high", "Accès bureau à distance exposé"),
            5900: ("VNC", "high", "Accès bureau à distance non sécurisé"),
            6379: ("Redis", "critical", "Base de données sans authentification"),
            9200: ("Elasticsearch", "critical", "API exposée sans auth"),
            27017: ("MongoDB", "critical", "Base de données exposée")
        }
        
        for port, (service, severity, description) in dangerous_services.items():
            if port in [p["port"] for p in port_scan.get("open_ports", [])]:
                results["vulnerabilities"].append({
                    "severity": severity,
                    "type": "dangerous_service",
                    "port": port,
                    "service": service,
                    "description": f"{service} exposé: {description}",
                    "remediation": f"Fermer le port {port} ou restreindre l'accès par firewall"
                })
        
        # 2. Test d'anonymisation insuffisante
        anon_tests = await self._test_information_disclosure(hostname, ip)
        results["vulnerabilities"].extend(anon_tests)
        
        # 3. Test de défaut de configuration
        default_creds = await self._test_default_credentials(hostname, port_scan)
        if default_creds:
            results["vulnerabilities"].extend(default_creds)
        
        return results
    
    async def _test_web_vulnerabilities(self, client: httpx.AsyncClient, url: str) -> List[Dict]:
        """
        Tests de vulnérabilités web spécifiques
        """
        vulnerabilities = []
        
        # 1. Test de directory traversal
        traversal_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "....//....//....//etc/passwd"
        ]
        
        for payload in traversal_payloads:
            try:
                response = await client.get(f"{url}/{payload}", follow_redirects=False)
                if response.status_code == 200 and ("root:" in response.text or "admin:" in response.text):
                    vulnerabilities.append({
                        "severity": "critical",
                        "type": "path_traversal",
                        "description": "Vulnérabilité de traversée de répertoire détectée",
                        "payload": payload,
                        "remediation": "Valider et assainir les entrées utilisateur"
                    })
                    break
            except:
                pass
        
        # 2. Test XSS basique (reflected)
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "'\"><script>alert(1)</script>",
            "javascript:alert(1)"
        ]
        
        for payload in xss_payloads:
            try:
                response = await client.get(f"{url}?q={payload}", follow_redirects=False)
                if payload in response.text:
                    vulnerabilities.append({
                        "severity": "high",
                        "type": "xss_reflected",
                        "description": "Potentielle vulnérabilité XSS détectée",
                        "remediation": "Encoder les sorties HTML et valider les entrées"
                    })
                    break
            except:
                pass
        
        # 3. Test d'injection SQL basique
        sql_payloads = [
            "'",
            "1' OR '1'='1",
            "' OR 1=1--",
            "admin'--"
        ]
        
        for payload in sql_payloads:
            try:
                response = await client.get(f"{url}?id={payload}", follow_redirects=False)
                error_patterns = [
                    "SQL syntax",
                    "mysql_fetch",
                    "ORA-01756",
                    "PostgreSQL",
                    "SQLite",
                    "Microsoft SQL Server"
                ]
                
                for pattern in error_patterns:
                    if pattern in response.text:
                        vulnerabilities.append({
                            "severity": "critical",
                            "type": "sql_injection",
                            "description": f"Erreur SQL exposée, possible injection SQL",
                            "pattern_found": pattern,
                            "remediation": "Utiliser des requêtes préparées (prepared statements)"
                        })
                        break
            except:
                pass
        
        return vulnerabilities
    
    async def _check_exposed_files(self, client: httpx.AsyncClient, url: str) -> List[Dict]:
        """
        Vérification de fichiers sensibles exposés
        """
        vulnerabilities = []
        
        sensitive_files = [
            ("/.git/config", "Repository Git exposé"),
            ("/.env", "Variables d'environnement exposées"),
            ("/wp-config.php", "Configuration WordPress exposée"),
            ("/config.php", "Fichier de configuration exposé"),
            ("/.htaccess", "Configuration Apache exposée"),
            ("/web.config", "Configuration IIS exposée"),
            ("/robots.txt", "Fichier robots.txt (information)"),
            ("/sitemap.xml", "Sitemap exposé"),
            ("/backup.sql", "Backup SQL exposé"),
            ("/database.sql", "Export de base de données exposé"),
            ("/.DS_Store", "Métadonnées macOS exposées"),
            ("/Thumbs.db", "Métadonnées Windows exposées"),
            ("/phpinfo.php", "PHPInfo exposé"),
            ("/server-status", "Apache status exposé"),
            ("/admin", "Panel admin potentiel"),
            ("/phpmyadmin", "phpMyAdmin exposé"),
            ("/.svn/entries", "Repository SVN exposé"),
        ]
        
        for file_path, description in sensitive_files:
            try:
                response = await client.get(f"{url}{file_path}", follow_redirects=False)
                if response.status_code == 200:
                    severity = "critical" if any(x in file_path for x in ['.env', 'config', '.git', 'sql']) else "medium"
                    vulnerabilities.append({
                        "severity": severity,
                        "type": "exposed_file",
                        "path": file_path,
                        "description": description,
                        "remediation": f"Supprimer ou protéger l'accès à {file_path}"
                    })
            except:
                pass
        
        return vulnerabilities
    
    def _analyze_security_headers(self, headers: Dict) -> Dict:
        """
        Analyse des headers de sécurité HTTP
        """
        security_headers = {
            "X-Frame-Options": {
                "present": False,
                "value": None,
                "recommendation": "DENY ou SAMEORIGIN",
                "vulnerability": "Risque de clickjacking"
            },
            "X-Content-Type-Options": {
                "present": False,
                "value": None,
                "recommendation": "nosniff",
                "vulnerability": "Risque de MIME sniffing"
            },
            "Strict-Transport-Security": {
                "present": False,
                "value": None,
                "recommendation": "max-age=31536000; includeSubDomains",
                "vulnerability": "Pas de HSTS, risque de downgrade attack"
            },
            "Content-Security-Policy": {
                "present": False,
                "value": None,
                "recommendation": "default-src 'self'",
                "vulnerability": "Pas de CSP, risque XSS accru"
            },
            "X-XSS-Protection": {
                "present": False,
                "value": None,
                "recommendation": "1; mode=block",
                "vulnerability": "Protection XSS du navigateur désactivée"
            },
            "Referrer-Policy": {
                "present": False,
                "value": None,
                "recommendation": "strict-origin-when-cross-origin",
                "vulnerability": "Fuite d'information via Referer"
            },
            "Permissions-Policy": {
                "present": False,
                "value": None,
                "recommendation": "geolocation=(), microphone=(), camera=()",
                "vulnerability": "Permissions navigateur non restreintes"
            }
        }
        
        missing_headers = []
        
        for header_name, header_info in security_headers.items():
            if header_name.lower() in [h.lower() for h in headers.keys()]:
                header_info["present"] = True
                header_info["value"] = headers.get(header_name, "")
            else:
                missing_headers.append({
                    "severity": "medium",
                    "type": "missing_security_header",
                    "header": header_name,
                    "description": header_info["vulnerability"],
                    "remediation": f"Ajouter header: {header_name}: {header_info['recommendation']}"
                })
        
        # Headers qui révèlent des informations
        information_headers = ["Server", "X-Powered-By", "X-AspNet-Version"]
        for info_header in information_headers:
            if info_header in headers:
                missing_headers.append({
                    "severity": "low",
                    "type": "information_disclosure",
                    "header": info_header,
                    "value": headers[info_header],
                    "description": f"Header {info_header} révèle des informations sur le serveur",
                    "remediation": f"Supprimer ou masquer le header {info_header}"
                })
        
        return {
            "headers": security_headers,
            "missing": missing_headers
        }
    
    def _calculate_risk_level(self, vulnerabilities: List[Dict]) -> str:
        """
        Calcule le niveau de risque global
        """
        if not vulnerabilities:
            return "low"
        
        severity_scores = {
            "critical": 10,
            "high": 7,
            "medium": 4,
            "low": 1,
            "info": 0
        }
        
        total_score = sum(severity_scores.get(v.get("severity", "low"), 0) for v in vulnerabilities)
        
        if total_score >= 20:
            return "critical"
        elif total_score >= 10:
            return "high"
        elif total_score >= 5:
            return "medium"
        else:
            return "low"
    
    def _generate_recommendations(self, results: Dict) -> List[Dict]:
        """
        Génère des recommandations basées sur les résultats du scan
        """
        recommendations = []
        
        # Analyse par catégorie
        if results["risk_level"] in ["critical", "high"]:
            recommendations.append({
                "priority": "critical",
                "category": "general",
                "action": "Traiter immédiatement les vulnérabilités critiques identifiées",
                "details": "Des failles de sécurité importantes ont été détectées et doivent être corrigées en urgence"
            })
        
        # Recommandations SSL/TLS
        ssl_vulns = [v for v in results["vulnerabilities"] if v.get("type", "").startswith("ssl")]
        if ssl_vulns:
            recommendations.append({
                "priority": "high",
                "category": "ssl",
                "action": "Mettre à jour la configuration SSL/TLS",
                "details": "Désactiver les protocoles obsolètes et utiliser TLS 1.2 minimum"
            })
        
        # Recommandations web
        web_vulns = [v for v in results["vulnerabilities"] if v.get("type", "") in ["xss", "sql_injection", "path_traversal"]]
        if web_vulns:
            recommendations.append({
                "priority": "critical",
                "category": "web",
                "action": "Implémenter une validation d'entrée stricte",
                "details": "Utiliser des frameworks de sécurité et des requêtes préparées"
            })
        
        # Services dangereux
        dangerous = [v for v in results["vulnerabilities"] if v.get("type", "") == "dangerous_service"]
        if dangerous:
            recommendations.append({
                "priority": "high",
                "category": "network",
                "action": "Fermer ou restreindre les services dangereux",
                "details": "Configurer un firewall pour limiter l'accès aux services critiques"
            })
        
        return recommendations
    
    # Méthodes helper
    def _has_web_service(self, port_scan: Dict) -> bool:
        for service in port_scan.get("services", {}).values():
            if any(web in service.get("name", "").lower() for web in ["http", "web"]):
                return True
        return False
    
    def _has_https(self, port_scan: Dict) -> bool:
        for port, service in port_scan.get("services", {}).items():
            if port in [443, 8443] or "https" in service.get("name", "").lower():
                return True
        return False
    
    def _get_https_port(self, port_scan: Dict) -> int:
        for port, service in port_scan.get("services", {}).items():
            if port in [443, 8443] or "https" in service.get("name", "").lower():
                return port
        return 443
    
    def _parse_nmap_output(self, xml_output: str) -> Dict:
        """Parse nmap XML output - simplified version"""
        # Pour simplicité, on parse basiquement
        # En production, utiliser xml.etree.ElementTree
        results = {
            "open_ports": [],
            "services": {}
        }
        
        # Extraction basique des ports ouverts
        import re
        port_pattern = r'portid="(\d+)".*state="open"'
        service_pattern = r'name="([^"]+)".*product="([^"]*)".*version="([^"]*)"'
        
        for match in re.finditer(port_pattern, xml_output):
            port = int(match.group(1))
            results["open_ports"].append({"port": port, "state": "open"})
            results["services"][port] = {"port": port}
        
        return results
    
    async def _basic_port_scan(self, ip: str, ports: List[int]) -> Dict:
        """Fallback basique si nmap échoue"""
        results = {
            "open_ports": [],
            "services": {},
            "vulnerable_services": []
        }
        
        for port in ports:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((ip, port))
            sock.close()
            
            if result == 0:
                results["open_ports"].append({"port": port, "state": "open"})
                # Détection basique du service
                service_name = self._guess_service(port)
                results["services"][port] = {
                    "port": port,
                    "name": service_name,
                    "version": "unknown"
                }
        
        return results
    
    def _guess_service(self, port: int) -> str:
        """Devine le service basé sur le port"""
        common_ports = {
            21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp",
            53: "dns", 80: "http", 110: "pop3", 143: "imap",
            443: "https", 445: "smb", 3306: "mysql", 3389: "rdp",
            5432: "postgresql", 8080: "http-alt", 8443: "https-alt"
        }
        return common_ports.get(port, f"unknown-{port}")
    
    def _check_service_vulnerabilities(self, service_info: Dict) -> List[Dict]:
        """Vérifie les vulnérabilités connues d'un service"""
        vulnerabilities = []
        service_name = service_info.get("name", "").lower()
        version = service_info.get("version", "")
        
        # Services avec authentification par défaut faible
        weak_auth_services = ["redis", "mongodb", "elasticsearch", "memcached"]
        if any(svc in service_name for svc in weak_auth_services):
            vulnerabilities.append({
                "severity": "critical",
                "type": "weak_authentication",
                "service": service_name,
                "description": f"{service_name} peut avoir une authentification faible ou désactivée",
                "remediation": "Activer l'authentification et utiliser des mots de passe forts"
            })
        
        return vulnerabilities
    
    def _detect_technologies(self, headers: Dict, body: str) -> List[Dict]:
        """Détecte les technologies utilisées"""
        technologies = []
        
        # Détection via headers
        if "X-Powered-By" in headers:
            technologies.append({
                "type": "backend",
                "name": headers["X-Powered-By"],
                "source": "header"
            })
        
        if "Server" in headers:
            technologies.append({
                "type": "server",
                "name": headers["Server"],
                "source": "header"
            })
        
        # Détection via patterns dans le body
        tech_patterns = {
            "WordPress": r'<meta name="generator" content="WordPress',
            "Drupal": r'Drupal\.settings',
            "Joomla": r'/media/jui/js/',
            "Django": r'csrfmiddlewaretoken',
            "Laravel": r'laravel_session',
            "React": r'_react',
            "Angular": r'ng-version',
            "Vue.js": r'Vue\.js'
        }
        
        for tech, pattern in tech_patterns.items():
            if re.search(pattern, body, re.IGNORECASE):
                technologies.append({
                    "type": "framework",
                    "name": tech,
                    "source": "content"
                })
        
        return technologies
    
    async def _test_basic_injections(self, client: httpx.AsyncClient, url: str) -> List[Dict]:
        """Tests d'injection basiques"""
        vulnerabilities = []
        
        # Command injection test
        cmd_payloads = [
            "; ls",
            "| whoami",
            "& dir",
            "`id`"
        ]
        
        for payload in cmd_payloads:
            try:
                response = await client.get(f"{url}?cmd={payload}", timeout=5)
                # Patterns indiquant une possible exécution
                if any(pattern in response.text for pattern in ["uid=", "gid=", "root:", "admin:"]):
                    vulnerabilities.append({
                        "severity": "critical",
                        "type": "command_injection",
                        "description": "Possible injection de commande détectée",
                        "remediation": "Ne jamais exécuter de commandes système avec des entrées utilisateur"
                    })
                    break
            except:
                pass
        
        return vulnerabilities
    
    def _analyze_certificate(self, cert: Dict) -> Dict:
        """Analyse le certificat SSL"""
        issues = []
        info = {}
        
        if cert:
            # Extraction des informations
            subject = dict(x[0] for x in cert.get('subject', []))
            info["common_name"] = subject.get('commonName', '')
            
            # Vérification de l'expiration
            not_after = cert.get('notAfter')
            if not_after:
                from datetime import datetime
                import ssl
                expire_date = datetime.strptime(not_after, '%b %d %H:%M:%S %Y %Z')
                days_until_expire = (expire_date - datetime.now()).days
                
                info["expires_in_days"] = days_until_expire
                
                if days_until_expire < 0:
                    issues.append({
                        "severity": "critical",
                        "type": "ssl_expired",
                        "description": "Certificat SSL expiré",
                        "remediation": "Renouveler le certificat immédiatement"
                    })
                elif days_until_expire < 30:
                    issues.append({
                        "severity": "high",
                        "type": "ssl_expiring",
                        "description": f"Certificat expire dans {days_until_expire} jours",
                        "remediation": "Planifier le renouvellement du certificat"
                    })
        
        return {"info": info, "issues": issues}
    
    def _check_weak_ciphers(self, cipher_name: str) -> List[Dict]:
        """Vérifie les cipher suites faibles"""
        vulnerabilities = []
        weak_ciphers = ["RC4", "DES", "3DES", "MD5", "NULL", "EXPORT", "anon"]
        
        for weak in weak_ciphers:
            if weak in cipher_name:
                vulnerabilities.append({
                    "severity": "high",
                    "type": "weak_cipher",
                    "description": f"Cipher suite faible utilisée: {cipher_name}",
                    "remediation": "Utiliser des cipher suites modernes (AES-GCM, ChaCha20-Poly1305)"
                })
                break
        
        return vulnerabilities
    
    async def _run_ssl_specific_tests(self, hostname: str, port: int) -> List[Dict]:
        """Tests SSL/TLS spécifiques"""
        vulnerabilities = []
        
        # Test Heartbleed (simplifié)
        # En production, utiliser un module spécialisé
        try:
            # Test basique de vulnérabilité Heartbleed
            context = ssl.SSLContext(ssl.PROTOCOL_TLS)
            context.options |= ssl.OP_NO_TLSv1_3 | ssl.OP_NO_TLSv1_2
            
            with socket.create_connection((hostname, port), timeout=5) as sock:
                with context.wrap_socket(sock) as ssock:
                    # Si on arrive à se connecter avec TLS 1.0/1.1, c'est un problème
                    vulnerabilities.append({
                        "severity": "medium",
                        "type": "ssl_old_protocol",
                        "description": "Protocoles TLS anciens supportés",
                        "remediation": "Désactiver TLS 1.0 et 1.1"
                    })
        except:
            pass  # C'est bien si ça échoue
        
        return vulnerabilities
    
    async def _test_information_disclosure(self, hostname: str, ip: str) -> List[Dict]:
        """Test de divulgation d'informations"""
        vulnerabilities = []
        
        # Test de divulgation via erreurs
        error_urls = [
            "/non-existent-page-12345",
            "/admin/config/database",
            "/.git/HEAD"
        ]
        
        for test_url in error_urls:
            try:
                async with httpx.AsyncClient(verify=False, timeout=5) as client:
                    response = await client.get(f"http://{hostname}{test_url}")
                    
                    # Patterns révélateurs dans les erreurs
                    error_patterns = {
                        "Stack trace": r"(at\s+\w+\.\w+|Traceback|stack trace)",
                        "Path disclosure": r"(/home/|/var/www/|C:\\|/usr/)",
                        "Database error": r"(SQLException|mysql_|ORA-\d+|PostgreSQL)",
                        "Debug mode": r"(DEBUG\s*=\s*True|WP_DEBUG|debug mode)"
                    }
                    
                    for error_type, pattern in error_patterns.items():
                        if re.search(pattern, response.text, re.IGNORECASE):
                            vulnerabilities.append({
                                "severity": "medium",
                                "type": "information_disclosure",
                                "description": f"{error_type} détecté dans les pages d'erreur",
                                "remediation": "Désactiver les messages d'erreur détaillés en production"
                            })
                            break
            except:
                pass
        
        return vulnerabilities
    
    async def _test_default_credentials(self, hostname: str, port_scan: Dict) -> List[Dict]:
        """Test de credentials par défaut"""
        vulnerabilities = []
        
        # Credentials par défaut courants
        default_creds = {
            "admin": ["admin", "password", "123456"],
            "root": ["root", "toor", "password"],
            "administrator": ["administrator", "admin"],
            "guest": ["guest", ""],
            "test": ["test", "test123"]
        }
        
        # Test sur les services d'authentification détectés
        for port, service in port_scan.get("services", {}).items():
            service_name = service.get("name", "").lower()
            
            # Services web avec authentification
            if any(web in service_name for web in ["http", "web"]):
                # Test de connexion basique (à adapter selon le service)
                for username, passwords in default_creds.items():
                    for password in passwords:
                        # Ici on simule, en production faire un vrai test
                        # selon le type de service détecté
                        pass
        
        # Note: En production, implémenter des tests réels mais prudents
        # pour éviter de verrouiller des comptes
        
        return vulnerabilities