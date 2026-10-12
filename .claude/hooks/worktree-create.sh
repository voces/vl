#!/usr/bin/env bash
# WorktreeCreate hook: an agent worktree off `master`, with the main checkout's node_modules
# and cargo target linked in (binaryen and `vl` live there; neither is tracked) and the seed
# copied. Reads the hook's JSON on stdin; prints the worktree path as the last stdout line.
set -eu
ROOT=${CLAUDE_PROJECT_DIR:-$(pwd)}
NAME=$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -n "$NAME" ] || { echo "worktree-create: no name in the hook input" >&2; exit 1; }
DIR="$ROOT/.claude/worktrees/$NAME"
git -C "$ROOT" worktree add -q -b "worktree-$NAME" "$DIR" master >&2

# A directory link: a junction on Windows (no admin or Developer Mode needed; Git Bash's
# `ln -s` would silently copy), a symlink elsewhere.
link() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd //c mklink //J "$(cygpath -w "$2")" "$(cygpath -w "$1")" >&2 ;;
    *) ln -s "$1" "$2" ;;
  esac
}
[ -d "$ROOT/node_modules" ] && link "$ROOT/node_modules" "$DIR/node_modules"
if [ -d "$ROOT/scripts/vl-host/target" ]; then link "$ROOT/scripts/vl-host/target" "$DIR/scripts/vl-host/target"; fi
mkdir -p "$DIR/build"
cp "$ROOT"/build/vl-compiler.wasm* "$DIR/build/" 2>/dev/null || true
# Claude Code reads a native path, so print D:/… rather than Git Bash's /d/….
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) cygpath -m "$DIR" ;; *) echo "$DIR" ;; esac
