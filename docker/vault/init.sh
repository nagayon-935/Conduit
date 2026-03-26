#!/bin/sh
set -e

echo "==> Waiting for Vault to be ready..."
until vault status -address="${VAULT_ADDR}" > /dev/null 2>&1; do
  sleep 1
done

echo "==> Enabling SSH Secrets Engine..."
vault secrets enable -path=ssh ssh || echo "(already enabled, skipping)"

echo "==> Generating SSH CA key pair..."
vault write -f ssh/config/ca || echo "(CA already configured, skipping)"

echo "==> Creating 'conduit' signing role..."
# default_extensions はマップ型なので JSON stdin で渡す
vault write ssh/roles/conduit - <<'JSON'
{
  "key_type": "ca",
  "allow_user_certificates": true,
  "allowed_users": "*",
  "default_user": "conduit",
  "ttl": "5m",
  "max_ttl": "10m",
  "default_extensions": {
    "permit-pty": "",
    "permit-user-rc": ""
  }
}
JSON

echo "==> Vault SSH init complete."
echo "    Role 'conduit' is ready at: ${VAULT_ADDR}/v1/ssh/sign/conduit"
