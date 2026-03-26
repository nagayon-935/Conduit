#!/bin/bash
set -e

echo "==> Fetching Vault CA public key from ${VAULT_ADDR}..."
until curl -sf "${VAULT_ADDR}/v1/ssh/public_key" -o /etc/ssh/trusted-ca.pub; do
  echo "    Vault not ready, retrying in 2s..."
  sleep 2
done

echo "==> Trusted CA key:"
cat /etc/ssh/trusted-ca.pub

# ホスト鍵を生成（未生成の場合）
ssh-keygen -A

echo "==> Starting sshd..."
exec /usr/sbin/sshd -D -e
