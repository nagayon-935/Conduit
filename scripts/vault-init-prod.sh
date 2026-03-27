#!/bin/bash
# Vault 本番初期化スクリプト
# 使い方: bash scripts/vault-init-prod.sh
# 前提: VM② で Vault コンテナが起動済みであること

set -e

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"

echo "======================================================"
echo " Conduit - Vault 本番初期化スクリプト"
echo " VAULT_ADDR: ${VAULT_ADDR}"
echo "======================================================"
echo ""

# ── Step 1: Vault の起動確認 ───────────────────────────────────────────────
echo "[1/6] Vault の起動を確認中..."
until curl -s "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1; do
  echo "  Vault が起動していません。5秒後にリトライします..."
  sleep 5
done
echo "  Vault が起動しています。"
echo ""

# ── Step 2: 初期化 ─────────────────────────────────────────────────────────
echo "[2/6] Vault を初期化します..."
echo "  ※ すでに初期化済みの場合はスキップされます"
echo ""

INIT_STATUS=$(curl -sf "${VAULT_ADDR}/v1/sys/init" | python3 -c "import sys,json; print(json.load(sys.stdin)['initialized'])" 2>/dev/null || echo "false")

if [ "${INIT_STATUS}" = "True" ] || [ "${INIT_STATUS}" = "true" ]; then
  echo "  Vault はすでに初期化済みです。"
else
  echo "  初期化を実行します（unseal キー x5 と root トークンが生成されます）"
  echo ""
  docker exec -e VAULT_ADDR=http://127.0.0.1:8200 conduit-vault vault operator init | tee /tmp/vault-init-keys.txt
  echo ""
  echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  !! 上記の Unseal Keys と Root Token を安全な場所に   !!"
  echo "  !! 必ず保存してください。再表示はできません。        !!"
  echo "  !! 保存先: /tmp/vault-init-keys.txt （要移動）       !!"
  echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  echo "  初期化が完了しました。次のステップに進む前に:"
  echo "  1. /tmp/vault-init-keys.txt を安全な場所にコピーしてください"
  echo "  2. Vault を Unseal してください（下記 Step 3）"
  echo ""
  read -p "  /tmp/vault-init-keys.txt を保存しましたか？ [y/N]: " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    echo "  中断します。キーを保存してから再実行してください。"
    exit 1
  fi
fi

# ── Step 3: Unseal ─────────────────────────────────────────────────────────
echo "[3/6] Vault を Unseal します..."
SEALED=$(curl -sf "${VAULT_ADDR}/v1/sys/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sealed', True))" 2>/dev/null || echo "true")

if [ "${SEALED}" = "False" ] || [ "${SEALED}" = "false" ]; then
  echo "  Vault はすでに Unseal 済みです。"
else
  echo "  Unseal キーを3つ入力してください（/tmp/vault-init-keys.txt から確認）"
  for i in 1 2 3; do
    read -sp "  Unseal Key ${i}: " key
    echo ""
    docker exec -e VAULT_ADDR=http://127.0.0.1:8200 conduit-vault vault operator unseal "${key}"
  done
fi
echo ""

# ── Step 4: ログイン ───────────────────────────────────────────────────────
echo "[4/6] Root トークンでログインします..."
read -sp "  Root Token: " root_token
echo ""
export VAULT_TOKEN="${root_token}"
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault vault login "${root_token}" > /dev/null
echo "  ログイン成功"
echo ""

# ── Step 5: SSH Secrets Engine の設定 ─────────────────────────────────────
echo "[5/6] SSH Secrets Engine を設定します..."

docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault \
  vault secrets enable -path=ssh ssh 2>/dev/null || echo "  (SSH engine はすでに有効です)"

docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault \
  vault write -f ssh/config/ca 2>/dev/null || echo "  (CA はすでに設定済みです)"

docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault \
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

echo "  SSH Secrets Engine の設定が完了しました"
echo ""

# ── Step 6: Conduit 専用ポリシー＆トークンの作成 ───────────────────────────
echo "[6/6] Conduit 専用トークンを作成します..."

# 最小権限ポリシー（SSH 署名のみ許可）
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault \
  vault policy write conduit - <<'POLICY'
path "ssh/sign/conduit" {
  capabilities = ["create", "update"]
}
POLICY

# 有効期限なし・定期更新トークンを作成
CONDUIT_TOKEN=$(docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${root_token}" conduit-vault \
  vault token create \
  -policy=conduit \
  -display-name=conduit \
  -no-default-policy \
  -format=json | python3 -c "import sys,json; print(json.load(sys.stdin)['auth']['client_token'])")

echo ""
echo "======================================================"
echo " 初期化完了！"
echo "======================================================"
echo ""
echo " VM①（Conduit サーバー）の .env.prod に以下を設定してください:"
echo ""
echo "   VAULT_ADDR=http://$(hostname -I | awk '{print $1}'):8200"
echo "   VAULT_TOKEN=${CONDUIT_TOKEN}"
echo "   VAULT_SSH_ROLE=conduit"
echo "   VAULT_SSH_MOUNT=ssh"
echo ""
echo " 接続先 SSH サーバーへの CA 公開鍵の設定も忘れずに（DEPLOY.md 参照）"
echo ""

# CA 公開鍵を表示
echo " ── SSH サーバーに設定する CA 公開鍵 ──"
curl -sf "${VAULT_ADDR}/v1/ssh/public_key"
echo ""
