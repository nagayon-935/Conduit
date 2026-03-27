# Conduit Vault セットアップ

HashiCorp Vault の SSH Secrets Engine を使って短命 SSH 証明書（TTL=5分）を発行します。
Vault は VM②（Conduit サーバーとは別の VM）で動かすことを想定しています。

## 概要

```
[Conduit Backend]
    │  POST /v1/ssh/sign/conduit  (公開鍵 → 署名済み証明書)
    ▼
[Vault: SSH Secrets Engine]
    │  CA 秘密鍵で署名
    ▼
[SSH Server]  ← TrustedUserCAKeys で CA 公開鍵を信頼済み
```

## ディレクトリ構成

```
docker-compose.vault.yml          # Vault コンテナ起動定義
docker/vault-prod/
├── vault.hcl                     # Vault サーバー設定
└── (vault-data/ はバインドマウント)
scripts/
├── vault-init-prod.sh            # 対話型初期化スクリプト（本番用）
└── setup-ssh-server.sh           # 接続先 SSH サーバーへの CA 鍵登録スクリプト
```

## Vault 設定（vault.hcl）

| 項目 | 設定値 |
|------|-------|
| ストレージ | ファイルベース（`/vault/data`） |
| リスナー | `0.0.0.0:8200`（TLS なし、nginx で終端） |
| Web UI | 有効（`http://<VM②IP>:8200` でアクセス可） |

## 起動

```bash
docker compose -f docker-compose.vault.yml up -d
```

ヘルスチェック：`vault status` の終了コードが `1`（接続エラー）でなければ healthy 扱い。
終了コード `2`（未初期化 / Sealed）は起動直後に想定されるため、healthy として扱います。

## 初期化（初回のみ）

```bash
bash scripts/vault-init-prod.sh
```

スクリプトが対話形式で以下を実行します：

| ステップ | 内容 |
|---------|------|
| 1 | Vault の起動確認 |
| 2 | `vault operator init`（Unseal Keys × 5 + Root Token を生成） |
| 3 | `vault operator unseal`（Unseal Keys を 3 つ入力） |
| 4 | Root Token でログイン |
| 5 | SSH Secrets Engine の有効化・CA 生成・`conduit` ロール作成 |
| 6 | 最小権限ポリシー作成 + Conduit 専用トークン発行 |

> ⚠️ Step 2 で生成された Unseal Keys と Root Token は `/tmp/vault-init-keys.txt` に保存されます。
> 安全な場所に移動してください。**再表示はできません。**

スクリプト終了後に出力される `VAULT_TOKEN` を VM① の `.env.prod` に設定します。

## conduit ロールの設定内容

```json
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
```

- 証明書 TTL は **5分**（再接続はグレース期間内に同じトークンで行う）
- `allowed_users: "*"` — 任意のユーザー名で証明書を発行可能

## Conduit 専用ポリシー

最小権限の原則に基づき、SSH 署名エンドポイントのみを許可します：

```hcl
path "ssh/sign/conduit" {
  capabilities = ["create", "update"]
}
```

## 再起動後の Unseal

VM を再起動すると Vault は Sealed 状態になります。3つの Unseal Key で解除します：

```bash
# Sealed 状態の確認
docker exec conduit-vault vault status -address=http://127.0.0.1:8200

# Unseal（3回実行）
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 conduit-vault vault operator unseal
```

## 接続先 SSH サーバーへの CA 公開鍵登録

Conduit から証明書認証で接続したい SSH サーバーで実行します：

```bash
bash scripts/setup-ssh-server.sh http://<VaultのIP>:8200
```

スクリプトが行うこと：
1. Vault から CA 公開鍵を取得（`GET /v1/ssh/public_key`）
2. `/etc/ssh/trusted-ca.pub` に保存
3. `/etc/ssh/sshd_config` に `TrustedUserCAKeys /etc/ssh/trusted-ca.pub` を追記
4. `sudo systemctl reload ssh`

## ファイアウォール設定

Vault ポート（8200）はラボ内ネットワークからのみアクセスできるよう制限することを推奨します：

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8200
sudo ufw deny 8200
sudo ufw enable
```

## トラブルシューティング

### Vault コンテナが unhealthy

```bash
docker compose -f docker-compose.vault.yml logs vault
docker exec conduit-vault vault status -address=http://127.0.0.1:8200
```

### SSH 署名エラー（Unknown role）

```bash
# ロールの確認
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN=<root_token> \
  conduit-vault vault read ssh/roles/conduit
```

### Vault が Sealed

```bash
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 conduit-vault vault operator unseal  # ×3
```
