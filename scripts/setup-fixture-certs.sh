#!/usr/bin/env bash
# Generates the TLS cert the https fixture server uses (test-fixtures/.certs/,
# git-ignored). The cross-origin fixture must be served over https: Firefox's
# default MV3 extension CSP includes upgrade-insecure-requests, which rewrites
# the background's http:// re-fetches to https — a plain-http fixture host can
# never answer those. Idempotent: skips generation when the cert already exists.
set -euo pipefail

cd "$(dirname "$0")/.."

CERT_DIR="test-fixtures/.certs"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"

if [[ -f "$CERT" && -f "$KEY" ]]; then
  echo "fixture certs already present in $CERT_DIR"
  exit 0
fi

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required (brew install mkcert nss && mkcert -install)" >&2
  exit 1
fi

mkdir -p "$CERT_DIR"
mkcert -cert-file "$CERT" -key-file "$KEY" \
  ctm-page.test ctm-files.test files.lvh.me localhost 127.0.0.1

echo "wrote $CERT and $KEY"
echo "If Firefox doesn't trust the cert, run: mkcert -install (needs nss/certutil)"
