# Conduit フロントエンド

React + TypeScript で実装された Web SSH ターミナル UI です。

## 技術スタック

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| React | 18 | UI フレームワーク |
| TypeScript | 5 | 型安全 |
| Vite | 5 | ビルドツール・開発サーバー |
| @xterm/xterm | 6 | ターミナルエミュレータ |
| @xterm/addon-fit | 0.11 | ウィンドウサイズ自動追従 |
| @xterm/addon-webgl | 0.19 | WebGL レンダラー（GPU 描画） |
| @xterm/addon-search | 0.16 | ターミナル内テキスト検索 |

## ディレクトリ構成

```
src/
├── api/              # バックエンド REST API クライアント
│   ├── connect.ts    # POST /api/connect
│   ├── sessions.ts   # GET/DELETE /api/sessions
│   └── fetch.ts      # fetch ラッパー
├── components/
│   ├── ConnectForm.tsx       # 初期接続フォーム・プロファイル管理
│   ├── Terminal.tsx          # ターミナル本体・ステータスバー・検索
│   ├── TabBar.tsx            # タブバー・レイアウト切り替え
│   ├── NewConnectionOverlay.tsx  # 追加接続オーバーレイ（+ タブ）
│   ├── SessionList.tsx       # アクティブセッション一覧
│   └── LogPage.tsx           # 接続履歴ログ
├── hooks/
│   ├── useTerminal.ts        # xterm インスタンス・フォントサイズ・テーマ・検索
│   ├── useWebSocket.ts       # WebSocket 接続管理・再接続
│   ├── useProfiles.ts        # 接続プロファイル（localStorage）
│   └── useConnectionHistory.ts  # 接続履歴（localStorage）
├── utils/
│   ├── parseSshConfig.ts     # ~/.ssh/config パーサー
│   ├── storage.ts            # localStorage ラッパー
│   └── session.ts            # セッション状態の永続化
├── themes/           # ターミナルカラーテーマ定義
├── types/            # 共通型定義
├── constants.ts      # アプリ定数（フォントサイズ範囲・localStorage キーなど）
└── App.tsx           # ルートコンポーネント・タブ・レイアウト管理
```

## 開発サーバーの起動

```bash
npm install
npm run dev   # http://localhost:5173
```

バックエンドが `localhost:8080` で起動している必要があります。
Vite の開発サーバーが `/api` と `/ws` を自動的にプロキシします（`vite.config.ts` 参照）。

## ビルド

```bash
npm run build   # dist/ に出力
```

ビルド成果物はバックエンドが静的ファイルとして配信します。

## 主な機能

### 接続フォーム（ConnectForm）
- Host / Port / User を入力して SSH 接続
- **+ Add host** で複数ホストへの同時接続（スプリット表示）
- **プロファイル保存・読み込み**（localStorage 永続化）
- **Import ~/.ssh/config**：SSH config ファイルを読み込んでプロファイルを一括登録

### タブバー（TabBar）
- 接続ごとにタブを表示
- タブをドラッグ＆ドロップで並び替え可能
- プロファイルと一致する接続はプロファイル名をタブラベルに表示
- レイアウトボタン：1ペイン / 左右分割 / 上下分割 / 2×2 グリッド

### ターミナル（Terminal）
- WebGL レンダラーによる高速描画（非対応環境は Canvas にフォールバック）
- 接続切断後もセッションを保持（グレース期間）し再接続可能
- カラーテーマ切り替え（ステータスバーのセレクタ）

### キーボードショートカット

| ショートカット | 機能 |
|---------------|------|
| `Ctrl` + `=` | フォントサイズを拡大 |
| `Ctrl` + `-` | フォントサイズを縮小 |
| `Ctrl` + `F` | ターミナル内検索を開く / 閉じる |
| `Enter` | 次の検索結果へ |
| `Shift` + `Enter` | 前の検索結果へ |
| `Escape` | 検索を閉じる |

フォントサイズは localStorage に保持され、次回起動時に引き継がれます。

## コード分割（チャンク）

Vite ビルドは以下のチャンクに分割されます：

| チャンク | 含まれるもの |
|---------|------------|
| `react` | react, react-dom |
| `xterm` | @xterm/xterm, addon-fit, addon-webgl, addon-search |
| `index` | アプリケーションコード |
