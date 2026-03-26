FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssh-server \
      curl \
      netcat-openbsd && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /run/sshd

# テスト用ユーザー作成（Vault 証明書で接続する）
# passwd -d でパスワードを空にしてアカウントのロックを解除する
RUN useradd -m -s /bin/bash conduit && passwd -d conduit

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
