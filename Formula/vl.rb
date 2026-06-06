# Homebrew formula for the VL / Vital compiler CLI (roadmap C5 / H-M1).
#
# DRAFT — not yet tappable. This installs the prebuilt `vl` binary produced by
# `deno compile` (see scripts/build-binary.ts and .github/workflows/release.yml).
# Versionless per the C5 decision (DECISIONS.md "Parser, distribution &
# bootstrapping"): the formula tracks a rolling artifact rather than pinned
# semver releases until H5 introduces a real versioning model.
#
# TODO(release): before this can `brew install`:
#   1. Decide where binaries are published. Options:
#        a. GitHub Releases on a tag/`latest` (set `url` to the release asset);
#        b. a dedicated Homebrew tap repo (`brew tap <owner>/vl`).
#   2. Fill in the real `homepage` / repo owner.
#   3. Replace the placeholder `url`s and `sha256`s below with the actual
#      release-asset URLs and `shasum -a 256` of each uploaded binary. The
#      release workflow (release.yml) prints these sums as a build summary.
#   4. Because the artifact is versionless, either use `version "rolling"` +
#      `head`/`livecheck`, or cut a tag and switch this to a normal versioned
#      formula. Homebrew discourages truly versionless stable formulae, so a
#      tag is the cleaner path once H5 lands.
class Vl < Formula
  desc "VL / Vital language compiler and CLI (compiles to WebAssembly/WasmGC)"
  homepage "https://github.com/TODO-OWNER/vl"
  version "rolling"
  license "TODO" # confirm project license before publishing

  # Prebuilt binaries from `deno compile --target`. The macOS/Linux arches map
  # 1:1 to the targets in scripts/build-binary.ts.
  on_macos do
    on_arm do
      url "https://github.com/TODO-OWNER/vl/releases/latest/download/vl-aarch64-apple-darwin"
      sha256 "TODO_SHA256_AARCH64_APPLE_DARWIN"
    end
    on_intel do
      url "https://github.com/TODO-OWNER/vl/releases/latest/download/vl-x86_64-apple-darwin"
      sha256 "TODO_SHA256_X86_64_APPLE_DARWIN"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/TODO-OWNER/vl/releases/latest/download/vl-aarch64-unknown-linux-gnu"
      sha256 "TODO_SHA256_AARCH64_LINUX"
    end
    on_intel do
      url "https://github.com/TODO-OWNER/vl/releases/latest/download/vl-x86_64-unknown-linux-gnu"
      sha256 "TODO_SHA256_X86_64_LINUX"
    end
  end

  def install
    # The downloaded asset is the bare executable; rename it to `vl`.
    bin.install Dir["vl-*"].first => "vl"
  end

  test do
    # Exercises the full pipeline (parse -> typecheck -> binaryen codegen ->
    # run) inside the installed binary — the same path the smoke test covers.
    assert_equal "3", shell_output("#{bin}/vl -e 'print(1 + 2)'").strip
  end
end
