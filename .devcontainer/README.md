# Dev Container — sandboxed Claude / VSCode

A Docker-backed [Dev Container](https://containers.dev) for this repo whose
**network egress is locked to an allowlist**. That isolation is the point: inside
it you can run

```sh
claude --dangerously-skip-permissions
```

and let the agent execute commands, write files, and run the toolchain without
approving every prompt — because even if it runs hostile code, the firewall lets
it reach only the handful of hosts the project actually needs (Anthropic, GitHub,
npm, deno, crates), and it can only touch this repo (the sole bind-mount). Nothing
else on your machine or network is in reach.

## What's in the box

| Tool | Version | For |
|---|---|---|
| node | 24.x | the LSP build (`npx esbuild`) |
| deno | v2.x | the compiler/test tasks (`deno task …`) |
| rust + cargo | stable | building `scripts/vl-host` |
| gh, git, jq, zsh | — | git ops, `scripts/fetch-seed.sh` |
| `@anthropic-ai/claude-code` | latest | the agent itself |

Files:
- [`devcontainer.json`](./devcontainer.json) — container definition (caps, mounts, the firewall hook).
- [`Dockerfile`](./Dockerfile) — the image and its toolchains.
- [`init-firewall.sh`](./init-firewall.sh) — the egress allowlist, raised on every container start.

## Prerequisites

1. **Docker running** (`docker info` must succeed).
2. The VSCode **Dev Containers** extension (`ms-vscode-remote.remote-containers`).

## Open it

In VSCode: Command Palette → **Dev Containers: Reopen in Container**. First build
takes a few minutes (apt + rust + deno + npm); rebuilds are cached. When it
finishes you're at `/workspace` (this repo, bind-mounted) as the `node` user, and
the firewall is already up.

CLI alternative (no VSCode), using the [devcontainers CLI](https://github.com/devcontainers/cli):

```sh
npm install -g @devcontainers/cli
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . zsh
```

## First run inside the container

Build the repo exactly as on the host (see the root [README](../README.md)):

```sh
deno task install            # npm ci — vscode-languageclient/server for the LSP
deno task lsp:build          # bundle the LSP extension
cargo build --release --manifest-path scripts/vl-host/Cargo.toml   # the native host
scripts/fetch-seed.sh        # pull a compiler seed from GitHub
echo 'print(6 * 7)' > /tmp/hello.vl && scripts/vl-host/target/release/vl run /tmp/hello.vl
```

All of these reach only allowlisted hosts, so they work behind the firewall.

## Authenticate Claude

`~/.claude` is a named volume (persists across rebuilds, never written to your
host). On first use, authenticate inside the container — either:

```sh
claude            # then complete the login flow
# — or, non-interactive —
export ANTHROPIC_API_KEY=sk-ant-...
```

## GitHub auth (gh)

GitHub credentials live **inside the container**, not passed from the host.
`~/.config/gh` is a named volume, so you authenticate once and it persists across
rebuilds. Run:

```sh
gh auth login --insecure-storage   # device flow via github.com (already allowlisted)
gh auth setup-git                  # optional: lets `git push` use the gh credential
```

`--insecure-storage` keeps the token in the volume-backed `~/.config/gh/` (the
container has no system keyring to use instead). Once logged in, `gh`,
`scripts/fetch-seed.sh`, and authenticated git all work. If a tool needs the
token in an env var, export it on demand:

```sh
export GH_TOKEN="$(gh auth token)"
```

## Bypass mode (no approval prompts)

**The VSCode extension** is pre-configured to start every conversation in bypass
mode. Two settings in `devcontainer.json` do this — the first unlocks bypass, the
second selects it (both are required):

```jsonc
"claudeCode.allowDangerouslySkipPermissions": true,
"claudeCode.initialPermissionMode": "bypassPermissions"
```

**The CLI** (integrated terminal) is separate — run it with the flag:

```sh
claude --dangerously-skip-permissions
```

Either way, the egress allowlist — not the per-action prompts — is the security
boundary, which is what makes skipping prompts safe in here.

## The firewall

[`init-firewall.sh`](./init-firewall.sh) runs at every container start
(`postStartCommand`) via passwordless sudo scoped to *only* that script. It:

1. Flushes iptables and builds a `hash:net` ipset of allowed destinations.
2. Adds GitHub's published CIDR ranges (from `api.github.com/meta`).
3. Resolves each domain in the `ALLOWED_DOMAINS` list and adds its IPs.
4. Sets the default OUTPUT policy to **DROP**, allowing only DNS, loopback, the
   docker host subnet, established connections, and the allowlist.
5. **Self-verifies**: aborts if `example.com` is reachable or `api.anthropic.com`
   is not — so a broken allowlist fails loudly instead of silently letting traffic
   through.

The capabilities `NET_ADMIN` + `NET_RAW` (granted in `devcontainer.json` `runArgs`)
are what let it program iptables; without them the sandbox guarantee doesn't hold.

### Allow another host

Add it to the `ALLOWED_DOMAINS` array in [`init-firewall.sh`](./init-firewall.sh)
and **Rebuild Container** — the script is baked into the image at build time, so a
source edit only takes effect after a rebuild.

### Verify it's active

```sh
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 5 https://example.com   # 000 = blocked
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 5 https://github.com    # 200 = allowed
```

## Troubleshooting

- **A download fails** → its host isn't allowlisted; add it (see *Allow another
  host*). CDN-fronted hosts that rotate IPs can fail intermittently — re-run
  `sudo /usr/local/bin/init-firewall.sh` to re-resolve.
- **`init-firewall.sh` aborts at start** → `api.anthropic.com` was unreachable, or
  the `NET_ADMIN`/`NET_RAW` capabilities aren't granted.
- **Reset Claude's auth/config** → delete the volume:
  `docker volume rm vl-claude-config-<id>` (find it with `docker volume ls`).
- **Rebuild from scratch** → Command Palette → *Dev Containers: Rebuild Container*.
