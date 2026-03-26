#!/bin/sh
set -e

echo "==> Waiting for Vault to be ready..."
until vault status -address="${VAULT_ADDR}" > /dev/null 2>&1; do
  sleep 1
done

echo "==> Enabling SSH Secrets Engine..."
vault secrets enable -path=ssh ssh || echo "(already enabled)"

echo "==> Generating SSH CA key pair..."
vault write -f ssh/config/ca || echo "(CA already configured)"

echo "==> Creating 'conduit' signing role..."
vault write ssh/roles/conduit \
  key_type=ca \
  allowed_users="*" \
  default_user="conduit" \
  ttl=5m \
  max_ttl=10m \
  default_extensions='{"permit-pty":"","permit-user-rc":""}' \
  allow_user_certificates=true

echo "==> Vault SSH init complete."
echo "    Role 'conduit' is ready at: ${VAULT_ADDR}/v1/ssh/sign/conduit"
