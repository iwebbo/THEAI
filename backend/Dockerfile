FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    iputils-ping \
    net-tools \
    dnsutils \
    curl \
    wget \
    nmap \
    netcat-traditional \
    openssl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ./app .

RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

RUN setcap cap_net_raw+ep /usr/bin/nmap || true
RUN setcap cap_net_raw+ep /bin/ping || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]