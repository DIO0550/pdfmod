FROM ubuntu:24.04

# Node.js バージョン
ARG NODE_VERSION=24
ARG USERNAME=vscode
# Rust ツールチェーン（"stable" で最新安定版を解決。特定バージョンに固定したい場合は上書きする）
ARG RUST_VERSION=stable

ENV NODE_VERSION=${NODE_VERSION}
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

# 基本パッケージとNode.jsのインストール
RUN apt-get update \
    && apt-get install -y \
        curl \
        ca-certificates \
        gnupg \
        git \
        jq \
        tmux \
        build-essential \
    && useradd -m -s /bin/bash $USERNAME \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/1830ced050035c34668aa426f7258346/raw/install-gh.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/16c39c3dc4682c7e2fd03c83d0f34b42/raw/install-playwright-deps.sh | bash

USER $USERNAME

SHELL ["/bin/bash", "-l", "-c"]
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/dcc09dc9d2dcefceb9b0cda183e7ef8e/raw/pnpm-safe-chain-setup.sh | sh
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/148b1392cf435ba3562da0d398bee442/raw/install-ai-tools.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/356434ec2b182f71d99dc0c467555ba5/raw/tmux-setup.sh | bash
RUN curl -fsSL https://gist.githubusercontent.com/DIO0550/6e5249a1b3682e702c875851756f0373/raw/install-playwright.sh | bash

# Rust ツールチェーン（rustup）。外部 crate 依存ゼロ方針だが、ビルド/テストには Cargo を使う。
# rustfmt / clippy は開発用ツール（実行時の外部依存ではない）。リンカは build-essential で導入済み。
ENV RUSTUP_HOME=/home/${USERNAME}/.rustup \
    CARGO_HOME=/home/${USERNAME}/.cargo \
    PATH=/home/${USERNAME}/.cargo/bin:${PATH}
RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path --default-toolchain ${RUST_VERSION} --profile minimal -c rustfmt -c clippy


WORKDIR /workspace