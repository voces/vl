# Agent PR-watch — how to auto-watch PRs

Agent-facing runbook for the "always open a PR, and auto-watch it" convention in
`AGENTS.md`. Watch every open PR for review comments, merges, and CI results, and
surface changes promptly.

## Use one `Monitor`, not a cron

A single `Monitor` covers ALL open PRs: it re-lists open PRs each poll, so new PRs
are picked up and merges/closes are detected automatically — no per-PR setup, no
PR numbers to hard-code. `Monitor` streams each event into the chat within ~30s
even mid-task; a `CronCreate` job only fires while the session is idle (so it
misses events during active work). Arm once per session with `persistent: true`.

```sh
REPO=voces/vl
st=$(mktemp -d); last=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh pr list --repo $REPO --state open --json number --jq '.[].number' 2>/dev/null|sort>"$st/open"||true
gh pr list --repo $REPO --state open --json number,statusCheckRollup --jq '.[]|.number as $n|((.statusCheckRollup//[])[]|"\($n):\(.name):\(.conclusion//.status)")' 2>/dev/null|sort>"$st/ci"||true
echo "PR watch armed"
while true; do
  sleep 30; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cur=$(gh pr list --repo $REPO --state open --json number --jq '.[].number' 2>/dev/null|sort)
  for n in $cur; do
    gh api "repos/$REPO/issues/$n/comments?since=$last" --jq ".[]|\"PR#$n 💬 \(.user.login): \(.body[0:140])\"" 2>/dev/null||true
    gh api "repos/$REPO/pulls/$n/comments?since=$last" --jq ".[]|\"PR#$n 💬(inline \(.path):\(.line)) \(.user.login): \(.body[0:140])\"" 2>/dev/null||true
    gh api "repos/$REPO/pulls/$n/reviews" --jq ".[]|select(.submitted_at!=null and .submitted_at>\"$last\")|\"PR#$n 📝 \(.user.login) [\(.state)]: \(.body[0:140])\"" 2>/dev/null||true
  done
  gh pr list --repo $REPO --state open --json number,statusCheckRollup --jq '.[]|.number as $n|((.statusCheckRollup//[])[]|"\($n):\(.name):\(.conclusion//.status)")' 2>/dev/null|sort>"$st/ci.new"||true
  # drop pending AND the transient empty-conclusion state (trailing ':') so only completed CI conclusions emit
  comm -13 "$st/ci" "$st/ci.new" 2>/dev/null|grep -vE ':(IN_PROGRESS|QUEUED|PENDING|)$'|sed 's/^/CI ➜ /'||true
  mv -f "$st/ci.new" "$st/ci" 2>/dev/null||true
  for n in $(comm -23 "$st/open" <(echo "$cur") 2>/dev/null); do [ -z "$n" ]&&continue
    s=$(gh pr view $n --repo $REPO --json state,mergedAt --jq 'if .mergedAt then "MERGED ✅" else .state end' 2>/dev/null||echo "?"); echo "PR#$n $s"; done
  echo "$cur">"$st/open"; last=$now
done
```

## Notification tools

- **`Monitor`** — in-session event stream (above). The default for live PR watching.
- **`RemoteTrigger`** — durable claude.ai CLOUD routine that runs independent of
  the session. Use (or offer) it when the watch should survive the session closing;
  a `Monitor` dies with the session.
- **`PushNotification`** — pushes to the user's terminal/phone. Use sparingly, for
  things that need their attention.

## Replying to review feedback

Fetch with `gh pr view N --json comments,reviews` + `gh api repos/$REPO/pulls/N/comments`
(inline). Address actionable feedback by committing to the PR branch and
`gh pr comment N --body "…"`.

## Pushing (sandbox note)

`origin` is SSH (`git@github.com:voces/vl.git`), which fails in the sandbox. Push
over HTTPS: `gh auth setup-git && git push https://github.com/voces/vl.git <branch>`.
