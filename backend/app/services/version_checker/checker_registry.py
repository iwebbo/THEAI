"""Registre des types d'applications supportés.

AJOUTER UNE APPLICATION (ex. Vault, Nexus, Keycloak...) = écrire :
  1. un provider local  `async def monapp(client, cfg) -> str`  dans checker_local.py
     (lit la version installée, voir les exemples) ;
  2. une source amont   `UpstreamSpec(...)`  dans checker_upstream.py (UPSTREAM) ;
  3. une entrée `register_app_type(AppType(...))` ci-dessous.
Au prochain démarrage, une cible « non configurée » est créée automatiquement pour ce type
(ensure_default_targets) ; l'API, l'historique et les comparaisons fonctionnent sans autre changement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from .checker_local import PROVIDERS, LocalProvider
from .checker_upstream import UPSTREAM, UpstreamSpec


@dataclass(frozen=True)
class AppType:
    key: str  # identifiant technique stable (jamais renommé : il est stocké en base)
    label: str  # nom affiché
    local: LocalProvider  # lecture de la version installée
    upstream: UpstreamSpec  # source officielle de la dernière version
    auth_fields: Tuple[str, ...] = ()  # champs utiles : "token", "username", "password"
    auth_required: bool = False  # indicatif (formulaire) : l'application exige-t-elle une authentification
    auth_hint: str = ""
    url_example: str = ""
    max_parts: Optional[int] = None  # composantes de version conservées (build ignoré)


APP_TYPES: Dict[str, AppType] = {}


def register_app_type(app_type: AppType) -> AppType:
    if app_type.key in APP_TYPES:
        raise ValueError(f"type d'application déjà enregistré : {app_type.key}")
    APP_TYPES[app_type.key] = app_type
    return app_type


def get_app_type(key: str) -> Optional[AppType]:
    return APP_TYPES.get(key)


def _reg(key, label, *, auth_fields=(), auth_required=False, auth_hint="", url_example="", max_parts=None):
    register_app_type(AppType(key=key, label=label, local=PROVIDERS[key], upstream=UPSTREAM[key],
                              auth_fields=tuple(auth_fields), auth_required=auth_required,
                              auth_hint=auth_hint, url_example=url_example, max_parts=max_parts))


_reg("jenkins", "Jenkins", auth_fields=("username", "password"),
     auth_hint="Optionnel : la version est lue dans l'en-tête X-Jenkins, même sans authentification. "
               "Sinon utilisateur + API token Jenkins.",
     url_example="http://jenkins.lan:8080")
_reg("sonarqube", "SonarQube", auth_fields=("token",),
     auth_hint="Aucune authentification requise (endpoint public).", url_example="http://sonarqube.lan:9000",
     max_parts=3)
_reg("portainer", "Portainer", auth_fields=("token",),
     auth_hint="Aucune authentification requise (endpoint public). Token d'accès (X-API-Key) facultatif.",
     url_example="https://portainer.lan:9443")
_reg("grafana", "Grafana", auth_fields=("token",),
     auth_hint="Aucune authentification requise, sauf si la version est masquée aux anonymes : "
               "token de compte de service (lecture).",
     url_example="https://grafana.lan:3000")
_reg("argocd", "Argo CD", auth_fields=("token",),
     auth_hint="Aucune authentification requise (endpoint public).", url_example="https://argocd.lan")
_reg("wikijs", "Wiki.js", auth_fields=("token",), auth_required=True,
     auth_hint="Clé API Wiki.js avec droit de lecture système (obligatoire : GraphQL system.info).",
     url_example="http://wiki.lan:3000")
_reg("gitea", "Gitea", auth_fields=("token",),
     auth_hint="Aucune authentification requise, sauf si REQUIRE_SIGNIN_VIEW est activé : token d'accès.",
     url_example="http://gitea.lan:3000")
_reg("opensearch", "OpenSearch", auth_fields=("username", "password"), auth_required=True,
     auth_hint="Utilisateur + mot de passe (compte en lecture) si le plugin de sécurité est activé.",
     url_example="https://opensearch.lan:9200")
_reg("minio", "MinIO", auth_fields=("token",),
     auth_hint="Lecture via la métrique Prometheus : soit MINIO_PROMETHEUS_AUTH_TYPE=public côté MinIO, "
               "soit le JWT généré par `mc admin prometheus generate <alias>`.",
     url_example="http://minio.lan:9000")
_reg("proxmox", "Proxmox VE", auth_fields=("token",), auth_required=True,
     auth_hint="Token d'API au format user@realm!tokenid=<secret> (rôle PVEAuditor suffisant).",
     url_example="https://proxmox.lan:8006")
