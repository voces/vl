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
- [`Dockerfile`](./Dockerfile) — the image (toolchains installed at build time, where network is unrestricted).
- [`init-firewall.sh`](./init-firewall.sh) — the egress allowlist, raised on every container start.

## Prerequisites

1. **Docker Desktop running** (`docker info` must succeed). On this machine it's
   at `/Applications/Docker.app` — `open -a Docker` and wait ~20s.
2. **VSCode "Dev Containers" extension** (`ms-vscode-remote.remote-containers`) — already installed.

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

## Bypass mode (no approval prompts)

Two surfaces, two ways to skip prompts — both already wired for this sandbox:

**The VSCode extension** does *not* bypass automatically; by default it prompts,
and merely choosing "bypassPermissions" is silently downgraded to "default"
unless a separate gate is open. So `devcontainer.json` sets **both** required
settings (container-scoped — they never touch your host config):

```jsonc
"claudeCode.allowDangerouslySkipPermissions": true,   // the gate
"claudeCode.initialPermissionMode": "bypassPermissions" // start each convo bypassed
```

With those, every new conversation in the extension starts in bypass mode.

**The CLI** (integrated terminal) is independent of the extension settings above
— run it with the flag:

```sh
claude --dangerously-skip-permissions
```

In both cases the egress allowlist ([`init-firewall.sh`](./init-firewall.sh)) is
the compensating control: bypass is "recommended only for sandboxes with no
internet access," and this sandbox's internet is restricted to the allowlist.
Claude Code also refuses bypass when running as **root** — this container runs as
the non-root `node` user, so that's satisfied.

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

Add it to the `ALLOWED_DOMAINS` array in [`init-firewall.sh`](./init-firewall.sh),
then re-raise the firewall without restarting:

```sh
sudo /usr/local/bin/init-firewall.sh
```

### Verify it's active

```sh
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 5 https://example.com   # 000 = blocked
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 5 https://github.com    # 200 = allowed
```

## Troubleshooting

- **VSCode can't install extensions / the VSCode Server fails to download** →
  the Marketplace + server CDNs must be allowlisted; they already are
  (`marketplace.visualstudio.com`, `update.code.visualstudio.com`,
  `vscode.download.prss.microsoft.com`, `main.vscode-cdn.net`, and
  `market-prod-cdn.trafficmanager.net` — the shared Akamai CDN behind every
  `*.gallerycdn.vsassets.io` VSIX asset, so any publisher's extension is covered).
  If you changed `init-firewall.sh`, the script is baked into the image, so
  **Rebuild Container** (Command Palette) for the new allowlist to take effect —
  re-running the old in-container firewall won't pick up edits.
- **A download fails / hangs** → its host isn't allowlisted. Find the domain and
  add it (see above). Watch for CDN-fronted hosts that resolve to rotating IPs;
  if a host connects in one session but not another, that's CDN IP rotation — the
  resolver does 3 passes per domain to widen coverage, and re-running the firewall
  (`sudo /usr/local/bin/init-firewall.sh`) re-resolves.
- **`init-firewall.sh` aborts at start** → `api.anthropic.com` was unreachable, or
  the caps are missing. Confirm Docker Desktop grants `NET_ADMIN`/`NET_RAW`.
- **Reset Claude's auth/config** → delete the volume:
  `docker volume rm vl-claude-config-<id>` (find it with `docker volume ls`).
- **Rebuild from scratch** → Command Palette → *Dev Containers: Rebuild Container*.
