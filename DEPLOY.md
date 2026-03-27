# Conduit デプロイ手順

> ⚠️ **開発中 / 動作未検証** — 本番運用は自己責任でお願いします。

## 構成概要

```
[ブラウザ]
    ↓ HTTPS (443)
[VM① Ubuntu 24.04]        [VM② Ubuntu 24.04]
  nginx (TLS終端)    ←→    Vault (8200)
  Conduit backend           ラボ内ネットワークのみ
  frontend (静的配信)
    ↓ SSH (22)
[接続先 SSH サーバー群]
```

---

## 前提条件

両 VM に共通で必要なもの:

```bash
# Docker + Docker Compose のインストール
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
# 一度ログアウト・ログインして docker グループを反映
```

---

## VM② — Vault サーバーのセットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/nagayon-935/Conduit.git
cd Conduit
```

### 2. vault-data ディレクトリのパーミッションを設定

Vault コンテナは UID 100 (vault ユーザー) で動作します。ホスト側のデータディレクトリの所有者を合わせておかないと起動に失敗します。

```bash
sudo chown -R 100:100 ~/conduit/vault-data
```

> `docker logs conduit-vault` に `permission denied` が出る場合はこの手順が抜けています。

### 3. Vault を起動

```bash
docker compose -f docker-compose.vault.yml up -d
```

起動を確認:

```bash
docker logs -f conduit-vault
# "==> Vault server started!" が表示されたら OK（Ctrl+C で抜ける）
```

### 4. Vault を初期化

```bash
bash scripts/vault-init-prod.sh
```

スクリプトが対話的に以下を実行します:
1. Vault の初期化（Unseal Keys x5 + Root Token を生成）
2. **Unseal Keys と Root Token を安全な場所に保存してください（再表示不可）**
3. Unseal（3つのキーを入力）
4. SSH Secrets Engine の有効化・CA 生成・ロール作成
5. Conduit 専用トークンの発行

スクリプト終了後に表示される `VAULT_TOKEN` の値を控えておいてください。

### 5. 自動 Unseal のセットアップ（推奨）

VM 再起動後に自動で Unseal されるよう設定します:

```bash
sudo bash scripts/vault-auto-unseal-setup.sh
```

手順 4 で控えた Unseal Key を入力します（通常 3 つ）。

### 6. ファイアウォール設定

Vault はラボ内ネットワークのみアクセスできるように制限します:

```bash
# Vault ポートをラボ内ネットワーク (例: 192.168.1.0/24) のみに制限
sudo ufw allow from 192.168.1.0/24 to any port 8200
sudo ufw deny 8200
sudo ufw enable
```

---

## SSH サーバー側の設定（各接続先サーバー）

### 1. Vault CA 公開鍵を取得

```bash
curl http://<VM②のIP>:8200/v1/ssh/public_key
```

### 2. 公開鍵を SSH サーバーに追加

各接続先 SSH サーバーで以下を実行:

```bash
# CA 公開鍵を保存
curl http://<VM②のIP>:8200/v1/ssh/public_key \
  | sudo tee /etc/ssh/trusted-ca.pub

# sshd_config に TrustedUserCAKeys を追加
echo "TrustedUserCAKeys /etc/ssh/trusted-ca.pub" \
  | sudo tee -a /etc/ssh/sshd_config

# ssh を再読み込み
sudo systemctl reload ssh
```

### 3. 接続ユーザーの確認

Conduit から証明書認証でログインするユーザーが存在することを確認:

```bash
# 例: ubuntu ユーザーで接続する場合
id ubuntu  # ユーザーが存在するか確認
```

---

## VM① — Conduit サーバーのセットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/nagayon-935/Conduit.git
cd Conduit
```

### 2. フロントエンドをビルド

```bash
cd frontend
npm install
npm run build
cd ..
```

ビルド成果物が `frontend/dist/` に生成されます。

### 3. 自己署名 TLS 証明書を生成

```bash
bash scripts/gen-self-signed-cert.sh
# VM① の IP を指定する場合:
# bash scripts/gen-self-signed-cert.sh 192.168.1.100
```

### 4. 環境変数ファイルを作成

```bash
cp .env.prod.example .env.prod
```

`.env.prod` を編集して実際の値を設定:

```bash
VAULT_ADDR=http://<VM②のIP>:8200
VAULT_TOKEN=<vault-init-prod.sh で発行されたトークン>
VAULT_SSH_ROLE=conduit
VAULT_SSH_MOUNT=ssh
SERVER_ADDR=:8080
GRACE_PERIOD=15m
SESSION_GC_INTERVAL=1m
```

### 5. Conduit を起動

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 6. 動作確認

```bash
# ヘルスチェック
curl -k https://localhost/healthz

# ログ確認
docker compose -f docker-compose.prod.yml logs -f
```

ブラウザで `https://<VM①のIP>` を開いてください。
自己署名証明書の警告が出た場合は「詳細設定」→「続行」で進めてください。

---

## 接続方法

ブラウザで `https://<VM①のIP>` を開き、以下を入力:

| 項目 | 値 |
|------|-----|
| Host | 接続先 SSH サーバーのホスト名または IP |
| Port | 22 |
| User | ログインするユーザー名 |

---

## 起動・停止・再起動

```bash
# VM②（Vault）
docker compose -f docker-compose.vault.yml start   # 起動
docker compose -f docker-compose.vault.yml stop    # 停止

# VM①（Conduit）
docker compose -f docker-compose.prod.yml start    # 起動
docker compose -f docker-compose.prod.yml stop     # 停止
docker compose -f docker-compose.prod.yml restart  # 再起動
```

### Vault の自動 Unseal（VM 再起動後）

VM を再起動すると Vault が Sealed 状態になります。自動 Unseal を設定することで、再起動後も自動的に Unseal されます。

#### 自動 Unseal のセットアップ（初回のみ・VM② で実行）

```bash
# VM② (Vault サーバー) で root / sudo 実行
sudo bash scripts/vault-auto-unseal-setup.sh
```

スクリプトが対話的に以下を行います:
1. Unseal Key を入力（通常 3 つ）→ リポジトリ内 `unseal-keys` に保存（root のみ読み取り可・mode 600）
2. `/usr/local/bin/vault-auto-unseal.sh` を配置
3. systemd サービス + タイマーを作成・有効化（VM 起動 30 秒後に自動実行）

セットアップ後は VM を再起動するだけで Vault が自動的に Unseal されます。

```bash
# ログ確認
journalctl -u vault-auto-unseal.service -f

# 手動で今すぐ Unseal
sudo systemctl start vault-auto-unseal.service

# タイマー状態確認
systemctl status vault-auto-unseal.timer
```

> ⚠️ Unseal Key はリポジトリ内 `unseal-keys` に平文で保存されます（`.gitignore` 済み）。本番環境では
> [HashiCorp Vault Auto Unseal (Transit/KMS)](https://developer.hashicorp.com/vault/docs/configuration/seal) の利用を推奨します。

#### 手動 Unseal（自動 Unseal を設定していない場合）

```bash
docker exec conduit-vault vault operator unseal  # ×3回（Unseal Keys を使用）
```

---

## アップデート

```bash
# リポジトリを更新
git pull

# VM②（Vault）
docker compose -f docker-compose.vault.yml pull
docker compose -f docker-compose.vault.yml up -d

# VM①（Conduit）
cd frontend && npm install && npm run build && cd ..
docker compose -f docker-compose.prod.yml up -d --build
```

---

## トラブルシューティング

### Vault が起動しない（permission denied）

`docker logs conduit-vault` に以下が出る場合:

```
storage migration check error: error="open /vault/data/core/_migration: permission denied"
```

vault-data ディレクトリの所有者が合っていません:

```bash
docker compose -f docker-compose.vault.yml down
sudo chown -R 100:100 ~/conduit/vault-data
docker compose -f docker-compose.vault.yml up -d
```

### Vault の再初期化（データを完全にリセットする場合）

```bash
# 1. コンテナとボリュームを削除
docker compose -f docker-compose.vault.yml down -v

# 2. vault-data を削除して再作成
sudo rm -rf ~/conduit/vault-data
mkdir -p ~/conduit/vault-data
sudo chown -R 100:100 ~/conduit/vault-data

# 3. 起動
docker compose -f docker-compose.vault.yml up -d

# 4. 起動確認（"Vault server started!" が出るまで待つ）
docker logs -f conduit-vault

# 5. 初期化
bash scripts/vault-init-prod.sh

# 6. 自動 Unseal の再セットアップ
sudo bash scripts/vault-auto-unseal-setup.sh
```

> ⚠️ 再初期化すると CA が再生成されます。接続先 SSH サーバーの `/etc/ssh/trusted-ca.pub` も更新が必要です。

### vault-init-prod.sh が "Vault が起動していません" でループする

Vault がまだポート 8200 でリッスンしていません。ログを確認してから再実行してください:

```bash
docker logs conduit-vault          # エラーがないか確認
curl http://localhost:8200/v1/sys/health  # 応答があれば起動済み
bash scripts/vault-init-prod.sh
```

### Vault が Sealed

```bash
docker exec conduit-vault vault status
docker exec conduit-vault vault operator unseal  # ×3回
```

自動 Unseal が設定済みの場合は以下でも可:

```bash
sudo systemctl start vault-auto-unseal.service
```

### 502 Bad Gateway

Conduit バックエンドが起動していない可能性があります:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

### SSH connection failed

1. Vault が Unseal されているか確認: `curl http://<VM②のIP>:8200/v1/sys/health`
2. SSH サーバーに CA 公開鍵が設定されているか確認
3. 接続ユーザーが SSH サーバーに存在するか確認
