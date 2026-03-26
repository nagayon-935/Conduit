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

# 無操作タイムアウト: 10分間キー入力なしで bash が自動 exit
# TMOUT は bash 組み込み変数で、読み取り専用にすることでユーザーが上書きできないようにする
RUN echo 'readonly TMOUT=600' >> /etc/bash.bashrc

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
