# Conduit — Web SSH Terminal

ブラウザから SSH に接続できる Web ターミナルアプリケーションです。
HashiCorp Vault が発行する短命 SSH 証明書（TTL=5分）で認証し、WebSocket 経由でリアルタイムにターミナルを操作できます。

---

## アーキテクチャ

```
Browser (xterm.js)
    │  WebSocket (binary frames)
    ▼
Go HTTP Server
    ├─ POST /api/connect   → Vault で証明書発行 → SSH 接続確立 → セッション生成
    └─ GET  /ws/terminal   → WebSocket ↔ SSH ストリームブリッジ
         │
         ▼
    Target SSH Server  (証明書認証)
```

### 主要な設計ポイント

| 機能 | 詳細 |
|------|------|
| **短命 SSH 証明書** | Vault SSH Secrets Engine で TTL=5分の証明書を発行。秘密鍵はメモリ上のみに保持しディスクに書かない |
| **グレース期間再接続** | WebSocket 切断後 15 分間は SSH セッションを保持。同じトークンで再接続すると続きから操作できる |
| **バックプレッシャー** | SSH → クライアント方向のチャンネルが詰まった場合、50ms 待って送れなければドロップ。ゴルーチンのフリーズを防ぐ |

---

## 技術スタック

### バックエンド
- **Go 1.22**
- `golang.org/x/crypto/ssh` — SSH クライアント・証明書認証
- `github.com/gorilla/websocket` — WebSocket サーバー
- HashiCorp Vault HTTP API — SSH 証明書署名

### フロントエンド
- **React 18 + TypeScript**
- `@xterm/xterm` — ターミナルエミュレータ（WebGL レンダラー）
- `@xterm/addon-fit` — ウィンドウサイズ自動追従
- `@xterm/addon-webgl` — GPU アクセラレーション描画
- Vite 5 — ビルドツール・開発サーバー

---

## ディレクトリ構成

```
.
├── cmd/server/          # エントリポイント (main.go)
├── internal/
│   ├── api/             # HTTP ハンドラー (connect, terminal, middleware)
│   ├── config/          # 環境変数設定
│   ├── session/         # セッション状態管理・GC
│   ├── sshconn/         # 鍵生成・SSH ダイアル・証明書サイナー
│   ├── tunnel/          # WebSocket↔SSH ポンプ・PTY リサイズ
│   └── vault/           # Vault クライアント
├── pkg/token/           # セッショントークン生成
├── tests/               # E2E 統合テスト
└── frontend/            # React フロントエンド
    └── src/
        ├── api/         # REST クライアント
        ├── components/  # ConnectForm, Terminal
        ├── hooks/       # useTerminal, useWebSocket
        └── types/       # 型定義
```

---

## セットアップ

### 前提条件

- Go 1.22+
- Node.js 18+
- HashiCorp Vault（SSH Secrets Engine 有効化済み）

### 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `VAULT_ADDR` | ✅ | — | Vault サーバーのアドレス (例: `http://127.0.0.1:8200`) |
| `VAULT_TOKEN` | ✅ | — | Vault アクセストークン |
| `VAULT_SSH_ROLE` | ✅ | — | SSH 署名に使用するロール名 |
| `VAULT_SSH_MOUNT` | | `ssh` | Vault SSH Secrets Engine のマウントパス |
| `SERVER_ADDR` | | `:8080` | HTTP サーバーのリッスンアドレス |
| `GRACE_PERIOD` | | `15m` | WebSocket 切断後にセッションを保持する期間 |
| `SESSION_GC_INTERVAL` | | `1m` | 期限切れセッションの GC 実行間隔 |

### バックエンド起動

```bash
# 依存パッケージ取得
go mod download

# ビルド & 起動
make build
make run

# または開発モード（go run）
make dev
```

### フロントエンド起動

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 で起動
```

> バックエンドは `localhost:8080` で起動している必要があります。
> Vite の開発サーバーが `/api` と `/ws` を自動プロキシします。

---

## テスト

```bash
# 全テスト（レースディテクター付き）
make test

# カバレッジレポート
go test -covermode=atomic -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### カバレッジ（現状）

| パッケージ | カバレッジ |
|-----------|-----------|
| `internal/config` | 100% |
| `internal/vault` | 89.5% |
| `internal/session` | 86.2% |
| `internal/api` | 76.5% |
| `pkg/token` | 75.0% |
| `internal/sshconn` | 71.8% |
| `internal/tunnel` | 33.7% ※ |

> ※ `readPump` / `writePump` / `handleControlMessage` はライブ WebSocket 接続が必要なため静的テストでは未カバー

---

## API

### `POST /api/connect`

SSH 接続を確立してセッションを作成します。

**リクエスト**
```json
{
  "host": "192.168.1.10",
  "port": 22,
  "user": "ubuntu"
}
```

**レスポンス (201)**
```json
{
  "session_token": "a3f9...",
  "expires_at": "2024-01-01T00:15:00Z",
  "message": "session created"
}
```

### `GET /ws/terminal?token=<session_token>`

WebSocket にアップグレードして双方向ターミナルストリームを開きます。

- **Binary frame** — ターミナルの入出力データ
- **Text frame** — 制御メッセージ (JSON)
  ```json
  { "type": "ping" }
  { "type": "resize", "cols": 120, "rows": 40 }
  ```

---

## ライセンス

MIT
