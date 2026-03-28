FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssh-server \
      netcat-openbsd && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /run/sshd

# テスト用ユーザー作成（パスワード: testpass）
RUN useradd -m -s /bin/bash conduit && \
    echo 'conduit:testpass' | chpasswd

# 公開鍵認証用 authorized_keys を配置
RUN mkdir -p /home/conduit/.ssh && \
    chmod 700 /home/conduit/.ssh
COPY test_id_ed25519.pub /home/conduit/.ssh/authorized_keys
RUN chmod 600 /home/conduit/.ssh/authorized_keys && \
    chown -R conduit:conduit /home/conduit/.ssh

COPY sshd_config /etc/ssh/sshd_config

EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
