#!/bin/bash
# Egress allowlist for the VL dev container.
#
# Default-DROP on OUTPUT, with a hash:net ipset of permitted destinations. This
# is what makes `claude --dangerously-skip-permissions` safe in here: even if
# the agent runs arbitrary code, it can only reach the hosts below — it cannot
# exfiltrate to or pull from anywhere else.
#
# Run at container start (postCreateCommand) via passwordless sudo. Re-running is
# safe — it flushes and rebuilds from scratch.
#
# To allow another host: add it to the ALLOWED_DOMAINS list below and re-run
#   sudo /usr/local/bin/init-firewall.sh
set -euo pipefail
IFS=$'\n\t'

# Hosts the container is permitted to reach. Everything the repo's tasks need:
#   - api.anthropic.com + telemetry : Claude Code itself
#   - registry.npmjs.org            : `npm ci`, `npx esbuild` (LSP build)
#   - deno.land / jsr.io            : deno task deps (esbuild, std, jsr loader)
#   - crates.io + sidecars          : `cargo build` for scripts/vl-host
#   - GitHub ranges (added below)   : git, gh, scripts/fetch-seed.sh (the seed)
#   - VS Code server + Marketplace  : the devcontainer installs the VS Code Server
#                                     and the extensions in devcontainer.json. The
#                                     VSIX assets for *.gallerycdn.vsassets.io are
#                                     served from market-prod-cdn.trafficmanager.net
#                                     (a shared Akamai CDN), so resolving that one
#                                     host covers every publisher's extension.
ALLOWED_DOMAINS=(
  "api.anthropic.com"
  "sentry.io"
  "statsig.com"
  "registry.npmjs.org"
  "deno.land"
  "jsr.io"
  "npm.jsr.io"
  "crates.io"
  "static.crates.io"
  "index.crates.io"
  "update.code.visualstudio.com"
  "vscode.download.prss.microsoft.com"
  "main.vscode-cdn.net"
  "marketplace.visualstudio.com"
  "market-prod-cdn.trafficmanager.net"
)

echo "=== Initializing dev-container egress firewall ==="

# --- Reset (idempotent: this script re-runs on every container start) ---------
# Drop policies back to ACCEPT before flushing so a re-run never strands the
# container in a half-built DROP state, and so the ipset is left unreferenced.
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# --- Always-allow: DNS + loopback (before any DROP policy) --------------------
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -p tcp --sport 53 -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# --- Build the allowed-destinations ipset -------------------------------------
# Create-if-absent + flush rather than destroy/create: on a re-run the existing
# set may still be referenced by a not-yet-flushed rule, and `ipset destroy`
# fails on a referenced set. `-exist` + flush is reference-safe and idempotent.
ipset create allowed-domains hash:net -exist
ipset flush allowed-domains

# GitHub publishes its server CIDR ranges; pull and aggregate them so git/gh and
# the seed download (raw.githubusercontent, codeload, releases) all resolve.
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -fsSL --connect-timeout 10 https://api.github.com/meta)
if [ -n "$gh_ranges" ] && echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  while read -r cidr; do
    [ -z "$cidr" ] && continue
    ipset add allowed-domains "$cidr" 2>/dev/null || true
  done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git + .packages)[]' | aggregate -q | sort -u)
  echo "  added GitHub ranges"
else
  echo "  WARNING: could not fetch GitHub ranges (git/gh/seed-fetch may be blocked)"
fi

# Resolve each allowed domain to its current A records and add them. CDN-fronted
# hosts (the VS Code / Marketplace ones) return a rotating subset of edge IPs per
# query, so resolve a few times and union the results — this widens coverage so
# the IP the client later connects to is more likely already in the set.
for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(for _ in 1 2 3; do dig +short A "$domain"; done \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | sort -u || true)
  if [ -z "$ips" ]; then
    echo "  WARNING: no A record for $domain"
    continue
  fi
  while read -r ip; do
    [ -z "$ip" ] && continue
    ipset add allowed-domains "$ip" 2>/dev/null || true
  done <<< "$ips"
  echo "  allowed $domain ($(echo "$ips" | wc -l | tr -d ' ') IPs)"
done

# --- Allow traffic to the host / docker network -------------------------------
# The VSCode server and the host talk to the container over the docker bridge;
# permit the container's own subnet so that link isn't severed.
HOST_IP=$(ip route | grep default | cut -d' ' -f3 | head -1)
if [ -n "$HOST_IP" ]; then
  HOST_NET=$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')
  iptables -A INPUT  -s "$HOST_NET" -j ACCEPT
  iptables -A OUTPUT -d "$HOST_NET" -j ACCEPT
  echo "Allowed host network: $HOST_NET"
fi

# --- Policy: default DROP, allow established + the ipset ----------------------
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

iptables -P INPUT   DROP
iptables -P FORWARD DROP
iptables -P OUTPUT  DROP

echo "=== Firewall active — verifying ==="

# Probe reachability by HTTP status: a dropped host yields "000" (curl's -w emits
# 000 when no connection is made), a reachable host yields some code (even a 404
# means the TCP/TLS path is open). The `|| true` keeps `set -e` from aborting on
# curl's non-zero exit for the blocked case.
http_code() { curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 "$1" 2>/dev/null; }

# A blocked host must NOT connect.
blocked=$(http_code https://example.com || true)
if [ "$blocked" != "000" ]; then
  echo "ERROR: reached example.com (HTTP $blocked) — firewall is NOT blocking. Aborting." >&2
  exit 1
fi
echo "  verified: example.com is blocked"

# An allowed host must connect (any HTTP code; api.anthropic.com 404s unauthed).
allowed=$(http_code https://api.anthropic.com || true)
if [ "$allowed" = "000" ]; then
  echo "ERROR: cannot reach api.anthropic.com — allowlist is broken. Aborting." >&2
  exit 1
fi
echo "  verified: api.anthropic.com is reachable (HTTP $allowed)"

echo "=== Firewall ready ==="
