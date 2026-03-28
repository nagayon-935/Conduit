export interface SshConfigHost {
  name: string;  // Host エイリアス
  host: string;  // HostName (なければ Host 値)
  port: number;
  user: string;
  // ProxyJump (省略時は undefined)
  jumpHost?: string;
  jumpPort?: number;
  jumpUser?: string;
}

/**
 * ~/.ssh/config のテキストをパースして接続先の配列を返す。
 * - `Host *` のようなワイルドカードエントリは除外する。
 * - HostName が省略されている場合は Host 値をそのまま使う。
 * - Port が省略されている場合は 22 を使う。
 * - User が省略されている場合は空文字を返す（呼び出し側で補完）。
 * - ProxyJump はカンマ区切りの最初のホストのみを使う。
 *   書式: [user@]host[:port]
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
    let jumpHost: string | undefined;
    let jumpPort: number | undefined;
    let jumpUser: string | undefined;

    for (const line of lines.slice(1)) {
      const m = line.match(/^\s*(\w+)\s+(.+)$/);
      if (!m) continue;
      const [, key, val] = m;
      switch (key.toLowerCase()) {
        case 'hostname':   hostname = val.trim(); break;
        case 'port':       port = parseInt(val.trim(), 10) || 22; break;
        case 'user':       user = val.trim(); break;
        case 'proxyjump': {
          // カンマ区切りの最初のホストのみ使用（多段 jump は未対応）
          const firstHop = val.trim().split(',')[0].trim();
          if (!firstHop || firstHop.toLowerCase() === 'none') break;

          let jh = firstHop;
          let jp = 22;
          let ju = '';

          // user@ を分離
          if (jh.includes('@')) {
            const at = jh.indexOf('@');
            ju = jh.slice(0, at);
            jh = jh.slice(at + 1);
          }

          // :port を分離
          if (jh.includes(':')) {
            const colon = jh.lastIndexOf(':');
            jp = parseInt(jh.slice(colon + 1), 10) || 22;
            jh = jh.slice(0, colon);
          }

          jumpHost = jh;
          jumpPort = jp;
          jumpUser = ju;
          break;
        }
      }
    }

    results.push({
      name,
      host: hostname || name,
      port,
      user,
      ...(jumpHost ? { jumpHost, jumpPort, jumpUser } : {}),
    });
  }

  return results;
}
