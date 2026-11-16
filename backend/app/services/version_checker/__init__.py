"""Version checker THEAI : versions installées (local) vs versions officielles (remote).

Modules (préfixe checker_ pour s'y retrouver) :
  checker_common    statuts, dataclasses, normalisation, TLS
  checker_local     providers : lecture de la version installée de chaque application
  checker_upstream  sources officielles de la dernière version (avec repli et cache)
  checker_compare   comparaison installé / publié
  checker_registry  registre des types d'applications (ajouter une app = 3 étapes, voir le fichier)
  checker_crypto    chiffrement des tokens / mots de passe en base
  checker_config    variables d'environnement VERSION_CHECKER_*
  checker_service   orchestration + accès base (CRUD cibles, run_target, run_all, purge)
"""
