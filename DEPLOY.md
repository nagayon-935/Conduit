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

### 2. Vault を起動

```bash
docker compose -f docker-compose.vault.yml up -d
```

### 3. Vault を初期化

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

### 4. ファイアウォール設定

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

# sshd を再読み込み
sudo systemctl reload sshd
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
# ※ 再起動後は Vault を手動で Unseal する必要があります

# VM①（Conduit）
docker compose -f docker-compose.prod.yml start    # 起動
docker compose -f docker-compose.prod.yml stop     # 停止
docker compose -f docker-compose.prod.yml restart  # 再起動
```

### Vault の Unseal（VM 再起動後）

VM を再起動すると Vault が Sealed 状態になります。以下で Unseal:

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

### 502 Bad Gateway

Conduit バックエンドが起動していない可能性があります:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

### SSH connection failed

1. Vault が Unseal されているか確認: `curl http://<VM②のIP>:8200/v1/sys/health`
2. SSH サーバーに CA 公開鍵が設定されているか確認
3. 接続ユーザーが SSH サーバーに存在するか確認

### Vault が Sealed

```bash
docker exec conduit-vault vault status
docker exec conduit-vault vault operator unseal  # ×3回
```
