#!/bin/bash
# Vault 自動 Unseal スクリプト
# systemd サービスから呼び出されます。
# /etc/vault/unseal-keys に Unseal Key を1行1つで保存してください。

set -e

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
KEYS_FILE="/etc/vault/unseal-keys"
MAX_WAIT=60   # Vault 起動を最大60秒待つ

# ── キーファイルの確認 ────────────────────────────────────────────────────
if [ ! -f "${KEYS_FILE}" ]; then
  echo "[auto-unseal] ERROR: キーファイルが見つかりません: ${KEYS_FILE}"
  echo "  vault-auto-unseal-setup.sh を実行してセットアップしてください。"
  exit 1
fi

# ── Vault の起動を待機 ────────────────────────────────────────────────────
echo "[auto-unseal] Vault の起動を待機中 (最大 ${MAX_WAIT}s)..."
elapsed=0
until curl -s "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1; do
  if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
    echo "[auto-unseal] ERROR: Vault が ${MAX_WAIT}s 以内に起動しませんでした。"
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "[auto-unseal] Vault が起動しています。"

# ── Sealed 状態の確認 ─────────────────────────────────────────────────────
SEALED=$(curl -sf "${VAULT_ADDR}/v1/sys/health" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('sealed', True))" 2>/dev/null \
  || echo "true")

if [ "${SEALED}" = "False" ] || [ "${SEALED}" = "false" ]; then
  echo "[auto-unseal] Vault はすでに Unseal 済みです。スキップします。"
  exit 0
fi

# ── Unseal の実行 ─────────────────────────────────────────────────────────
echo "[auto-unseal] Vault を Unseal します..."
count=0
while IFS= read -r key || [ -n "${key}" ]; do
  # 空行・コメント行をスキップ
  [[ -z "${key}" || "${key}" == \#* ]] && continue
  docker exec -e VAULT_ADDR=http://127.0.0.1:8200 conduit-vault \
    vault operator unseal "${key}" > /dev/null
  count=$((count + 1))
done < "${KEYS_FILE}"

echo "[auto-unseal] ${count} つのキーで Unseal を実行しました。"

# ── 結果確認 ─────────────────────────────────────────────────────────────
sleep 1
SEALED_AFTER=$(curl -sf "${VAULT_ADDR}/v1/sys/health" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('sealed', True))" 2>/dev/null \
  || echo "true")

if [ "${SEALED_AFTER}" = "False" ] || [ "${SEALED_AFTER}" = "false" ]; then
  echo "[auto-unseal] Unseal 成功。Vault は正常に動作しています。"
else
  echo "[auto-unseal] ERROR: Unseal 後も Vault が Sealed 状態です。キーを確認してください。"
  exit 1
fi
