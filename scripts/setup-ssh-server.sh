#!/bin/bash
# SSH サーバー側セットアップスクリプト
# Vault CA 公開鍵を取得して sshd_config に登録します
#
# 使い方:
#   bash setup-ssh-server.sh <VAULT_ADDR>
#   例: bash setup-ssh-server.sh http://10.70.71.241:8200

set -e

VAULT_ADDR="${1:-}"

# ── 引数チェック ──────────────────────────────────────────────────────────────
if [ -z "${VAULT_ADDR}" ]; then
  echo "使い方: bash $0 <VAULT_ADDR>"
  echo "  例:  bash $0 http://10.70.71.241:8200"
  exit 1
fi

echo "======================================================"
echo " Conduit - SSH サーバーセットアップスクリプト"
echo " VAULT_ADDR: ${VAULT_ADDR}"
echo "======================================================"
echo ""

# ── Step 1: Vault への疎通確認 ────────────────────────────────────────────────
echo "[1/3] Vault への疎通を確認中..."
if ! curl -sf "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1; then
  echo "  エラー: ${VAULT_ADDR} に接続できません。"
  echo "  Vault が起動しているか、ファイアウォール設定を確認してください。"
  exit 1
fi
echo "  Vault に接続できました。"
echo ""

# ── Step 2: CA 公開鍵の取得と配置 ────────────────────────────────────────────
echo "[2/3] Vault から CA 公開鍵を取得して /etc/ssh/trusted-ca.pub に配置します..."
CA_PUB=$(curl -sf "${VAULT_ADDR}/v1/ssh/public_key")
if [ -z "${CA_PUB}" ]; then
  echo "  エラー: CA 公開鍵を取得できませんでした。"
  echo "  Vault SSH Secrets Engine が有効になっているか確認してください。"
  exit 1
fi
echo "${CA_PUB}" | sudo tee /etc/ssh/trusted-ca.pub > /dev/null
echo "  CA 公開鍵を /etc/ssh/trusted-ca.pub に保存しました。"
echo ""

# ── Step 3: sshd_config への追記 ─────────────────────────────────────────────
echo "[3/3] sshd_config に TrustedUserCAKeys を設定します..."
SSHD_CONFIG="/etc/ssh/sshd_config"

if grep -q "TrustedUserCAKeys" "${SSHD_CONFIG}"; then
  echo "  TrustedUserCAKeys はすでに設定されています。上書きします..."
  sudo sed -i 's|.*TrustedUserCAKeys.*|TrustedUserCAKeys /etc/ssh/trusted-ca.pub|' "${SSHD_CONFIG}"
else
  echo "TrustedUserCAKeys /etc/ssh/trusted-ca.pub" | sudo tee -a "${SSHD_CONFIG}" > /dev/null
fi
echo "  sshd_config に設定を追加しました。"

# sshd を再読み込み
sudo systemctl reload sshd
echo "  sshd を再読み込みしました。"
echo ""

echo "======================================================"
echo " セットアップ完了！"
echo "======================================================"
echo ""
echo " このサーバーへの接続に使用するユーザーが存在するか確認してください:"
echo "   id <ユーザー名>"
echo ""
echo " 存在しない場合は作成してください:"
echo "   sudo useradd -m <ユーザー名>"
echo ""
