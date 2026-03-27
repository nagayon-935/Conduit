export interface SshConfigHost {
  name: string;  // Host エイリアス
  host: string;  // HostName (なければ Host 値)
  port: number;
  user: string;
}

/**
 * ~/.ssh/config のテキストをパースして接続先の配列を返す。
 * - `Host *` のようなワイルドカードエントリは除外する。
 * - HostName が省略されている場合は Host 値をそのまま使う。
 * - Port が省略されている場合は 22 を使う。
 * - User が省略されている場合は空文字を返す（呼び出し側で補完）。
 */
export function parseSshConfig(text: string): SshConfigHost[] {
  const results: SshConfigHost[] = [];

  // Host ブロックに分割
  const blocks = text.split(/^Host\s+/im).slice(1);

  for (const block of blocks) {
    const lines = block.split('\n');
    const hostAlias = lines[0].trim();

    // ワイルドカードエントリはスキップ
    if (!hostAlias || hostAlias === '*' || hostAlias.includes('*')) continue;
    // 複数エイリアスのうち最初の一つを使う（例: "web1 web2"）
    const name = hostAlias.split(/\s+/)[0];

    let hostname = '';
    let port = 22;
    let user = '';

    for (const line of lines.slice(1)) {
      const m = line.match(/^\s*(\w+)\s+(.+)$/);
      if (!m) continue;
      const [, key, val] = m;
      switch (key.toLowerCase()) {
        case 'hostname': hostname = val.trim(); break;
        case 'port':     port = parseInt(val.trim(), 10) || 22; break;
        case 'user':     user = val.trim(); break;
      }
    }

    results.push({
      name,
      host: hostname || name,
      port,
      user,
    });
  }

  return results;
}
