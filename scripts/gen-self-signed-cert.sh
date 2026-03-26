#!/bin/bash
# 自己署名 TLS 証明書の生成スクリプト
# 使い方: bash scripts/gen-self-signed-cert.sh
# 生成先: nginx/certs/server.crt, nginx/certs/server.key

set -e

CERTS_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "${CERTS_DIR}"

# VM の IP またはホスト名を取得（引数で上書き可能）
SERVER_IP="${1:-$(hostname -I | awk '{print $1}')}"

echo "================================================"
echo " 自己署名証明書を生成します"
echo " 対象: ${SERVER_IP}"
echo " 出力: nginx/certs/server.{crt,key}"
echo "================================================"

openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout "${CERTS_DIR}/server.key" \
  -out    "${CERTS_DIR}/server.crt" \
  -subj   "/CN=${SERVER_IP}" \
  -addext "subjectAltName=IP:${SERVER_IP}"

echo ""
echo "証明書を生成しました:"
echo "  ${CERTS_DIR}/server.crt"
echo "  ${CERTS_DIR}/server.key"
echo ""
echo "ブラウザでアクセスする際は証明書の警告が出ますが、"
echo "「詳細設定」→「続行」で進めてください（内部ネットワーク用のため）。"
