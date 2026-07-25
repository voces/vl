// Build script for the `vl` host.
//
// Its ONLY job: when built with `--features embed-seed`, stage the compiler seed
// wasm into OUT_DIR so `include_bytes!(concat!(env!("OUT_DIR"), "/vl-compiler.wasm"))`
// in main.rs can bake it into the binary — giving a single self-contained `vl` for
// distribution. The seed path is `$VL_EMBED_SEED`, else the repo's default
// `build/vl-compiler.wasm` (relative to this crate). WITHOUT the feature this is a
// no-op, so a normal dev/CI build needs no seed present at compile time (ci-native
// builds the host before it mints the seed).

use std::path::PathBuf;

fn main() {
    // Cargo sets CARGO_FEATURE_<NAME> for each active feature.
    if std::env::var_os("CARGO_FEATURE_EMBED_SEED").is_none() {
        return;
    }

    let seed = std::env::var_os("VL_EMBED_SEED")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            // CARGO_MANIFEST_DIR = scripts/vl-host; the seed lives at repo build/.
            PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
                .join("../../build/vl-compiler.wasm")
        });

    let out =
        PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("vl-compiler.wasm");

    let bytes = std::fs::read(&seed).unwrap_or_else(|e| {
        panic!(
            "embed-seed: cannot read the compiler seed `{}`: {e}\n  \
             build it first (scripts/fetch-seed.sh or scripts/refresh-compiler.sh), \
             or point $VL_EMBED_SEED at a seed wasm.",
            seed.display(),
        )
    });
    std::fs::write(&out, &bytes).expect("embed-seed: staging the seed into OUT_DIR");

    // The embedded seed's identity, baked in as `$VL_SEED_KEY`, so the runtime can
    // name a compilation cache for bytes that have no path (see `seed_cache_path`).
    // Computed HERE rather than at startup because hashing a ~1 MB seed on every
    // invocation would cost a visible slice of the very latency the cache exists to
    // remove. FNV-1a: no dependency, and the key only has to be stable and
    // collision-free across seeds, not cryptographic.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in &bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    println!("cargo:rustc-env=VL_SEED_KEY={h:016x}");

    println!("cargo:rerun-if-changed={}", seed.display());
    println!("cargo:rerun-if-env-changed=VL_EMBED_SEED");
}
