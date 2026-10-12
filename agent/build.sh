#!/bin/sh
# Usage : VERSION=1.0.0 TARGETS="linux/amd64 windows/amd64" ./build.sh [dossier_sortie]
set -eu
OUT="${1:-dist}"
VERSION="${VERSION:-dev}"
TARGETS="${TARGETS:-linux/amd64 linux/arm64 linux/arm linux/ppc64le windows/amd64 windows/arm64 aix/ppc64 freebsd/amd64 solaris/amd64 darwin/amd64 darwin/arm64}"

mkdir -p "$OUT"
for t in $TARGETS; do
  os="${t%/*}"
  arch="${t#*/}"
  ext=""
  [ "$os" = "windows" ] && ext=".exe"
  name="theai-agent-$os-$arch$ext"
  echo "==> $name"
  GOOS="$os" GOARCH="$arch" GOARM=7 CGO_ENABLED=0 \
    go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$OUT/$name" .
done
( cd "$OUT" && sha256sum theai-agent-* > SHA256SUMS )
echo "OK -> $OUT"
