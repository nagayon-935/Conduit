# Vault 本番設定
# ストレージ: ファイルベース（シンプルで運用しやすい）
storage "file" {
  path = "/vault/data"
}

# リスナー: ラボ内ネットワークに公開（TLS は nginx で終端）
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

# Vault の公開アドレス（VM② の実際の IP に変更すること）
api_addr = "http://0.0.0.0:8200"

# Web UI を有効化（ブラウザから http://<VM②IP>:8200 で確認できる）
ui = true

# ログレベル
log_level = "info"
