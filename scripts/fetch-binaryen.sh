#!/usr/bin/env bash
# Print a directory holding binaryen's NATIVE release tools (wasm-opt, wasm-dis, wasm-merge,
# wasm-as) at the version package.json pins, downloading it once into a cache; exit 1 when it
# cannot (offline, an unpinned platform, a checksum or version mismatch).
#
# The suites read it as $VL_BINARYEN (tests/support/tree.ts). npm's binaryen is the same
# release compiled to JS/wasm under node: it writes byte-identical modules, but each call pays
# node's start-up and `-O` runs several times slower, which made it most of ci-native's CPU.
#
#   scripts/fetch-binaryen.sh            # the directory, fetched if needed
#   VL_BINARYEN_CACHE=<dir>              # where versions are kept (default ~/.cache/vl)
set -u
V=130
cd "$(dirname "$0")/.."
# npm's copy is the reference the native one stands in for: refuse a drifted pin.
npmv=$(sed -n 's/^ *"version": *"\([0-9]*\)\..*/\1/p' node_modules/binaryen/package.json 2>/dev/null | head -1)
if [ -n "$npmv" ] && [ "$npmv" != "$V" ]; then
  echo "fetch-binaryen: npm binaryen is $npmv but this script pins $V; update V and the checksums" >&2
  exit 1
fi
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) P=x86_64-linux SUM=0a18362361ad05465118cd8eeb72edaeec89de6894bc283576ef4e07aa3babcc ;;
  Linux-aarch64) P=aarch64-linux SUM=e6ae6e09ac40f4e14bc5be6f687c58e2995c84170013975fa641809dd3b480a0 ;;
  Darwin-arm64) P=arm64-macos SUM=79d3ab9f417d9e215f15f598f523d001a7d9ac1e59367e5c869fbdabd1cba72e ;;
  *) echo "fetch-binaryen: no pinned build for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
D="${VL_BINARYEN_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/vl}/binaryen-$V-$P"
if [ ! -x "$D/bin/wasm-opt" ]; then
  T=$(mktemp -d) || exit 1
  trap 'rm -rf "$T"' EXIT
  url="https://github.com/WebAssembly/binaryen/releases/download/version_$V/binaryen-version_$V-$P.tar.gz"
  curl -fsSL --retry 2 -o "$T/b.tgz" "$url" || { echo "fetch-binaryen: download failed: $url" >&2; exit 1; }
  got=$( (sha256sum "$T/b.tgz" 2>/dev/null || shasum -a 256 "$T/b.tgz") | cut -c1-64)
  [ "$got" = "$SUM" ] || { echo "fetch-binaryen: checksum mismatch for $url" >&2; exit 1; }
  tar xzf "$T/b.tgz" -C "$T" || exit 1
  mkdir -p "$D.tmp/bin" || exit 1
  for t in wasm-opt wasm-dis wasm-merge wasm-as; do cp "$T/binaryen-version_$V/bin/$t" "$D.tmp/bin/" || exit 1; done
  # The macOS tools link libbinaryen.dylib through @rpath, which resolves to ../lib.
  if [ -d "$T/binaryen-version_$V/lib" ] && ls "$T/binaryen-version_$V/lib/"*.dylib >/dev/null 2>&1; then
    mkdir -p "$D.tmp/lib" && cp "$T/binaryen-version_$V/lib/"*.dylib "$D.tmp/lib/" || exit 1
  fi
  rm -rf "$D" && mv "$D.tmp" "$D" || exit 1
fi
"$D/bin/wasm-opt" --version 2>/dev/null | grep -q "version $V (" || {
  echo "fetch-binaryen: $D/bin/wasm-opt does not run as version $V" >&2; exit 1; }
echo "$D/bin"
