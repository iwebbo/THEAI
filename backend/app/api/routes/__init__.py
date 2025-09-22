# Ce fichier permet à Python de reconnaître le répertoire comme un package
# Utilisation d'une importation relative
from .server import router as servers_router

# Exporter le routeur des serveurs
server = servers_router