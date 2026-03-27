# Conduit バックエンド

Go で実装された HTTP / WebSocket サーバーです。Vault から SSH 証明書を取得し、ブラウザと SSH サーバーの間をブリッジします。

## 技術スタック

| ライブラリ | 用途 |
|-----------|------|
| Go 1.22 | 言語 |
| `golang.org/x/crypto/ssh` | SSH クライアント・証明書認証 |
| `github.com/gorilla/websocket` | WebSocket サーバー |
| HashiCorp Vault HTTP API | SSH 証明書署名リクエスト |

## パッケージ構成

```
cmd/server/
└── main.go              # エントリポイント。依存を組み立てて HTTP サーバーを起動

internal/
├── api/
│   ├── handler.go       # Handler 構造体・ルート登録・CORS・ロギングミドルウェア
│   ├── connect.go       # POST /api/connect — 鍵生成→証明書署名→SSH 接続→セッション作成
│   ├── terminal.go      # GET /ws — WebSocket アップグレード→ PTY セットアップ→ポンプ起動
│   ├── sessions.go      # GET /api/sessions, DELETE /api/sessions/{token}
│   └── logs.go          # GET /api/logs
├── config/
│   └── config.go        # 環境変数を読み込んで Config 構造体に変換
├── session/
│   ├── session.go       # Session 構造体定義
│   ├── store.go         # インメモリセッションストア
│   └── manager.go       # セッションの作成・取得・GC（期限切れ削除）
├── sshconn/
│   ├── keygen.go        # Ed25519 鍵ペア生成
│   └── dialer.go        # SSH クライアント接続・PTY リクエスト
├── vault/
│   ├── client.go        # VaultClient インターフェース・Client 実装
│   └── certificate.go   # POST /v1/{mount}/sign/{role} で証明書署名
├── tunnel/
│   ├── pump.go          # WebSocket ↔ SSH ストリームの双方向ブリッジ
│   ├── backpressure.go  # SSH→クライアント方向のバックプレッシャー制御
│   └── pty.go           # PTY リサイズ処理
├── connlog/
│   └── store.go         # 接続ログの記録・取得（インメモリ）
└── pkg/token/
    └── token.go         # セッショントークン生成（crypto/rand ベース）
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/api/connect` | SSH 接続を確立してセッションを作成 |
| `GET` | `/ws` | WebSocket にアップグレードしてターミナルストリームを開始 |
| `GET` | `/healthz` | ヘルスチェック |
| `GET` | `/api/sessions` | アクティブセッション一覧 |
| `DELETE` | `/api/sessions/{token}` | セッションを強制終了 |
| `GET` | `/api/logs` | 接続ログ一覧 |

## 接続フロー

```
POST /api/connect
  1. Ed25519 鍵ペアを生成（メモリのみ、ディスク書き込みなし）
  2. Vault に公開鍵を送って署名済み SSH 証明書を取得（TTL=5分）
  3. 証明書 + 秘密鍵で SSH 接続を確立
  4. PTY を起動
  5. セッションID（トークン）を生成して返却

GET /ws?token=<token>
  1. WebSocket にアップグレード
  2. セッションを取得して SSH チャンネルに接続
  3. readPump: WS → SSH（バイナリ=入力、テキスト=制御メッセージ）
  4. writePump: SSH → WS（ターミナル出力）
  5. WS 切断後もセッションをグレース期間（デフォルト 15 分）保持
```

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `VAULT_ADDR` | ✅ | — | Vault サーバーのアドレス |
| `VAULT_TOKEN` | ✅ | — | Vault アクセストークン |
| `VAULT_SSH_ROLE` | ✅ | — | SSH 署名ロール名 |
| `VAULT_SSH_MOUNT` | | `ssh` | Vault SSH Secrets Engine マウントパス |
| `SERVER_ADDR` | | `:8080` | HTTP リッスンアドレス |
| `GRACE_PERIOD` | | `15m` | 切断後のセッション保持期間 |
| `SESSION_GC_INTERVAL` | | `1m` | 期限切れセッション GC 間隔 |

## 起動

```bash
# 依存パッケージ取得
go mod download

# 開発
make dev

# ビルド
make build
./conduit

# Docker
docker compose up -d --build
```

## テスト

```bash
# 全テスト（レースディテクター付き）
make test

# カバレッジ
go test -covermode=atomic -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Docker

`docker/backend/Dockerfile` はマルチステージビルドで構成されています：

1. **builder**: `golang:1.22-alpine` で `CGO_ENABLED=0` のスタティックバイナリをビルド
2. **runtime**: `alpine:3.19` に `ca-certificates` と `tzdata` のみを追加した軽量イメージ
