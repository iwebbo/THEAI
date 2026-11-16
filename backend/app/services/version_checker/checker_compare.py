"""Comparaison version installée / version publiée."""
from __future__ import annotations

from typing import Dict, Optional, Tuple

from .checker_common import AHEAD, BEHIND, MAJOR_BEHIND, MINOR_BEHIND, PATCH_BEHIND, UNKNOWN, UP_TO_DATE

Key = Tuple[int, int, int]


def version_key(version: str) -> Optional[Key]:
    """'2.5.314' -> (2, 5, 314) ; '2.575' -> (2, 575, 0) ; MinIO RELEASE.<date> -> None."""
    try:
        parts = [int(p) for p in version.split(".")]
    except ValueError:
        return None
    if not parts or len(parts) > 3:
        return None
    return tuple(parts + [0] * (3 - len(parts)))  # type: ignore[return-value]


def major_of(version: str) -> Optional[int]:
    k = version_key(version)
    return k[0] if k else None


def max_by_major(versions) -> Dict[int, str]:
    """Plus haute version de chaque majeure."""
    best: Dict[int, Tuple[Key, str]] = {}
    for v in versions:
        k = version_key(v)
        if k is None:
            continue
        if k[0] not in best or k > best[k[0]][0]:
            best[k[0]] = (k, v)
    return {m: v for m, (_, v) in best.items()}


def compare(local: Optional[str], latest: Optional[str],
            latest_by_major: Dict[int, str]) -> Tuple[str, Optional[str], Optional[str]]:
    """Retourne (statut, version_de_référence, nouvelle_majeure_disponible).

    La référence est la dernière version de la MÊME majeure que l'installé (une montée de
    majeure - Wiki.js 2 -> 3, Argo CD 2 -> 3 - est une migration, pas une mise à jour) ;
    la majeure supérieure éventuelle est signalée à part dans `new_major`."""
    if not local or not latest:
        return UNKNOWN, latest, None

    lk = version_key(local)
    if lk is None:  # non numérique : comparaison lexicographique (RELEASE.<date> est triable)
        if local == latest:
            return UP_TO_DATE, latest, None
        return (BEHIND if local < latest else AHEAD), latest, None

    target = latest_by_major.get(lk[0], latest if major_of(latest) == lk[0] else None)
    new_major = None
    top = version_key(latest)
    if top and top[0] > lk[0]:
        new_major = latest
    if target is None:  # aucune publication dans la majeure installée
        return (AHEAD if top and top[0] < lk[0] else MAJOR_BEHIND), latest, new_major

    tk = version_key(target)
    assert tk is not None
    if lk == tk:
        status = UP_TO_DATE
    elif lk > tk:
        status = AHEAD
    elif lk[1] < tk[1]:
        status = MINOR_BEHIND
    else:
        status = PATCH_BEHIND
    return status, target, new_major
