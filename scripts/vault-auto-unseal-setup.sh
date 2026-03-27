#!/bin/bash
# Vault 自動 Unseal セットアップスクリプト
# このスクリプトを VM② (Vault サーバー) で root または sudo で実行してください。

set -e

KEYS_FILE="/var/tmp/unseal-keys"
SERVICE_NAME="vault-auto-unseal"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNSEAL_SCRIPT="/usr/local/bin/vault-auto-unseal.sh"

echo "=== Vault 自動 Unseal セットアップ ==="
echo ""

# ── root チェック ──────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: このスクリプトは sudo または root で実行してください。"
  exit 1
fi

# ── Unseal キーの入力 ──────────────────────────────────────────────────────
echo "Vault の Unseal Key を入力してください（通常 3 つ必要です）。"
echo "入力し終わったら空行を送信してください。"
echo ""

rm -f "${KEYS_FILE}"
touch "${KEYS_FILE}"
chmod 600 "${KEYS_FILE}"

count=0
while true; do
  read -rsp "Unseal Key $((count + 1)) (空行で終了): " key
  echo ""
  if [ -z "${key}" ]; then
    if [ "${count}" -eq 0 ]; then
      echo "ERROR: 少なくとも 1 つのキーを入力してください。"
      exit 1
    fi
    break
  fi
  echo "${key}" >> "${KEYS_FILE}"
  count=$((count + 1))
done

echo "${count} つのキーを ${KEYS_FILE} に保存しました。"
echo ""

# ── unseal スクリプトをコピー ─────────────────────────────────────────────
cp "${SCRIPT_DIR}/vault-auto-unseal.sh" "${UNSEAL_SCRIPT}"
chmod 750 "${UNSEAL_SCRIPT}"
echo "Unseal スクリプトを ${UNSEAL_SCRIPT} に配置しました。"

# ── systemd サービスを作成 ────────────────────────────────────────────────
cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOF'
[Unit]
Description=Vault Auto Unseal
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/vault-auto-unseal.sh
RemainAfterExit=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "systemd サービスを作成しました。"

# ── systemd タイマーを作成（Docker 起動後 30 秒待ってから実行）──────────────
cat > /etc/systemd/system/${SERVICE_NAME}.timer << 'EOF'
[Unit]
Description=Run Vault Auto Unseal on boot
After=docker.service

[Timer]
OnBootSec=30s
Unit=vault-auto-unseal.service

[Install]
WantedBy=timers.target
EOF

echo "systemd タイマーを作成しました。"

# ── 有効化・起動 ──────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}.timer
systemctl start ${SERVICE_NAME}.timer

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "VM 再起動後、Vault は自動的に Unseal されます。"
echo ""
echo "手動で今すぐ Unseal する場合:"
echo "  sudo systemctl start ${SERVICE_NAME}.service"
echo ""
echo "ログを確認する場合:"
echo "  journalctl -u ${SERVICE_NAME}.service -f"
echo ""
echo "タイマーの状態を確認する場合:"
echo "  systemctl status ${SERVICE_NAME}.timer"
echo ""
echo "⚠️  ${KEYS_FILE} には Unseal Key が平文で保存されています。"
echo "   このファイルのアクセス権は root のみ (600) に制限されています。"
echo "   本番環境では HashiCorp Vault Auto Unseal (KMS) の使用を検討してください。"
