# Dev Container image for the VL / Vital repo.
#
# Bakes the full toolchain (node, deno, rust) at BUILD time — image builds have
# unrestricted network, so toolchain installs need no firewall allowlisting.
# Only the RUNNING container is locked down (see init-firewall.sh), which is what
# makes `claude --dangerously-skip-permissions` safe to run inside.
#
# Base: node 24 (the repo pins node 24.11.1 in lsp/.node-version; the LSP build
# shells out to `npx esbuild` under whatever node is on PATH).
FROM node:24-bookworm

ARG TZ
ENV TZ="$TZ"

# Base dev tools + the packages the firewall script needs:
#   iptables/ipset  — the egress allowlist
#   ipset/aggregate — CIDR set + GitHub range aggregation
#   dnsutils/jq/curl— domain resolution + GitHub meta parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
  less git procps sudo fzf zsh man-db unzip gnupg2 \
  aggregate iptables ipset iproute2 dnsutils jq curl ca-certificates \
  build-essential pkg-config \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI (gh) — used by scripts/fetch-seed.sh on the seed-download path.
RUN mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
     | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
     > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

ARG USERNAME=node

# Persist shell history across container rebuilds (mounted volume in devcontainer.json).
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Marker so tooling (and you) can tell this is the sandbox.
ENV DEVCONTAINER=true

# Workspace, claude config, and npm-global prefix dirs, owned by the non-root
# user (so `npm install -g` and Claude can write without root).
RUN mkdir -p /workspace /home/node/.claude /usr/local/share/npm-global && \
  chown -R node:node /workspace /home/node/.claude /usr/local/share/npm-global

# --- Deno -------------------------------------------------------------------
# Installed to a shared prefix so it's on PATH for the node user. The install
# script needs a concrete release tag (not "v2.x"), so resolve the latest stable
# tag first — currently v2.x, matching the repo's CI (denoland/setup-deno v2.x).
ENV DENO_INSTALL=/usr/local
RUN DENO_VERSION="$(curl -fsSL https://dl.deno.land/release-latest.txt)" \
  && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s "$DENO_VERSION" \
  && chmod -R a+rx /usr/local/bin/deno

# --- Rust (for scripts/vl-host) ---------------------------------------------
# Installed system-wide via rustup; CARGO_HOME/RUSTUP_HOME under /usr/local so
# the node user can use cargo without owning a home toolchain.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal \
  && chmod -R a+rwX /usr/local/rustup /usr/local/cargo

WORKDIR /workspace

# Switch to the non-root user for npm global installs.
USER node

# Global npm packages land in a user-writable prefix.
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin
ENV SHELL=/bin/zsh

# A minimal zsh setup (no heavyweight theme deps — keeps the build offline-free).
RUN echo 'export PATH=$PATH:/usr/local/share/npm-global/bin' >> ~/.zshrc \
  && echo 'autoload -Uz compinit && compinit' >> ~/.zshrc

# Claude Code itself.
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# --- Firewall wiring --------------------------------------------------------
# Copy the egress-allowlist script and grant the node user passwordless sudo to
# run ONLY that script (so postCreate can raise the firewall without a password,
# but the user can't sudo arbitrary commands).
USER root
# Symlink cargo/rust + claude into /usr/local/bin so they're on PATH for *login*
# shells too (the VSCode integrated terminal resets PATH via /etc/profile, which
# drops /usr/local/cargo/bin and the npm-global prefix).
RUN for f in /usr/local/cargo/bin/*; do ln -sf "$f" /usr/local/bin/; done \
  && ln -sf /usr/local/share/npm-global/bin/claude /usr/local/bin/claude

COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh \
  && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
  && chmod 0440 /etc/sudoers.d/node-firewall
USER node
