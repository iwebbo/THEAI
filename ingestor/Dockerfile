FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .

# Le touch force des dates de modification recentes sur les fichiers installes :
# kaniko (snapshot par mtime) peut sinon les omettre de la couche (ModuleNotFoundError au runtime).
# L'import final fait echouer le build si une dependance manque.
RUN pip install --no-cache-dir -r requirements.txt \
    && find /usr/local/lib/python3.11/site-packages -type f -exec touch {} + \
    && python -c "import requests, idna, urllib3, certifi, charset_normalizer, psycopg2"

COPY ingest.py .

# Utilisateur non-root (uid 1000, comme le podSecurityContext du chart)
RUN useradd -m -u 1000 appuser
USER 1000

ENTRYPOINT ["python", "ingest.py"]
CMD ["serve"]
