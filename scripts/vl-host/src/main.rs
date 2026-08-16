// The native `vl` tool — a single binary with deno-style subcommands:
//
//   vl build <in.vl> -o <out.wasm>   compile a file to a wasm module, then VALIDATE it
//   vl check <in.vl>                 typecheck; print diagnostics (`--codegen` also emits)
//   vl run   <in.vl>                 compile in-memory, then instantiate + run
//   vl fmt   [path] [-w|--check]     format source (stdout / write / CI gate); stdin when no path
//   vl test  [path] [-t <name>]      discover `*.test.vl`, run them in parallel, report
//
// Only `build` and `run` ever hand the emitted bytes to the ENGINE, so only they can
// tell a valid module from an invalid one — the validator lives in wasmtime, and the
// compiler is a VL program inside the guest with no engine of its own. `check
// --codegen` runs the emitter but never leaves the guest with the bytes, so it
// reports the emitter's own errors and nothing about the module's validity. (This
// header used to claim `check` did "emit-validate"; measured false — see
// `validate_written_module`.)
//
// This is a THIN host adapter: all compiler logic (lex/parse/typecheck/emit) lives
// in the self-hosted compiler wasm (`build/vl-compiler.wasm`, self-compiled from
// the VL-written compiler — see scripts/refresh-compiler.sh / fetch-seed.sh). The
// Rust side only does argv, file I/O, stdout, and the wasmtime embedding — it never
// parses or types VL. Future subcommands (fmt, test, …) follow the same shape: the
// brains land in the wasm, the adapter stays an I/O shim.
//
// The compiler seed is resolved from (first hit wins):
//   --compiler <path>  |  $VL_COMPILER_WASM  |  ./build/vl-compiler.wasm  |  embedded
// The embedded copy exists only in a release build (`--features embed-seed`, which
// bakes the seed in via build.rs), so a shipped `vl` is one self-contained file.
use std::sync::{Arc, Mutex};
use wasmtime::*;

fn usage() -> ! {
    eprintln!("usage: vl <build|check|run|fmt|test> <file.vl> [-o out.wasm] [-O|-O3] [--wat] [--no-validate] [-w|--check] [-t name] [--jobs N] [--compiler vl-compiler.wasm]");
    std::process::exit(2);
}

/// A `std/` directory is VL's own if it holds the modules `std/` is required to
/// have. The marker exists only for the UPWARD SEARCH below, which would otherwise
/// happily adopt any unrelated directory called `std` sitting above the binary
/// (`/usr/include/std`, a vendored C++ tree, …) and then report every `std:` import
/// as a missing module rather than as the wrong directory.
fn is_vl_std(dir: &std::path::Path) -> bool {
    dir.join("array.vl").is_file() && dir.join("test.vl").is_file()
}

/// Every place `std:` modules are looked for, in priority order — the resolution
/// itself (`std_dir`) and the diagnostic that names what was tried share this one
/// list, so the message can never drift from the search.
///
/// The dev tree used to be a single hard-coded `../../../../std`: FOUR levels up
/// from the real exe path, because the binary lives at
/// `scripts/vl-host/target/release/vl`. That count is a property of one build
/// layout, not of VL — a binary copied, symlinked, or `cargo install`ed to any
/// other depth silently resolved NO std at all, and every `std:` import failed as
/// `no module std:test` with nothing pointing at the real cause. The search is a
/// walk instead: each ancestor of the exe, nearest first, so the dev tree is found
/// at whatever depth it happens to sit at.
fn std_candidates() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(dir) = std::env::var("VL_STD") {
        out.push(std::path::PathBuf::from(dir));
        // $VL_STD is an explicit instruction, not a guess: when it is set it is the
        // only candidate, so a typo in it reports as a bad std dir rather than
        // silently resolving somewhere else.
        return out;
    }
    let Some(exe) = std::env::current_exe().ok() else {
        return out;
    };
    let Some(exe_dir) = exe.parent() else {
        return out;
    };
    // The release layout — std ships beside the binary. Taken on `is_dir` alone: a
    // directory the distribution put there is unambiguous, marker or not.
    out.push(exe_dir.join("std"));
    // The dev tree, at any depth: the nearest ancestor holding a real VL `std/`.
    for anc in exe_dir.ancestors().skip(1) {
        out.push(anc.join("std"));
    }
    out
}

/// The std source directory `std:` module keys read from, or `None` when no
/// candidate holds one. The first candidate is taken on existence; the rest must
/// look like VL's std (see `is_vl_std`).
fn std_dir() -> Option<std::path::PathBuf> {
    let mut cands = std_candidates().into_iter();
    let first = cands.next()?;
    if first.is_dir() {
        return Some(first);
    }
    cands.find(|c| is_vl_std(c))
}

/// Read the source of `std:<name>`, and on failure explain — ONCE per process —
/// where the host actually looked.
///
/// The guest raises `Cannot resolve import "std:test" (no module std:test)`, which
/// is true but reads as "VL has no such module" when the real cause is "this binary
/// resolved no `std/` at all". The host is the only side that knows the paths, so
/// it is the only side that can name them; the guest diagnostic stays exactly as
/// it is and this rides alongside on stderr.
fn read_std_module(name: &str) -> Option<String> {
    let dir = std_dir();
    let found = dir
        .as_ref()
        .and_then(|d| read_utf8(&d.join(format!("{name}.vl"))));
    if found.is_none() {
        static EXPLAINED: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);
        if !EXPLAINED.swap(true, std::sync::atomic::Ordering::Relaxed) {
            match &dir {
                Some(d) => eprintln!(
                    "note: `std:{name}` was not found at {}",
                    d.join(format!("{name}.vl")).display()
                ),
                None => {
                    eprintln!("note: no VL `std/` directory found — looked in:");
                    for c in std_candidates() {
                        eprintln!("        {}", c.display());
                    }
                    eprintln!(
                        "      set $VL_STD to VL's `std/` directory, or run the binary \
                         from a tree that has one"
                    );
                }
            }
        }
    }
    found
}

fn gc_engine(collector: Collector) -> Result<Engine> {
    let mut cfg = Config::new();
    cfg.wasm_gc(true);
    cfg.wasm_function_references(true);
    // A ONE-SHOT compile (`vl build` / `vl run` / a single-file `vl check`) is batch
    // work: the null collector (never frees) skips every DRC barrier/refcount, trading
    // memory for speed — give it a large reservation to grow into. Anything that keeps
    // running gets a real collector: user programs (`vl run`) may be long-lived, and
    // the CLI pump (`cli_pump`) compiles EVERY file of a directory walk in ONE store,
    // so its garbage is unbounded in the file count, not the file size.
    cfg.collector(collector);
    if matches!(collector, Collector::Null) {
        cfg.gc_heap_reservation(8 << 30); // 8 GiB virtual reservation (lazily committed)
    }
    Engine::new(&cfg)
}

/// The collector for the USER PROGRAM's store (`vl run`) — `Collector::Auto`
/// (the engine's best general-purpose collector: tracing, cycle-collecting,
/// with an in-Wasm bump-allocation fast path) unless `$VL_GC` overrides it.
///
/// The knob is a RUNTIME tuning dial with no effect on program semantics: every
/// collector runs the same emitted module to the same result, they differ only
/// in throughput, pause behavior and peak footprint. It is deliberately an
/// environment variable rather than a CLI flag — the engine is built before any
/// guest code runs, and all `vl` flag parsing lives in the guest (`compiler/cli.vl`).
///
///   auto (default) — engine's choice; tracing, collects cycles
///   tracing        — force the copying collector: fastest allocation, collects
///                    cycles, stop-the-world pauses, uses half the heap
///   refcount       — deferred reference counting: shorter pauses, much lower
///                    throughput, and it CANNOT reclaim cycles (they leak for
///                    the life of the process)
///   none           — never collect; bump-allocate until the heap is exhausted,
///                    then trap. For short batch runs only.
///
/// An unrecognized value is a hard error rather than a silent fallback: a typo
/// here would otherwise quietly measure the wrong thing.
fn run_collector() -> Result<Collector> {
    match std::env::var("VL_GC").ok().as_deref() {
        None | Some("") | Some("auto") => Ok(Collector::Auto),
        Some("tracing") => Ok(Collector::Copying),
        Some("refcount") => Ok(Collector::DeferredReferenceCounting),
        Some("none") => Ok(Collector::Null),
        Some(other) => bail!("unknown $VL_GC `{other}` (auto | tracing | refcount | none)"),
    }
}

/// Which FILE each diagnostic belongs to, for a multi-module compile. A
/// positioned diagnostic carries a line and column that are the OWNING module's,
/// so labelling every one with the entry path prints a real location against the
/// wrong file — `vl run`/`vl build` said `entry.vl:2:20` for an error inside
/// `dep.vl`, while `vl check` (which resolves the owner in `compiler/cli.vl`) said
/// `dep.vl:2:21`. This is the same mapping `cli.vl` uses: `diagModule(i)` is the
/// driver's module-table index, and `modKeyCount`/`modKeyAtLen`/`modKeyAtCharAt`
/// read that table's keys — which the host itself committed, so they are exactly
/// the paths it was asked to read.
///
/// `None` (a compiler module without `diagModule`, or a single-file compile whose
/// module table was never filled) means "label with the entry path", byte-identical
/// to before. The key table is read ONCE — strings cross the no-import boundary one
/// code point at a time, and a diagnostic burst would otherwise re-read it per line.
struct DiagPaths {
    module_of: TypedFunc<i32, i32>,
    keys: Vec<String>,
}

impl DiagPaths {
    fn probe(store: &mut Store<()>, inst: &Instance) -> Option<Self> {
        let module_of = inst
            .get_typed_func::<i32, i32>(&mut *store, "diagModule")
            .ok()?;
        let count = inst
            .get_typed_func::<(), i32>(&mut *store, "modKeyCount")
            .ok()?;
        let key_len = inst
            .get_typed_func::<i32, i32>(&mut *store, "modKeyAtLen")
            .ok()?;
        let key_at = inst
            .get_typed_func::<(i32, i32), i32>(&mut *store, "modKeyAtCharAt")
            .ok()?;
        let n = count.call(&mut *store, ()).ok()?;
        let mut keys = Vec::with_capacity(n.max(0) as usize);
        for m in 0..n {
            let len = key_len.call(&mut *store, m).ok()?;
            let mut key = String::with_capacity(len as usize);
            for j in 0..len {
                if let Some(c) = char::from_u32(key_at.call(&mut *store, (m, j)).ok()? as u32) {
                    key.push(c);
                }
            }
            keys.push(key);
        }
        Some(DiagPaths { module_of, keys })
    }

    /// The owning module's key for diagnostic `i`, or `None` when the anchor
    /// resolved to no module in range (the entry path is the caller's fallback).
    fn path_for(&self, store: &mut Store<()>, i: i32) -> Option<&str> {
        let m = self.module_of.call(&mut *store, i).ok()?;
        self.keys.get(usize::try_from(m).ok()?).map(String::as_str)
    }
}

/// Render the compiler's accumulated diagnostics, one per line. A compiler
/// module with the structured per-diagnostic exports (`diagCount` /
/// `diagMsgLen` / `diagMsgAt` / `diagLine` / `diagCol`) renders a positioned
/// diagnostic as `path:line:col: message` — 1-based line, 0-based column (the
/// lexer's and the corpus `@error-at` directive's convention) — while
/// `diagLine(i) == 0` means "no position" and the message prints bare. An older
/// module without those exports degrades to the legacy newline-joined
/// `diagLen`/`diagAt` text (bare messages), byte-identical to before.
///
/// `path` is the ENTRY's path and is only the FALLBACK label: a multi-module
/// compile asks `DiagPaths` which file each diagnostic actually belongs to. The
/// entry's own diagnostics resolve to module 0, whose key IS `path`, so a
/// single-file program's output is unchanged to the byte.
fn render_diags(inst: &Instance, store: &mut Store<()>, path: &str) -> Result<String> {
    if let (Ok(count), Ok(mlen), Ok(mat), Ok(dline), Ok(dcol)) = (
        inst.get_typed_func::<(), i32>(&mut *store, "diagCount"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagMsgLen"),
        inst.get_typed_func::<(i32, i32), i32>(&mut *store, "diagMsgAt"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagLine"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagCol"),
    ) {
        let owners = DiagPaths::probe(&mut *store, inst);
        let n = count.call(&mut *store, ())?;
        let mut out = String::new();
        for i in 0..n {
            let len = mlen.call(&mut *store, i)?;
            let mut msg = String::with_capacity(len as usize);
            for j in 0..len {
                if let Some(c) = char::from_u32(mat.call(&mut *store, (i, j))? as u32) {
                    msg.push(c);
                }
            }
            let line = dline.call(&mut *store, i)?;
            if line > 0 {
                let col = dcol.call(&mut *store, i)?;
                let file = owners
                    .as_ref()
                    .and_then(|o| o.path_for(&mut *store, i))
                    .unwrap_or(path);
                out.push_str(&format!("{file}:{line}:{col}: {msg}\n"));
            } else {
                out.push_str(&msg);
                out.push('\n');
            }
        }
        return Ok(out);
    }
    let dlen = inst.get_typed_func::<(), i32>(&mut *store, "diagLen")?;
    let dat = inst.get_typed_func::<i32, i32>(&mut *store, "diagAt")?;
    let n = dlen.call(&mut *store, ())?;
    let mut diags = String::with_capacity(n as usize);
    for i in 0..n {
        if let Some(c) = char::from_u32(dat.call(&mut *store, i)? as u32) {
            diags.push(c);
        }
    }
    Ok(diags)
}

/// Where the compiler seed bytes come from: a path on disk (the dev/CI default,
/// cached via a `.cwasm` sidecar) or bytes baked into THIS binary at build time (a
/// release build with `--features embed-seed`, so the shipped `vl` is a single
/// self-contained file with no out-of-band asset).
enum CompilerSource {
    Path(String),
    Embedded(&'static [u8]),
}

#[cfg(feature = "embed-seed")]
static EMBEDDED_SEED: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/vl-compiler.wasm"));

/// The compiled-in seed, present only when built with `--features embed-seed`.
fn embedded_seed() -> Option<&'static [u8]> {
    #[cfg(feature = "embed-seed")]
    {
        Some(EMBEDDED_SEED)
    }
    #[cfg(not(feature = "embed-seed"))]
    {
        None
    }
}

/// Where the EMBEDDED seed's compilation cache lives — the sidecar's counterpart for
/// bytes that have no path of their own. A distributed `vl` has no `build/` next to
/// it, so without this every invocation re-runs Cranelift over the whole ~1 MB seed
/// (seconds, not milliseconds); with it, that cost is paid once per machine.
///
/// The file is CONTENT-KEYED on `$VL_SEED_KEY` (baked by `build.rs`), so two `vl`
/// binaries carrying different seeds never collide and an upgraded binary simply
/// misses instead of loading something stale.
///
/// Directory, first hit wins: `$VL_CACHE_DIR` · `$XDG_CACHE_HOME/vl` ·
/// `$HOME/.cache/vl` · `%LOCALAPPDATA%\vl`. `None` (no home, no XDG) means "run
/// uncached" — correct, just slow, which is the right failure for a cache.
fn seed_cache_path() -> Option<std::path::PathBuf> {
    #[cfg(not(feature = "embed-seed"))]
    {
        // No baked seed, so no `$VL_SEED_KEY` to name a cache with. The on-disk
        // seed's own `.cwasm` sidecar covers this build.
        None
    }
    #[cfg(feature = "embed-seed")]
    {
        seed_cache_path_impl()
    }
}

#[cfg(feature = "embed-seed")]
fn seed_cache_path_impl() -> Option<std::path::PathBuf> {
    let dir = if let Some(d) = std::env::var_os("VL_CACHE_DIR") {
        std::path::PathBuf::from(d)
    } else if let Some(d) = std::env::var_os("XDG_CACHE_HOME") {
        std::path::PathBuf::from(d).join("vl")
    } else if let Some(h) = std::env::var_os("HOME") {
        std::path::PathBuf::from(h).join(".cache/vl")
    } else if let Some(d) = std::env::var_os("LOCALAPPDATA") {
        std::path::PathBuf::from(d).join("vl")
    } else {
        return None;
    };
    std::fs::create_dir_all(&dir).ok()?;
    let ours = dir.join(format!("seed-{}.cwasm", env!("VL_SEED_KEY")));
    prune_seed_cache(&dir, &ours);
    Some(ours)
}

/// Keep the seed cache bounded. Entries are content-keyed, so every `vl` carrying a
/// new seed adds one (~9 MB) and nothing retires the old ones — an upgrade treadmill
/// would grow the user's cache dir without limit.
///
/// Policy: keep the `KEEP` most-recently-written `seed-*.cwasm` plus our own, delete
/// the rest. A COUNT rather than an age, because an entry in daily use is only ever
/// READ — its mtime stays as old as the day it was written, so any age rule would
/// evict exactly the entries that are working. `KEEP > 1` so a dev checkout and a
/// released `vl` sharing a cache dir do not evict each other on alternate runs.
/// Evicting a live entry is survivable regardless — the next run recompiles and
/// republishes it — which is why every step here is best-effort and silent.
#[cfg(feature = "embed-seed")]
fn prune_seed_cache(dir: &std::path::Path, ours: &std::path::Path) {
    const KEEP: usize = 3;
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut seeds: Vec<(std::time::SystemTime, std::path::PathBuf)> = entries
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            n.starts_with("seed-") && n.ends_with(".cwasm")
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    if seeds.len() <= KEEP {
        return;
    }
    seeds.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
    for (_, path) in seeds.into_iter().skip(KEEP) {
        if path != ours {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Resolve which compiler seed to load, first hit wins:
///   --compiler <path>  →  $VL_COMPILER_WASM  →  ./build/vl-compiler.wasm  →  embedded
/// An EXPLICIT request (flag or env) is honoured strictly — a missing file is an
/// error, never a silent fall-through to the embedded copy. Only the default
/// (neither flag nor env) falls back: the on-disk seed wins when present (so a dev
/// checkout / CI drives its freshly-built seed, and a release binary's embedded copy
/// stays overridable), and the embedded seed is the last resort so a distributed
/// `vl` runs anywhere. With no flag/env, no disk seed, and no embedded copy, return
/// the default path so the loader emits its build-the-seed hint.
fn resolve_compiler(explicit: Option<String>) -> CompilerSource {
    if let Some(p) = explicit.or_else(|| std::env::var("VL_COMPILER_WASM").ok()) {
        return CompilerSource::Path(p);
    }
    const DEFAULT: &str = "build/vl-compiler.wasm";
    if std::path::Path::new(DEFAULT).exists() {
        return CompilerSource::Path(DEFAULT.to_string());
    }
    if let Some(bytes) = embedded_seed() {
        return CompilerSource::Embedded(bytes);
    }
    CompilerSource::Path(DEFAULT.to_string())
}

/// Drive the self-hosted compiler module: feed `source` in, call `entry`
/// (`compileSrc` for the full pipeline, `checkSrc` for parse + typecheck only),
/// optionally enabling the `name` custom section (`emit_names`), and return the
/// emitted wasm bytes (empty for a check), or the compiler's own diagnostics as
/// the error (positioned `source_path:line:col: message` lines where known).
/// Load + instantiate the self-hosted compiler module, reusing a `.cwasm` SIDECAR
/// that caches the Cranelift compilation (the dominant fixed cost of every
/// invocation), keyed by freshness (rebuilt whenever the `.wasm` is newer). Shared
/// by every subcommand that drives the seed (`compile_vl`, `fmt`). `deserialize_file`
/// is unsafe because a corrupt/forged artifact is UB — we only ever load a sidecar
/// this same binary wrote next to the module it was derived from.
fn load_compiler(engine: &Engine, source: &CompilerSource) -> Result<(Store<()>, Instance)> {
    let module = load_compiler_module(engine, source)?;
    let mut store = Store::new(engine, ());
    let linker = Linker::new(engine);
    let inst = linker.instantiate(&mut store, &module)?;
    Ok((store, inst))
}

/// The module-loading half of `load_compiler` (the `.cwasm` sidecar dance), split
/// out so `vl run --batch` can load + Cranelift-cache the compiler ONCE and then
/// instantiate it freshly per case (a fresh Store per case keeps cases isolated;
/// the Module — the expensive half — is engine-level and shareable).
fn load_compiler_module(engine: &Engine, source: &CompilerSource) -> Result<Module> {
    let module = match source {
        // Embedded seed (a `--features embed-seed` release binary). Its cache lives in
        // the user cache dir rather than beside the module, since a distributed `vl`
        // has no `build/` of its own — and it is CONTENT-KEYED, so there is no
        // freshness question to ask (different bytes ⇒ different file).
        CompilerSource::Embedded(bytes) => cached_module(
            engine,
            seed_cache_path().as_deref(),
            true,
            || {
                Module::from_binary(engine, bytes)
                    .map_err(|e| e.context("loading the embedded compiler seed"))
            },
        )?,
        // On-disk seed: the sidecar sits next to it and is keyed by FRESHNESS —
        // rebuilt whenever the `.wasm` is newer than its `.cwasm`.
        CompilerSource::Path(compiler_path) => {
            let sidecar = std::path::PathBuf::from(format!("{compiler_path}.cwasm"));
            let fresh = match (
                std::fs::metadata(&sidecar),
                std::fs::metadata(compiler_path),
            ) {
                (Ok(c), Ok(w)) => {
                    matches!((c.modified(), w.modified()), (Ok(cm), Ok(wm)) if cm >= wm)
                }
                _ => false,
            };
            cached_module(engine, Some(&sidecar), fresh, || {
                Module::from_file(engine, compiler_path).map_err(|e| {
                    e.context(format!(
                        "loading compiler module `{compiler_path}` (build it with: scripts/refresh-compiler.sh)"
                    ))
                })
            })?
        }
    };
    Ok(module)
}

/// Load a compiler module through a Cranelift-compilation cache: deserialize `cache`
/// when it exists and `usable` says it is not superseded, else `compile` and publish
/// the result there. Compiling the ~1 MB seed takes SECONDS and deserializing takes
/// milliseconds, so this is the difference between a usable CLI and an unusable one.
///
/// `cache: None` means "no cache available" (no home dir, or a non-embed build) —
/// every call compiles, correct but slow.
///
/// Publishing is best-effort in every direction: a read-only or full cache dir is
/// non-fatal, and a cache entry that fails to deserialize (a different wasmtime
/// version or engine config — e.g. a CI cache restoring a sidecar with its mtime
/// intact, or a changed `$VL_GC`) falls through to a recompile that REWRITES it, so
/// the miss costs one invocation instead of every later one.
///
/// `deserialize_file` is unsafe because a corrupt or forged artifact is UB — we only
/// ever read a file this same binary wrote for this same module.
fn cached_module(
    engine: &Engine,
    cache: Option<&std::path::Path>,
    usable: bool,
    compile: impl Fn() -> Result<Module>,
) -> Result<Module> {
    let compile_and_cache = || -> Result<Module> {
        let m = compile()?;
        if let (Some(path), Ok(bytes)) = (cache, m.serialize()) {
            // Atomic publish: write a unique temp then rename() into place. Parallel
            // `vl` processes race otherwise — `fs::write` truncates-then-writes, and a
            // concurrent `deserialize_file` MMAPS this file, so a torn read is UB (an
            // intermittent hang/crash — surfaced as lint-self.sh's per-file `vl fmt`
            // fan-out stalling in CI). rename(2) is atomic on POSIX: a reader sees
            // either the whole old or whole new file, and an existing mmap keeps the
            // old inode. Best-effort still.
            let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
            if std::fs::write(&tmp, &bytes).is_ok() && std::fs::rename(&tmp, path).is_err() {
                let _ = std::fs::remove_file(&tmp);
            }
        }
        Ok(m)
    };
    Ok(match cache {
        Some(path) if usable => match unsafe { Module::deserialize_file(engine, path) } {
            Ok(m) => m,
            Err(_) => compile_and_cache()?, // stale config/version — recompile
        },
        _ => compile_and_cache()?,
    })
}

/// Read a file as UTF-8, distinguishing "missing/unreadable" from "present but
/// not UTF-8": the latter gets a stderr note naming the real cause — otherwise
/// it surfaces downstream as a generic "cannot read" / "cannot resolve import"
/// diagnostic pointing the user at the wrong problem.
fn read_utf8(path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    match String::from_utf8(bytes) {
        Ok(s) => Some(s),
        Err(e) => {
            eprintln!(
                "vl: `{}` is not valid UTF-8 (first invalid byte at offset {}) — treating it as unreadable",
                path.display(),
                e.utf8_error().valid_up_to()
            );
            None
        }
    }
}

/// One string-INPUT channel into the compiler module (`src`, `modKey`, `modSrc`,
/// `cliResult`, …): the required per-code-point `<name>Push(cp)` export, plus two
/// optional BATCHED variants probed from the instance — the same graceful-ABI-
/// fallback idiom as `render_diags` and the module fetch loop. A seed exporting
/// them gets the batched path; a seed that predates them falls back to
/// per-code-point pushes, byte-identical in behavior.
///
/// Batched ABI (live since the seed grew `srcLoad`/`modKeyLoad`/`modSrcLoad`/
/// `cliResultLoad` — `compiler/driver.vl`'s `srcLoad` header owns the protocol):
///   `<name>Reserve(n: i32) -> i32` — capacity hint: about to append n more code
///       points (lets the buffer preallocate once instead of growing per push).
///       No seed exports one: VL has no list-capacity primitive, and `.push`'s 2×
///       growth already bounds the copy. Probed anyway — the two halves are
///       INDEPENDENTLY optional, so a seed may offer either, both or neither.
///   the staging memory + `<name>Load(count: i32) -> i32` — append the `count`
///       UTF-32LE code points the host wrote at mem[0..4*count).
///
/// The staging memory is probed as `ioMem` FIRST and then as `memory`. `ioMem` was
/// this ABI's private name, written before VL had linear memory at all; since P0.2
/// (`buffer-design.md` §C5, ruling O4(i)) a module that touches linear memory
/// exports it AUTOMATICALLY under the universal name `memory`, and there is no way
/// for a `.vl` file to name it anything else — nor should there be, since a
/// bespoke export name for the compiler's own memory would be language surface
/// invented for one consumer. So `memory` is the name that actually arrives and
/// `ioMem` is kept as the first probe: it costs one failed lookup at startup and
/// keeps the door open for a module that ever does dedicate a second memory to
/// staging. Widening a probe is back-compatible in BOTH directions — an old seed
/// exports neither and falls back, and an old host finds neither on a new seed and
/// falls back too (see the fallback-composition proofs in `perf-program.md` §6).
struct StrIn {
    push: TypedFunc<i32, i32>,
    reserve: Option<TypedFunc<i32, i32>>,
    bulk: Option<(Memory, TypedFunc<i32, i32>)>,
}

impl StrIn {
    /// Errors only when the required `<name>Push` export is missing/mistyped, so
    /// callers gate on it exactly as they gated on `get_typed_func` before.
    fn probe(store: &mut Store<()>, inst: &Instance, name: &str) -> Result<Self> {
        let push = inst.get_typed_func::<i32, i32>(&mut *store, &format!("{name}Push"))?;
        let reserve = inst
            .get_typed_func::<i32, i32>(&mut *store, &format!("{name}Reserve"))
            .ok();
        let mem = io_mem(&mut *store, inst);
        let bulk = mem
            .zip(inst.get_typed_func::<i32, i32>(&mut *store, &format!("{name}Load")).ok());
        Ok(StrIn { push, reserve, bulk })
    }

    /// Send one whole string: reserve hint (when offered), then memory-staged
    /// chunks (when offered), else one `Push` call per code point.
    fn send(&self, store: &mut Store<()>, s: &str) -> Result<()> {
        if self.reserve.is_some() || self.bulk.is_some() {
            let n = s.chars().count();
            if let Some(reserve) = &self.reserve {
                reserve.call(&mut *store, n as i32)?;
            }
            if let Some((mem, load)) = &self.bulk {
                let cap = mem.data_size(&mut *store) / 4;
                if cap > 0 {
                    let mut chars = s.chars().peekable();
                    let mut bytes: Vec<u8> = Vec::with_capacity(cap.min(n) * 4);
                    while chars.peek().is_some() {
                        bytes.clear();
                        for ch in chars.by_ref().take(cap) {
                            bytes.extend_from_slice(&(ch as u32).to_le_bytes());
                        }
                        mem.write(&mut *store, 0, &bytes)?;
                        load.call(&mut *store, (bytes.len() / 4) as i32)?;
                    }
                    return Ok(());
                }
            }
        }
        for ch in s.chars() {
            self.push.call(&mut *store, ch as i32)?;
        }
        Ok(())
    }
}

/// The module's staging window for BOTH directions of the bulk ABI: `ioMem` first,
/// then `memory`. See `StrIn`'s header for why the second name is the one that
/// actually arrives and why the first is kept.
fn io_mem(store: &mut Store<()>, inst: &Instance) -> Option<Memory> {
    inst.get_memory(&mut *store, "ioMem")
        .or_else(|| inst.get_memory(&mut *store, "memory"))
}

/// One BYTE-output channel out of the compiler module (`rbyte` — the emitted wasm):
/// the required `<name>Len()` / `<name>At(i)` accessor pair, plus the optional bulk
/// `<name>Store(off, count)` probed from the instance. It is the exact mirror of
/// `StrIn`, and the same graceful-ABI-fallback idiom: a seed exporting `Store` gets
/// the bulk path, a seed that predates it falls back to one call per byte,
/// byte-identical in behaviour.
///
/// Bulk ABI (`compiler/driver.vl`'s `rbyteStore` header owns the protocol): the
/// guest packs `written` bytes FOUR PER i32 WORD, little-endian, at byte 0 of the
/// staging memory and returns `written`; the host copies `mem[0..written)` straight
/// out. Chunk = the whole window (65,536 bytes), so a ~1.1 MB self-compile reads
/// back in 17 calls instead of 1,112,716.
///
/// A `Store` that returns 0, a negative, or more than it was asked for is a
/// PROTOCOL VIOLATION and fails the read. It is deliberately not "fall back and
/// carry on": re-asking from the same offset is an infinite loop, and a hang is a
/// witness that breaks every comparator downstream of it (`perf-program.md` §6.7).
struct BytesOut {
    name: String,
    len: TypedFunc<(), i32>,
    at: TypedFunc<i32, i32>,
    bulk: Option<(Memory, TypedFunc<(i32, i32), i32>)>,
}

impl BytesOut {
    /// Errors only when the required `<name>Len`/`<name>At` exports are missing or
    /// mistyped, so callers gate on them exactly as they gated on `get_typed_func`.
    fn probe(store: &mut Store<()>, inst: &Instance, name: &str) -> Result<Self> {
        let len = inst.get_typed_func::<(), i32>(&mut *store, &format!("{name}Len"))?;
        let at = inst.get_typed_func::<i32, i32>(&mut *store, &format!("{name}At"))?;
        let bulk = io_mem(&mut *store, inst).zip(
            inst.get_typed_func::<(i32, i32), i32>(&mut *store, &format!("{name}Store"))
                .ok(),
        );
        Ok(BytesOut { name: name.to_string(), len, at, bulk })
    }

    fn read(&self, store: &mut Store<()>) -> Result<Vec<u8>> {
        let n = self.len.call(&mut *store, ())?.max(0);
        let mut out: Vec<u8> = Vec::with_capacity(n as usize);
        if let Some((mem, store_fn)) = &self.bulk {
            let cap = mem.data_size(&mut *store);
            if cap > 0 {
                let mut off = 0i32;
                while off < n {
                    let want = ((n - off) as usize).min(cap) as i32;
                    let got = store_fn.call(&mut *store, (off, want))?;
                    if got <= 0 || got > want {
                        bail!(
                            "{}Store({off}, {want}) returned {got} — bulk read-back ABI violation",
                            self.name
                        );
                    }
                    out.extend_from_slice(&mem.data(&*store)[..got as usize]);
                    off += got;
                }
                return Ok(out);
            }
        }
        for i in 0..n {
            out.push(self.at.call(&mut *store, i)? as u8);
        }
        Ok(out)
    }
}

/// One STRING-output channel out of the compiler module (`cliCmdData`, `cliCmdPath`,
/// …): the `<name>Len()` / `<name>At(j)` code-point accessor pair plus the optional
/// bulk `<name>Store(off, count)`, which writes `written` UTF-32LE code points at
/// byte 0 of the staging memory. Same protocol and same failure rule as `BytesOut`;
/// the chunk is `memory_size / 4` code points because the element is already a word.
///
/// `cliCmdPath` deliberately has NO `Store` twin in the compiler, so the fallback
/// arm here is not a museum piece for old seeds — it runs on every `vl check`.
struct StrOut {
    name: String,
    len: TypedFunc<(), i32>,
    at: TypedFunc<i32, i32>,
    bulk: Option<(Memory, TypedFunc<(i32, i32), i32>)>,
}

impl StrOut {
    fn probe(store: &mut Store<()>, inst: &Instance, name: &str) -> Result<Self> {
        let len = inst.get_typed_func::<(), i32>(&mut *store, &format!("{name}Len"))?;
        let at = inst.get_typed_func::<i32, i32>(&mut *store, &format!("{name}At"))?;
        let bulk = io_mem(&mut *store, inst).zip(
            inst.get_typed_func::<(i32, i32), i32>(&mut *store, &format!("{name}Store"))
                .ok(),
        );
        Ok(StrOut { name: name.to_string(), len, at, bulk })
    }

    fn read(&self, store: &mut Store<()>) -> Result<String> {
        let n = self.len.call(&mut *store, ())?.max(0);
        let mut s = String::with_capacity(n as usize);
        if let Some((mem, store_fn)) = &self.bulk {
            let cap = mem.data_size(&mut *store) / 4;
            if cap > 0 {
                let mut off = 0i32;
                while off < n {
                    let want = ((n - off) as usize).min(cap) as i32;
                    let got = store_fn.call(&mut *store, (off, want))?;
                    if got <= 0 || got > want {
                        bail!(
                            "{}Store({off}, {want}) returned {got} — bulk read-back ABI violation",
                            self.name
                        );
                    }
                    let data = mem.data(&*store);
                    for k in 0..got as usize {
                        let v = u32::from_le_bytes([
                            data[k * 4],
                            data[k * 4 + 1],
                            data[k * 4 + 2],
                            data[k * 4 + 3],
                        ]);
                        push_cp(&mut s, v, off + k as i32);
                    }
                    off += got;
                }
                return Ok(s);
            }
        }
        for j in 0..n {
            let v = self.at.call(&mut *store, j)? as u32;
            push_cp(&mut s, v, j);
        }
        Ok(s)
    }
}

/// Append one UTF-32 code point to a payload being read back. The seed only stores
/// code points that came from valid strings, so an unmappable value is a protocol
/// bug — surface it in debug builds rather than silently shortening the payload.
fn push_cp(s: &mut String, v: u32, j: i32) {
    match char::from_u32(v) {
        Some(c) => s.push(c),
        None => debug_assert!(false, "invalid code point {v:#x} in a CLI payload at index {j}"),
    }
}

/// Stage `source` (as `source_path`) into a freshly-loaded compiler instance: run
/// the module fetch loop when it has imports, then `srcReset` + `srcPush`. Leaves
/// the instance ready for a `checkSrc` / `compileSrc` / `lintSrc` call. Used by
/// `compile_vl` (build/run); `check` drives its own module fetch from VL via the
/// command-queue pump.
fn stage_program(store: &mut Store<()>, inst: &Instance, source: &str, source_path: &str) -> Result<()> {
    let src_reset = inst.get_typed_func::<(), i32>(&mut *store, "srcReset")?;
    let src_in = StrIn::probe(store, inst, "src")?;

    // Multi-file module resolution (H3): when the source has a line-leading
    // `import {` (the host CLI's cheap textual gate — an import-free file keeps
    // the single-source path byte-identical) AND the compiler module exposes the
    // module-table exports (older seeds: fall back to today's behavior), run the
    // FETCH LOOP — commit the entry, then read + commit whatever resolved keys
    // the compiler still needs, until the graph is closed. Module keys are
    // `/`-separated paths relative to whatever the entry path was, so the host
    // just reads them; a missing file commits `found = 0` (the unresolvable
    // diagnostic fires inside the wasm instead of an infinite re-request).
    // A re-export (`export { … } from "…"`) is a module dependency too, so it must
    // also arm the fetch loop — gate on a leading `import {` OR `export {`.
    let has_imports = source.lines().any(|l| {
        let t = l.trim_start();
        let imp = t
            .strip_prefix("import")
            .map(|rest| rest.trim_start().starts_with('{'))
            .unwrap_or(false);
        let reexp = t
            .strip_prefix("export")
            .map(|rest| rest.trim_start().starts_with('{'))
            .unwrap_or(false);
        imp || reexp
    });
    // Set when the module fetch loop stages the program: `compileSrc`/`checkSrc`
    // then run the module pipeline off the module table and never read the
    // single-source buffer, so pushing the entry source AGAIN through the
    // per-code-point boundary would only double the staging cost.
    let mut staged_via_modules = false;
    if has_imports {
        if let (Ok(mod_reset), Ok(key_in), Ok(msrc_in), Ok(commit), Ok(pend_n), Ok(pend_len), Ok(pend_at)) = (
            inst.get_typed_func::<(), i32>(&mut *store, "modReset"),
            StrIn::probe(&mut *store, inst, "modKey"),
            StrIn::probe(&mut *store, inst, "modSrc"),
            inst.get_typed_func::<i32, i32>(&mut *store, "modCommit"),
            inst.get_typed_func::<(), i32>(&mut *store, "modPendingCount"),
            inst.get_typed_func::<i32, i32>(&mut *store, "modPendingLen"),
            inst.get_typed_func::<(i32, i32), i32>(&mut *store, "modPendingAt"),
        ) {
            let commit_module =
                |store: &mut Store<()>, key: &str, src: Option<&str>| -> Result<()> {
                    key_in.send(store, key)?;
                    if let Some(s) = src {
                        msrc_in.send(store, s)?;
                    }
                    commit.call(&mut *store, if src.is_some() { 1 } else { 0 })?;
                    Ok(())
                };
            mod_reset.call(&mut *store, ())?;
            commit_module(store, source_path, Some(source))?;
            loop {
                let n = pend_n.call(&mut *store, ())?;
                if n == 0 {
                    break;
                }
                // Snapshot the pending keys first — committing mutates the list.
                let mut keys = Vec::with_capacity(n as usize);
                for i in 0..n {
                    let len = pend_len.call(&mut *store, i)?;
                    let mut key = String::with_capacity(len as usize);
                    for j in 0..len {
                        if let Some(c) = char::from_u32(pend_at.call(&mut *store, (i, j))? as u32) {
                            key.push(c);
                        }
                    }
                    keys.push(key);
                }
                for key in keys {
                    // A `std:` key maps to `<stdDir>/<name>.vl` (slash segments
                    // are subdirectories: `std:a/b` → `<stdDir>/a/b.vl`); every
                    // other key is a filesystem path read as-is. A missing file
                    // commits `found = 0` either way (the compiler's
                    // Cannot-resolve diagnostic fires, never the host).
                    let src = match key.strip_prefix("std:") {
                        Some(name) => read_std_module(name),
                        None => read_utf8(std::path::Path::new(&key)),
                    };
                    commit_module(store, &key, src.as_deref())?;
                }
            }
            staged_via_modules = true;
        }
    }

    if !staged_via_modules {
        src_reset.call(&mut *store, ())?;
        src_in.send(store, source)?;
    }
    Ok(())
}

/// Coarse phase timer, active only when `$VL_PROFILE` is set. Prints
/// `[profile] <label>: <ms>` to stderr so the self-compile pipeline can be
/// attributed (load/deserialize vs staging vs compile vs readback) without perf.
macro_rules! phase {
    ($label:expr, $body:expr) => {{
        let profiling = std::env::var_os("VL_PROFILE").is_some();
        let t0 = profiling.then(std::time::Instant::now);
        let r = $body;
        if let Some(t0) = t0 {
            eprintln!("[profile] {}: {} ms", $label, t0.elapsed().as_millis());
        }
        r
    }};
}

fn compile_vl(
    engine: &Engine,
    compiler: &CompilerSource,
    source: &str,
    source_path: &str,
    entry: &str,
    emit_names: bool,
) -> Result<Vec<u8>> {
    // `$VL_PROFILE_GUEST=<out.json>`: run this compile under a SAMPLING guest
    // profiler and write a Firefox-profiler JSON, for function-level attribution
    // of time spent INSIDE the compiler wasm. Diagnostics-only path.
    if let Ok(out) = std::env::var("VL_PROFILE_GUEST") {
        if let CompilerSource::Path(p) = compiler {
            return compile_vl_guest_profiled(p, &out, source, source_path, entry, emit_names);
        }
    }
    let (mut store, inst) = phase!("load_compiler", load_compiler(engine, compiler))?;
    compile_vl_instance(&mut store, &inst, source, source_path, entry, emit_names)
}

/// The `$VL_PROFILE_GUEST` path: like `compile_vl`, but on its own engine with
/// EPOCH INTERRUPTION enabled — a timer thread bumps the epoch every ~1ms and the
/// deadline callback takes a `GuestProfiler` stack sample, so the profile names
/// where the compiler spends its time (build the seed with `--names` for legible
/// frames). Deliberately bypasses the `.cwasm` sidecar: epoch-instrumented code
/// has a different Engine config, and caching it would poison the sidecar every
/// normal run then re-heals.
fn compile_vl_guest_profiled(
    compiler_path: &str,
    out_path: &str,
    source: &str,
    source_path: &str,
    entry: &str,
    emit_names: bool,
) -> Result<Vec<u8>> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;
    const INTERVAL: Duration = Duration::from_millis(1);

    let mut cfg = Config::new();
    cfg.wasm_gc(true);
    cfg.wasm_function_references(true);
    cfg.collector(Collector::Null);
    cfg.gc_heap_reservation(8 << 30);
    cfg.epoch_interruption(true);
    let engine = Engine::new(&cfg)?;
    let module = Module::from_file(&engine, compiler_path)
        .map_err(|e| e.context(format!("loading compiler module `{compiler_path}`")))?;
    let mut store = Store::new(&engine, ());

    let profiler = Arc::new(Mutex::new(Some(GuestProfiler::new(
        &engine,
        "vl-compiler",
        INTERVAL,
        vec![("vl-compiler".to_string(), module.clone())],
    )?)));
    let stop = Arc::new(AtomicBool::new(false));
    let timer = {
        let stop = stop.clone();
        let weak = engine.weak();
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(INTERVAL);
                match weak.upgrade() {
                    Some(engine) => engine.increment_epoch(),
                    None => break,
                }
            }
        })
    };
    // Deadline + callback must be armed BEFORE instantiation: with epoch
    // interruption enabled the store's default deadline is 0 and the default
    // behavior is TRAP, so the module's start function would die immediately.
    store.set_epoch_deadline(1);
    let prof = profiler.clone();
    store.epoch_deadline_callback(move |cx| {
        if let Some(p) = prof.lock().unwrap().as_mut() {
            p.sample(&cx, INTERVAL);
        }
        Ok(UpdateDeadline::Continue(1))
    });
    let inst = Linker::new(&engine).instantiate(&mut store, &module)?;

    let result = compile_vl_instance(&mut store, &inst, source, source_path, entry, emit_names);
    stop.store(true, Ordering::Relaxed);
    let _ = timer.join();
    if let Some(p) = profiler.lock().unwrap().take() {
        let f = std::fs::File::create(out_path)
            .map_err(|e| Error::from(e).context(format!("creating guest profile `{out_path}`")))?;
        p.finish(std::io::BufWriter::new(f))?;
        eprintln!("[profile] guest profile written to {out_path} (load in https://profiler.firefox.com)");
    }
    result
}

/// The per-invocation body of `compile_vl`, over an already-instantiated compiler:
/// stage the source, call `entry`, read the emitted bytes back (or the compiler's
/// diagnostics as the error). `vl run --batch` instantiates the compiler once per
/// case (cheap) from a once-loaded Module (expensive) and calls this directly.
fn compile_vl_instance(
    store: &mut Store<()>,
    inst: &Instance,
    source: &str,
    source_path: &str,
    entry: &str,
    emit_names: bool,
) -> Result<Vec<u8>> {
    let mut store = store;

    let compile = inst.get_typed_func::<(), i32>(&mut store, entry)?;
    let result = BytesOut::probe(&mut store, inst, "rbyte")?;

    // Opt into the wasm "name" custom section so trap backtraces name functions.
    // The export is OFF by default (the compiler leaves goldens byte-identical);
    // we flip it on only here, for the native tool's build/run paths. The export
    // is absent from older compiler modules, so treat a missing symbol as a no-op.
    if emit_names {
        if let Ok(set_names) = inst.get_typed_func::<i32, i32>(&mut store, "setEmitNames") {
            set_names.call(&mut store, 1)?;
        }
    }

    // Rep-tree differential mode ($VL_REP_SHADOW): arm the guest's shadow
    // harness (same missing-export tolerance as `setEmitNames` — older
    // compiler modules just no-op) and read its disagreement + coverage
    // report back to stderr after the compile. Debug-only: the baseline
    // gates run with the variable unset, where the harness costs the guest
    // one boolean test and prints nothing.
    let rep_shadow = std::env::var_os("VL_REP_SHADOW").is_some();
    if rep_shadow {
        if let Ok(set) = inst.get_typed_func::<i32, i32>(&mut store, "setRepShadow") {
            set.call(&mut store, 1)?;
        }
    }

    phase!("stage_program", stage_program(store, inst, source, source_path))?;
    let rc = phase!("compile.call", compile.call(&mut store, ()))?;
    if rc != 0 {
        let stage = match rc {
            1 => "parse",
            2 => "type",
            _ => "emit",
        };
        let diags = render_diags(inst, store, source_path)?;
        bail!("{stage} error\n{}", diags.trim_end());
    }
    let bytes = phase!("readback", result.read(&mut store))?;
    if rep_shadow {
        report_rep_shadow(inst, &mut store, source_path)?;
    }
    Ok(bytes)
}

/// Stream the guest's rep-shadow report ($VL_REP_SHADOW mode) to stderr: one
/// greppable `rep-shadow[path]` line per coverage tally / unsupported-reason
/// bucket / flat-vs-tree disagreement (the `render_diags` accessor pattern —
/// strings cross the no-import boundary one code point at a time). Tolerates a
/// compiler module without the exports (a pre-harness seed): silent no-op.
fn report_rep_shadow(inst: &Instance, store: &mut Store<()>, path: &str) -> Result<()> {
    let read_str = |store: &mut Store<()>,
                    len_of: &TypedFunc<i32, i32>,
                    at: &TypedFunc<(i32, i32), i32>,
                    i: i32|
     -> Result<String> {
        let len = len_of.call(&mut *store, i)?;
        let mut s = String::with_capacity(len as usize);
        for j in 0..len {
            if let Some(c) = char::from_u32(at.call(&mut *store, (i, j))? as u32) {
                s.push(c);
            }
        }
        Ok(s)
    };
    if let (Ok(stat), Ok(rcount), Ok(rlen), Ok(rat), Ok(rn), Ok(mcount), Ok(mlen), Ok(mat)) = (
        inst.get_typed_func::<i32, i32>(&mut *store, "repShadowStat"),
        inst.get_typed_func::<(), i32>(&mut *store, "repShadowReasonCount"),
        inst.get_typed_func::<i32, i32>(&mut *store, "repShadowReasonLen"),
        inst.get_typed_func::<(i32, i32), i32>(&mut *store, "repShadowReasonAt"),
        inst.get_typed_func::<i32, i32>(&mut *store, "repShadowReasonN"),
        inst.get_typed_func::<(), i32>(&mut *store, "repShadowCount"),
        inst.get_typed_func::<i32, i32>(&mut *store, "repShadowMsgLen"),
        inst.get_typed_func::<(i32, i32), i32>(&mut *store, "repShadowMsgAt"),
    ) {
        let total = stat.call(&mut *store, 0)?;
        let real = stat.call(&mut *store, 1)?;
        eprintln!("rep-shadow[{path}]: types={total} real={real}");
        for i in 0..rcount.call(&mut *store, ())? {
            let name = read_str(&mut *store, &rlen, &rat, i)?;
            let n = rn.call(&mut *store, i)?;
            eprintln!("rep-shadow[{path}]: unsup {name} x{n}");
        }
        for i in 0..mcount.call(&mut *store, ())? {
            let msg = read_str(&mut *store, &mlen, &mat, i)?;
            eprintln!("rep-shadow[{path}]: DISAGREE {msg}");
        }
    }
    Ok(())
}

/// Render an f64 exactly as JS `String(v)` does (ECMA-262 `Number::toString`, radix
/// 10) — the rule this host's float print sinks have always CLAIMED to follow, since
/// `tests/support/runWasm.ts` and `playground/src/runtime.ts` both sink through
/// `String(v)` and a corpus `@log` line has to match under either host.
///
/// Rust's `{}` Display already produces the SHORTEST round-tripping digit string,
/// which is the same digit string JS produces — the two disagree only on FORMATTING,
/// in four places. Each was measured against Deno on the same wasm module, not
/// inferred:
///
/// | value           | Rust `{}`                | JS `String(v)` |
/// | --------------- | ------------------------ | -------------- |
/// | `-0.0`          | `-0`                      | `0`            |
/// | `1e21`          | `1000000000000000000000`  | `1e+21`        |
/// | `1e-7`          | `0.0000001`               | `1e-7`         |
/// | `f64::INFINITY` | `inf`                     | `Infinity`     |
///
/// Only the first was filed; the census that verified it found the other three. The
/// old comment here said Display "matches JS `String(v)` for the corpus values",
/// which was true of the corpus and false of the rule.
///
/// The digits come from `{:e}` (`<d>[.<ddd>]e<exp>`), whose mantissa is that same
/// shortest representation and whose exponent is the spec's `n - 1`.
fn js_number_to_string(v: f64) -> String {
    if v.is_nan() {
        return "NaN".to_string();
    }
    if v.is_infinite() {
        return if v > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    // `v == 0.0` holds for BOTH signs of zero, which is exactly the spec's rule:
    // `Number::toString` returns "0" for -0 as well as +0.
    if v == 0.0 {
        return "0".to_string();
    }
    let neg = v < 0.0;
    let sci = format!("{:e}", v.abs());
    let (mant, exp) = sci
        .split_once('e')
        .expect("Rust's {:e} always emits an exponent");
    // `s` in the spec's terms: the shortest digit string, no radix point.
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp.parse::<i32>().expect("{:e} exponent is an integer") + 1;
    let body = if k <= n && n <= 21 {
        // Integral, no exponent needed: the digits then `n - k` zeros.
        format!("{}{}", digits, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        // A radix point inside the digits.
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        // Leading "0." then `-n` zeros. The `-6` boundary is the spec's, and is why
        // `1e-6` prints positionally (`0.000001`) while `1e-7` does not.
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        // Exponential form. The exponent is always signed, and the radix point
        // appears only when there is more than one digit (`1e+21`, not `1.e+21`).
        let e = n - 1;
        let head = if k == 1 {
            digits.clone()
        } else {
            format!("{}.{}", &digits[..1], &digits[1..])
        };
        format!("{}e{}{}", head, if e >= 0 { "+" } else { "-" }, e.abs())
    };
    if neg {
        format!("-{body}")
    } else {
        body
    }
}

/// A VL-level explanation for a wasm trap, or `None` when the trap carries no VL
/// meaning worth restating.
///
/// A trap escapes as `wasm trap: integer overflow` over an address backtrace: that
/// names the OPCODE that refused, which is the one thing a VL author cannot act on.
/// Every arm below maps a trap code back to the VL SOURCE CONSTRUCT that emits it.
///
/// These are the deliberate stops of the language, not accidents: VL's numeric
/// conversions trap instead of manufacturing a value out of one they cannot
/// represent (docs/internals/numeric-conversion-ruling.md). Where several
/// constructs share a trap code the text lists them — the host cannot tell them
/// apart, and guessing one would send the reader to the wrong line.
fn trap_explanation(trap: Trap) -> Option<&'static str> {
    Some(match trap {
        // `i32.trunc_f64_s` and friends. VL's `as` traps rather than saturating
        // (Rust) or wrapping (JS) — the ruling and its alternatives are written up
        // in docs/internals/numeric-conversion-ruling.md.
        Trap::IntegerOverflow => {
            "a float→integer conversion (`as i32` / `as i64`) whose value lies outside \
             the target integer's range, or `i32.MIN / -1`.\n      \
             VL truncates toward zero and TRAPS out of range — it does not saturate \
             (as Rust does) or wrap (as JS does).\n      \
             Guard the range before converting."
        }
        Trap::BadConversionToInteger => {
            "a float→integer conversion (`as i32` / `as i64`) whose value is NaN or \
             infinite.\n      \
             No integer represents these, so VL stops rather than inventing 0."
        }
        Trap::IntegerDivisionByZero => "an integer division or remainder by zero.",
        Trap::ArrayOutOfBounds | Trap::TableOutOfBounds => {
            "an index outside the bounds of an array."
        }
        Trap::MemoryOutOfBounds => "a load or store outside the bounds of memory.",
        Trap::NullReference => "a null value was used where a non-null one was required.",
        Trap::CastFailure => "a value was not an instance of the type it was narrowed to.",
        Trap::StackOverflow => "the call stack was exhausted — most often unbounded recursion.",
        // The failure mode a long `vl check`/`vl fmt` directory walk hits: the pump's
        // GC heap could not satisfy a request. `cli_pump` uses a COLLECTING collector
        // for exactly this reason, so reaching here means a genuinely oversized
        // allocation rather than accumulated garbage.
        Trap::AllocationTooLarge => {
            "an allocation larger than the GC heap can ever hold."
        }
        Trap::UnreachableCodeReached => "an `unreachable` instruction — a compiler-emitted trap.",
        _ => return None,
    })
}

/// Instantiate an emitted VL program with the host print-import family and run it
/// (top-level statements run via the wasm start function). Print output streams to
/// stdout as it arrives.
fn run_program(engine: &Engine, bytes: &[u8]) -> Result<()> {
    run_program_with(engine, bytes, |line| println!("{line}"))
}

/// `run_program` with the print destination injected: every print import emits one
/// LINE through `sink`. The default (`run_program`) streams lines to stdout as they
/// arrive, byte-identical to before; `vl run --batch` captures them into a per-case
/// buffer instead (many programs, one process, separated outputs).
fn run_program_with(
    engine: &Engine,
    bytes: &[u8],
    sink: impl Fn(&str) + Send + Sync + Clone + 'static,
) -> Result<()> {
    let module = Module::new(engine, bytes)?;
    // The instance is dropped: `vl run` runs the start function (the program's top
    // level) and exits. `vl test` needs the instance back to call exports on it, so
    // it goes through `instantiate_program` directly.
    let _ = instantiate_program(engine, &module, sink)?;
    Ok(())
}

/// Instantiate an already-loaded program module with the host print-import family,
/// returning the live store + instance. Instantiation RUNS the start function (the
/// VL program's top level), which for a `*.test.vl` module is the registration pass.
///
/// Every print import emits one LINE through `sink`; the sink is `Send + Sync +
/// Clone + 'static` so a test worker can point it at that worker's own capture
/// buffer, which is what makes per-test output attribution structural rather than
/// console-patching (each instance runs one test at a time).
fn instantiate_program(
    engine: &Engine,
    module: &Module,
    sink: impl Fn(&str) + Send + Sync + Clone + 'static,
) -> Result<(Store<()>, Instance)> {
    let chars: Arc<Mutex<Vec<u32>>> = Arc::default();
    let mut store = Store::new(engine, ());
    let mut linker = Linker::new(engine);

    let s = sink.clone();
    linker.func_wrap("imports", "__print_i32__", move |v: i32| s(&v.to_string()))?;
    let s = sink.clone();
    linker.func_wrap("imports", "__print_i64__", move |v: i64| s(&v.to_string()))?;
    // f64: rendered through `js_number_to_string`, which IS JS `String(v)` — the JS
    // hosts (`tests/support/runWasm.ts`, `playground/src/runtime.ts`) sink through
    // `String(v)`, so a corpus `@log` line has to read the same under either. Display
    // alone diverges on negative zero, on magnitudes outside 1e-7..1e21, and on the
    // infinities; see that function. (Slice 3.)
    let s = sink.clone();
    linker.func_wrap("imports", "__print_f64__", move |v: f64| {
        s(&js_number_to_string(v))
    })?;
    // f32: widen to f64 first, because that is what the JS hosts see — a wasm f32
    // arrives as a JS number, i.e. its exact f64 value — then render by the same rule.
    // (Slice 5.)
    let s = sink.clone();
    linker.func_wrap("imports", "__print_f32__", move |v: f32| {
        s(&js_number_to_string(v as f64))
    })?;
    let s = sink.clone();
    linker.func_wrap("imports", "__print_bool__", move |v: i32| {
        s(if v != 0 { "true" } else { "false" })
    })?;
    let c = chars.clone();
    linker.func_wrap("imports", "__print_char__", move |code: i32| {
        c.lock().unwrap().push(code as u32);
    })?;
    let c = chars.clone();
    let s = sink.clone();
    linker.func_wrap("imports", "__print_str_flush__", move || {
        let mut buf = c.lock().unwrap();
        let line: String = buf.iter().filter_map(|&cp| char::from_u32(cp)).collect();
        buf.clear();
        s(&line);
    })?;

    // Instantiation runs the start function — the VL program's top level.
    let instance = linker.instantiate(&mut store, module)?;
    Ok((store, instance))
}

/// `vl run --batch --out-dir DIR <file.vl>... [--compiler seed]` — run MANY
/// programs in ONE process. The per-invocation fixed costs a `vl run` pays —
/// process spawn, two engine builds, deserializing + relocating the multi-MB
/// compiler `.cwasm` — are paid ONCE here, and each case only pays its own
/// (cheap) instantiate + compile + run. This is the fuzz loop's shape: the CI
/// rep-fuzz job runs hundreds of generated cases per seed, and the fixed costs
/// dominated each of them.
///
/// Cases stay ISOLATED: a fresh Store (its own GC heap) per case for both the
/// compiler instance and the program, so no state leaks between cases — only
/// the immutable engine-level Modules are shared.
///
/// Per input `<name>`, writes into DIR:
///   <name>.out — the program's print output (always written, even on failure)
///   <name>.err — the same rendered error a failing `vl run` prints to stderr
///                (compiler diagnostics / invalid-wasm / trap), only on failure
/// The process exit code is 0 unless the batch itself cannot run (bad flags,
/// unwritable DIR) — per-case failure is signalled by `<name>.err` existing, so
/// one bad case never aborts the rest of the batch.
fn run_batch(args: &[String]) -> Result<()> {
    let mut compiler: Option<String> = None;
    let mut out_dir: Option<String> = None;
    let mut files: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--compiler" => {
                compiler = args.get(i + 1).cloned();
                i += 1;
            }
            "--out-dir" => {
                out_dir = args.get(i + 1).cloned();
                i += 1;
            }
            "--batch" => {}
            a if !a.starts_with('-') => files.push(a.to_string()),
            other => bail!("vl run --batch: unknown flag `{other}`"),
        }
        i += 1;
    }
    let Some(out_dir) = out_dir else {
        bail!("usage: vl run --batch --out-dir <dir> <file.vl>...")
    };
    std::fs::create_dir_all(&out_dir)
        .map_err(|e| Error::from(e).context(format!("creating --out-dir `{out_dir}`")))?;
    let compiler = resolve_compiler(compiler);

    let compile_engine = gc_engine(Collector::Null)?;
    let run_engine = gc_engine(run_collector()?)?;
    let module = load_compiler_module(&compile_engine, &compiler)?;
    // Pre-link once; `instantiate_pre` re-checks nothing per case.
    let pre = Linker::new(&compile_engine).instantiate_pre(&module)?;

    for f in &files {
        let name = std::path::Path::new(f)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| f.clone());
        let captured: Arc<Mutex<String>> = Arc::default();
        let sink = {
            let buf = captured.clone();
            move |line: &str| {
                let mut b = buf.lock().unwrap();
                b.push_str(line);
                b.push('\n');
            }
        };
        // Same pipeline as a single `vl run <file>`: prebuilt wasm runs directly,
        // source compiles through the seed (names on, like `compile_and_run`).
        let result = (|| -> Result<()> {
            let raw = std::fs::read(f)
                .map_err(|e| Error::from(e).context(format!("reading `{f}`")))?;
            let bytes = if raw.starts_with(b"\0asm") {
                raw
            } else {
                let source = String::from_utf8(raw).map_err(|e| {
                    Error::from(e)
                        .context(format!("`{f}` is neither UTF-8 VL source nor a wasm module"))
                })?;
                let mut store = Store::new(&compile_engine, ());
                let inst = pre.instantiate(&mut store)?;
                compile_vl_instance(&mut store, &inst, &source, f, "compileSrc", true)?
            };
            run_program_with(&run_engine, &bytes, sink.clone())
        })();
        std::fs::write(format!("{out_dir}/{name}.out"), captured.lock().unwrap().as_bytes())?;
        let err_path = format!("{out_dir}/{name}.err");
        match result {
            // Clear a stale `.err` so a reused DIR can't misclassify a pass.
            Ok(()) => {
                let _ = std::fs::remove_file(&err_path);
            }
            // `{e:?}` renders the same context chain a failing `vl run` prints via
            // `Error: {e:?}` on stderr, so downstream classification (grep for
            // "parse error" / "failed to parse WebAssembly" / trap text) is stable.
            Err(e) => std::fs::write(&err_path, format!("{e:?}\n"))?,
        }
    }
    Ok(())
}

/// Resolve a binaryen CLI tool (`wasm-opt` for `-O`, `wasm-dis` for `--wat`): an
/// explicit env override first (`$VL_WASM_OPT` / `$VL_WASM_DIS`), else a PATH scan.
/// `None` when none is found, so the optional passes degrade gracefully.
fn binaryen_tool(tool: &str, env_override: &str) -> Option<String> {
    if let Ok(p) = std::env::var(env_override) {
        return Some(p);
    }
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        let cand = format!("{dir}/{tool}");
        if std::fs::metadata(&cand)
            .map(|m| m.is_file())
            .unwrap_or(false)
        {
            return Some(cand);
        }
    }
    None
}

/// Platform-tailored note when a binaryen CLI tool isn't found, so `-O` / `--wat`
/// degrade to a clear soft no-op rather than a silent one. macOS suggests Homebrew;
/// other platforms point at the package manager / the prebuilt releases. The hint
/// is compile-time `cfg!` (the binary is native per-platform), so it never suggests
/// `brew` on Linux.
fn binaryen_missing_note(flag: &str, tool: &str, env_override: &str, consequence: &str) {
    let install = if cfg!(target_os = "macos") {
        "`brew install binaryen`"
    } else {
        "your package manager, or https://github.com/WebAssembly/binaryen/releases"
    };
    eprintln!(
        "note: {flag} requested but no `{tool}` on PATH ({consequence}) — install binaryen ({install}), or set ${env_override}"
    );
}

/// The binaryen FEATURE enables, shared by both optimization rungs and by `--wat`.
/// VL output is WasmGC, so the GC + reference-type features are REQUIRED for
/// binaryen to even validate it; we enable EXACTLY those (plus bulk memory, below)
/// — `-all` would turn on post-3.0 features that wasmtime then refuses to load.
///
/// `--enable-bulk-memory` is the linear-memory tier's flag. Binaryen 130 (the pinned
/// version) HARD-FAILS validation on `memory.copy`/`memory.fill` without it — measured,
/// `rc=1` and NO OUTPUT FILE WRITTEN, so a `vl build -O` would leave the unoptimized
/// module on disk and `bail!` — and the flag is set here AHEAD of the emitter writing
/// those opcodes so the day it does, `-O` does not break. Both engines VL targets
/// (wasmtime 47, V8) have bulk memory on by default: it is wasm 2.0 core, so enabling
/// it for binaryen costs nothing and closes a loud future failure.
/// See `docs/internals/buffer-design.md` §B4.
///
/// `--enable-tail-call` is the same shape of flag for the same reason. Binaryen 130
/// HARD-FAILS validation on `return_call`/`return_call_indirect` without it —
/// measured: `rc=1`, "return_call* requires tail calls", and NO OUTPUT FILE
/// WRITTEN, so `vl build -O` would `bail!` on every tail-recursive program. It is
/// enabled AHEAD of the emitter producing the opcode so the day it does, neither
/// rung breaks. Measured with it: `return_call` survives both `-O` and the full
/// release profile intact, and wasmtime 47 runs the result with no host change
/// (the proposal is on by default there). Because the enables are orthogonal to
/// the optimization level, this belongs in the SHARED list — a rung that missed it
/// would fail on exactly the programs the other rung optimizes fine.
const BINARYEN_FEATURES: &[&str] = &[
    "--enable-reference-types",
    "--enable-gc",
    "--enable-bulk-memory",
    "--enable-tail-call",
];

/// `vl build -O` — the SHRINK rung. One `-O` pass, open world. It melts a scratch
/// allocation that reaches its uses in straight-line code (records, list literals,
/// and a single-armed producer even across a call, since `-O` inlines). It melts
/// NOTHING that reaches its use across a control-flow JOIN — so a `{tag, value}`
/// union box built on two arms survives `-O` entirely. `-O3` is the rung for those.
const OPT_PASSES: &[&str] = &["-O"];

/// `vl build -O3` — the RELEASE PROFILE, the audited flag set from
/// `docs/internals/opt-profile-design.md`. Not a bare binaryen `-O3`: VL's `-O`
/// family has always meant "the audited flag set for this rung" rather than a
/// level passed through, and the load-bearing member here is `--closed-world`,
/// which is a claim about the module BOUNDARY, not an optimization level.
///
/// `--closed-world` is what melts VL's union boxes — measured, `-O3` alone leaves
/// all four allocations of the canonical per-tick box and `--closed-world -O` melts
/// all four, so the lever is the world assumption and not the level. It is sound
/// for VL output because the module boundary is scalar-only (i32 print imports,
/// i32 driver exports — DECISIONS H6), and that is checked rather than asserted:
/// all 1,338 corpus `@run` cases produce identical stdout AND exit status through
/// this profile. **The invariant it rests on is that no GC type reaches an import
/// or export**; a host-visible string/struct ABI would have to re-audit this flag.
///
/// The REPEAT is load-bearing: the trailing `-O3` is the only member that melts the
/// grown `{backing, len, cap}` wrapper (4 sites → 2), and it is ~15% of module size
/// on its own. `--gufa` is in the set because P1.3 names it and it costs ~2s and
/// −571 bytes on the 1.1 MB compiler module; its measured melt contribution is ZERO
/// allocations and ZERO casts removed, on every fixture and on that module.
const RELEASE_PASSES: &[&str] = &["--closed-world", "-O3", "--gufa", "-O3"];

/// Shell out to `wasm-opt` to rewrite the emitted module IN PLACE with one of the
/// two rungs above.
///
/// A missing `wasm-opt` is a HARD ERROR, not a soft no-op. `-O` / `-O3` are never
/// implied — a build only reaches here because the caller typed the flag — and
/// silently handing back an unoptimized module at exit 0 makes every downstream
/// check believe it got an optimized one. That is not hypothetical: it has produced
/// published `-O3` timings that were re-runs of the `-O0` module (byte-identical,
/// md5 verified) more than once, and both `bench/run.sh` and the `selfhost_native_opt`
/// tests carry hand-written guards that exist only to detect this. A plain
/// `vl build` never calls this function, so a toolchain without binaryen keeps
/// working for every build that did not ask to be optimized.
fn optimize_in_place(path: &str, flag: &str, passes: &[&str]) -> Result<()> {
    let Some(opt) = binaryen_tool("wasm-opt", "VL_WASM_OPT") else {
        // The unoptimized module is already on disk at this point. Leaving it there
        // would re-open the hole from the other side: a caller that ignores the exit
        // status still finds a plausible artifact, and a previously-good output has
        // just been overwritten by an unoptimized one. A failed build leaves nothing.
        let _ = std::fs::remove_file(path);
        let install = if cfg!(target_os = "macos") {
            "`brew install binaryen`"
        } else {
            "your package manager, or https://github.com/WebAssembly/binaryen/releases"
        };
        bail!(
            "{flag} requires `wasm-opt` and none was found on PATH — install binaryen ({install}), \
             or set $VL_WASM_OPT. (Build without {flag} to emit the unoptimized module.)"
        );
    };
    let mut argv: Vec<&str> = vec![path];
    argv.extend_from_slice(passes);
    argv.extend_from_slice(BINARYEN_FEATURES);
    argv.extend_from_slice(&["-o", path]);
    let status = std::process::Command::new(&opt)
        .args(&argv)
        .status()
        .map_err(|e| Error::from(e).context(format!("running wasm-opt `{opt}`")))?;
    if !status.success() {
        bail!("wasm-opt `{opt}` failed (exit {:?})", status.code());
    }
    Ok(())
}

/// `vl build --wat`: shell out to `wasm-dis` to write a `.wat` text dump beside the
/// emitted module. Like `-O`, WasmGC output needs the GC + reference-type features
/// enabled for `wasm-dis` to parse it (NOT `-all` — see `optimize_in_place`), and
/// carries `--enable-bulk-memory` for symmetry with `-O`. Measured: `wasm-dis`
/// tolerates bulk-memory opcodes either way (rc=0 both), so this flag changes nothing
/// today — the shared `BINARYEN_FEATURES` is what keeps the binaryen call sites from
/// drifting apart. A missing `wasm-dis` is a soft no-op (the `.wasm` is already written).
fn disassemble_to_wat(wasm_path: &str, wat_path: &str) -> Result<()> {
    let Some(dis) = binaryen_tool("wasm-dis", "VL_WASM_DIS") else {
        binaryen_missing_note("--wat", "wasm-dis", "VL_WASM_DIS", "skipped the .wat");
        return Ok(());
    };
    let mut argv: Vec<&str> = vec![wasm_path];
    argv.extend_from_slice(BINARYEN_FEATURES);
    argv.extend_from_slice(&["-o", wat_path]);
    let status = std::process::Command::new(&dis)
        .args(&argv)
        .status()
        .map_err(|e| Error::from(e).context(format!("running wasm-dis `{dis}`")))?;
    if !status.success() {
        bail!("wasm-dis `{dis}` failed (exit {:?})", status.code());
    }
    println!("wrote {wat_path}");
    Ok(())
}

/// `vl build`: prove the module we just wrote is one the engine will ACCEPT.
///
/// The compiler's `compileSrc` returning 0 means "the emitter ran to completion",
/// NOT "the bytes are a valid module" — nothing in the guest can decide the latter,
/// because the wasm validator lives in the engine and the guest is a VL program with
/// no engine. So before this existed, an emitter bug that lowered the wrong type
/// produced a module `vl build` wrote and reported `wrote x.wasm (92 bytes)` for,
/// exiting 0, which `vl run` then rejected outright. Measured on master `08469b0`
/// with `function mk<T>(_x: T): ((i32) => i32) | null { return null }` +
/// `const a = mk(1)`: `vl run` exited 1 ("expected i32, found (ref null $type)")
/// while `vl build -o x.wasm` exited 0, and `vl run x.wasm` on the artifact it
/// blessed exited 1 with the same error.
///
/// `Module::validate` is EXACTLY the check `vl run` fails on — `Module::new`
/// (`run_program_with`) validates before it translates — minus the Cranelift
/// codegen `Module::new` also does. Measured (interleaved A/B, n=21, medians):
/// the 1,031,680-byte compiler self-build pays +18.2 ms on 1,431 ms (+1.3%), a
/// small corpus program +2.25 ms on 5.7 ms. So the cost is a scan, not a compile,
/// and it is invisible on the build that dominates every gate.
///
/// It does NOT over-reject: swept over all 1,411 tests/cases files, the 1,188 that
/// build produced 0 validation failures, and the 12 that build-then-fail-to-run are
/// all deliberate TRAP fixtures — a trap is a runtime failure of a VALID module.
///
/// It reads the module back OFF DISK rather than validating the in-memory `bytes`
/// so that `-O` is covered too: with `-O` the artifact is binaryen's output, not
/// the emitter's, and the artifact is what the caller will run.
///
/// The file is left in place on failure, and this runs after `--wat`, because a
/// module that fails to validate is precisely the one a compiler dev needs to
/// disassemble. The exit code — not the artifact's absence — is what tells a
/// caller not to use it. `--no-validate` restores the old write-and-bless path
/// for anyone who wants the artifact without the gate.
fn validate_written_module(engine: &Engine, path: &str) -> Result<()> {
    let bytes = std::fs::read(path)
        .map_err(|e| Error::from(e).context(format!("reading back `{path}` to validate it")))?;
    Module::validate(engine, &bytes).map_err(|e| {
        Error::from(e).context(format!(
            "`{path}` is not a valid WebAssembly module — it was written, but it cannot \
             instantiate (this is a compiler emit bug; `--no-validate` skips this check)"
        ))
    })
}

/// Compile `source` through the seed (names enabled, for legible trap traces) and
/// run the emitted module on the user-program engine.
fn compile_and_run(
    compiler: &CompilerSource,
    source: &str,
    source_path: &str,
    run_engine: &Engine,
) -> Result<()> {
    let compile_engine = gc_engine(Collector::Null)?;
    let bytes = compile_vl(&compile_engine, compiler, source, source_path, "compileSrc", true)?;
    run_program(run_engine, &bytes)
}

/// `vl run` — compile + run a VL program, matching the TS CLI's `run`. Source comes
/// from (in priority) `-e "<snippet>"`, a file argument, or stdin (when piped). A
/// file whose bytes start with the wasm magic runs straight through wasmtime (a
/// prebuilt module — lets `vl build`/`-O` output be run end to end); otherwise the
/// source is compiled through the seed and the emitted module is run. Its own arg
/// shape (no file with `-e`/stdin) is dispatched before the positional parsing.
fn run_cmd(args: &[String]) -> Result<()> {
    use std::io::{IsTerminal, Read};
    // `--batch` is its own arg shape (many files, --out-dir) — dispatch first.
    if args.iter().any(|a| a == "--batch") {
        return run_batch(args);
    }
    let mut compiler: Option<String> = None;
    let mut inline: Option<String> = None;
    let mut file: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--compiler" => {
                compiler = args.get(i + 1).cloned();
                i += 1;
            }
            "-e" => {
                inline = args.get(i + 1).cloned();
                i += 1;
            }
            a if !a.starts_with('-') && file.is_none() => file = Some(a.to_string()),
            _ => {}
        }
        i += 1;
    }
    let compiler = resolve_compiler(compiler);

    const USAGE: &str = "usage: vl run <file.vl> | -e <source> | < stdin";
    let run_engine = gc_engine(run_collector()?)?;

    // A file argument (no `-e`): a prebuilt wasm runs directly; else it's source.
    if inline.is_none() {
        if let Some(f) = &file {
            let raw = std::fs::read(f)
                .map_err(|e| Error::from(e).context(format!("reading `{f}`")))?;
            if raw.starts_with(b"\0asm") {
                return run_program(&run_engine, &raw);
            }
            let source = String::from_utf8(raw).map_err(|e| {
                Error::from(e)
                    .context(format!("`{f}` is neither UTF-8 VL source nor a wasm module"))
            })?;
            return compile_and_run(&compiler, &source, f, &run_engine);
        }
    }

    // `-e` snippet, else stdin — but only when piped: an interactive TTY has
    // nothing to read, so blocking on stdin would hang forever; show usage.
    let source = if let Some(src) = inline {
        src
    } else {
        if std::io::stdin().is_terminal() {
            eprintln!("{USAGE}");
            std::process::exit(2);
        }
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s)?;
        s
    };
    if source.trim().is_empty() {
        eprintln!("{USAGE}");
        std::process::exit(2);
    }
    compile_and_run(&compiler, &source, "source.vl", &run_engine)
}

// ── `vl test` — the runner's MECHANISM half (docs/internals/vl-test-design.md) ──
// All runner POLICY (discovery, compilation, the plan, the report, the exit code)
// is VL, in `compiler/cli.vl`. What lands here is exactly what a wasm program
// cannot do for itself: instantiate modules, schedule them across OS threads, and
// catch a trap without dying. Three commands cross the boundary — stash a compiled
// module, collect the registries, run the plan.

/// One test file the brain compiled and handed over: its path (for messages) and
/// the module bytes the emitter produced.
struct TestFile {
    path: String,
    bytes: Vec<u8>,
}

/// What COLLECTION learned about one file. The `Module` is kept so the run phase
/// does not pay Cranelift a second time — collection is where that cost lands, and
/// it is paid in parallel.
struct TestRegistry {
    module: Option<Module>,
    names: Vec<String>,
    skips: Vec<i32>,
    /// "" unless the module failed to load or its top level trapped during
    /// registration — then this file contributes no tests and one failure.
    error: String,
}

/// The outcome of one planned test. `status`: 0 passed, 1 failed, 2 skipped.
struct TestOutcome {
    status: i32,
    message: String,
    output: String,
}

/// Run `job` over `0..n` across `jobs` OS threads and return the results IN INDEX
/// ORDER, so the report is deterministic however the work was scheduled.
///
/// Hand-rolled over `std::thread::scope` + an atomic cursor rather than pulling in
/// rayon: the host's whole dependency list is wasmtime + anyhow, and at this
/// granularity (one unit of work = one wasm module) a work-stealing scheduler buys
/// nothing a shared cursor does not.
fn parallel_map<T: Send>(n: usize, jobs: usize, job: impl Fn(usize) -> T + Sync) -> Vec<T> {
    if n == 0 {
        return Vec::new();
    }
    use std::sync::atomic::{AtomicUsize, Ordering};
    let workers = jobs.max(1).min(n);
    let cursor = AtomicUsize::new(0);
    let slots: Vec<Mutex<Option<T>>> = (0..n).map(|_| Mutex::new(None)).collect();
    let slots_ref = &slots;
    let job_ref = &job;
    let cursor_ref = &cursor;
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(move || loop {
                let i = cursor_ref.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let value = job_ref(i);
                *slots_ref[i].lock().unwrap() = Some(value);
            });
        }
    });
    slots
        .into_iter()
        .map(|slot| {
            slot.into_inner()
                .unwrap()
                .expect("every index is assigned exactly once")
        })
        .collect()
}

/// The one-line form of an execution failure, for a test report. wasmtime renders a
/// trap with a multi-line wasm backtrace naming mangled internal functions; the
/// report wants the CAUSE, so a real `Trap` reports as itself and anything else
/// reports as its first line.
fn trap_text(e: &Error) -> String {
    if let Some(trap) = e.downcast_ref::<Trap>() {
        return trap.to_string();
    }
    format!("{e}")
        .lines()
        .next()
        .unwrap_or("execution failed")
        .trim()
        .to_string()
}

/// Read a `<len>(i)` / `<at>(i, j)` indexed string off a test instance — the same
/// per-code-point crossing the module fetch loop and `render_diags` use.
fn read_test_str(
    store: &mut Store<()>,
    len: &TypedFunc<i32, i32>,
    at: &TypedFunc<(i32, i32), i32>,
    i: i32,
) -> Result<String> {
    let n = len.call(&mut *store, i)?;
    let mut s = String::with_capacity(n.max(0) as usize);
    for j in 0..n {
        if let Some(c) = char::from_u32(at.call(&mut *store, (i, j))? as u32) {
            s.push(c);
        }
    }
    Ok(s)
}

/// Collect one file's registry: load the module, instantiate it (which RUNS the
/// registrations), and read the `vlt*` exports back.
///
/// Registration output is discarded — a test file's top level is meant to declare
/// tests and nothing else, and anything it prints belongs to no test.
fn collect_test_file(engine: &Engine, file: &TestFile) -> TestRegistry {
    let failed = |error: String| TestRegistry {
        module: None,
        names: Vec::new(),
        skips: Vec::new(),
        error,
    };
    let module = match Module::new(engine, &file.bytes) {
        Ok(m) => m,
        // The emitter produced bytes the engine will not load — a compiler bug, not
        // a test failure, so name the file the host was given.
        Err(e) => {
            return failed(format!(
                "`{}` emitted a module the engine rejected: {}",
                file.path,
                trap_text(&e)
            ))
        }
    };
    let (mut store, inst) = match instantiate_program(engine, &module, |_| {}) {
        Ok(pair) => pair,
        Err(e) => return failed(trap_text(&e)),
    };
    // A module without the protocol exports registered nothing runnable. That is
    // not an error (an empty `*.test.vl` is legal) — it reports as "no tests".
    let (count, name_len, name_at, skipped) = match (
        inst.get_typed_func::<(), i32>(&mut store, "vltCount"),
        inst.get_typed_func::<i32, i32>(&mut store, "vltNameLen"),
        inst.get_typed_func::<(i32, i32), i32>(&mut store, "vltNameAt"),
        inst.get_typed_func::<i32, i32>(&mut store, "vltSkipped"),
    ) {
        (Ok(c), Ok(l), Ok(a), Ok(s)) => (c, l, a, s),
        _ => {
            return TestRegistry {
                module: Some(module),
                names: Vec::new(),
                skips: Vec::new(),
                error: String::new(),
            }
        }
    };
    let read = (|| -> Result<(Vec<String>, Vec<i32>)> {
        let n = count.call(&mut store, ())?;
        let mut names = Vec::with_capacity(n.max(0) as usize);
        let mut skips = Vec::with_capacity(n.max(0) as usize);
        for i in 0..n {
            names.push(read_test_str(&mut store, &name_len, &name_at, i)?);
            skips.push(skipped.call(&mut store, i)?);
        }
        Ok((names, skips))
    })();
    match read {
        Ok((names, skips)) => TestRegistry {
            module: Some(module),
            names,
            skips,
            error: String::new(),
        },
        Err(e) => failed(format!("reading the test registry: {}", trap_text(&e))),
    }
}

/// Run one file's selected tests, in one instance, one at a time — the design's
/// "files parallel, tests within a file serial", which is what lets a file's tests
/// share `beforeAll`-style setup and closure-captured state.
///
/// A TRAP fails that test and nothing else: the call unwinds, `vltFail*` still
/// reads the message the matcher recorded, and the module is RE-INSTANTIATED so the
/// next test starts from the registered-but-untouched state (registration replays
/// deterministically). That re-instantiation is the isolation guarantee.
///
/// `selected` is (plan index, the test's index within this file); the returned
/// outcomes carry the plan index back so the caller can scatter them.
fn run_test_file(
    engine: &Engine,
    reg: &TestRegistry,
    selected: &[(usize, i32)],
) -> Vec<(usize, TestOutcome)> {
    let bail_all = |msg: &str| -> Vec<(usize, TestOutcome)> {
        selected
            .iter()
            .map(|&(k, _)| {
                (
                    k,
                    TestOutcome {
                        status: 1,
                        message: msg.to_string(),
                        output: String::new(),
                    },
                )
            })
            .collect()
    };
    let Some(module) = &reg.module else {
        return bail_all(&reg.error);
    };
    let captured: Arc<Mutex<String>> = Arc::default();
    let sink = {
        let buf = captured.clone();
        move |line: &str| {
            let mut b = buf.lock().unwrap();
            b.push_str(line);
            b.push('\n');
        }
    };
    let mut live = match instantiate_program(engine, module, sink.clone()) {
        Ok(pair) => pair,
        Err(e) => return bail_all(&trap_text(&e)),
    };
    let mut out = Vec::with_capacity(selected.len());
    for &(plan_idx, local) in selected {
        captured.lock().unwrap().clear();
        let (store, inst) = &mut live;
        let run = match inst.get_typed_func::<i32, i32>(&mut *store, "vltRun") {
            Ok(f) => f,
            Err(e) => {
                out.push((
                    plan_idx,
                    TestOutcome {
                        status: 1,
                        message: format!("no `vltRun` export: {}", trap_text(&e)),
                        output: String::new(),
                    },
                ));
                continue;
            }
        };
        let result = run.call(&mut *store, local);
        let text = captured.lock().unwrap().clone();
        match result {
            Ok(1) => out.push((
                plan_idx,
                TestOutcome {
                    status: 2,
                    message: String::new(),
                    output: String::new(),
                },
            )),
            Ok(0) => out.push((
                plan_idx,
                TestOutcome {
                    status: 0,
                    message: String::new(),
                    output: text,
                },
            )),
            Ok(other) => out.push((
                plan_idx,
                TestOutcome {
                    status: 1,
                    message: format!("`vltRun` returned {other} (expected 0 or 1)"),
                    output: text,
                },
            )),
            Err(e) => {
                // The matcher recorded its message before trapping; read it back off
                // the (unwound but intact) instance. An empty one means the trap came
                // from somewhere else — a raw `__trap__()`, a bad index — so the
                // engine's own trap text is the message.
                let mut message = String::new();
                if let (Ok(len), Ok(at)) = (
                    inst.get_typed_func::<(), i32>(&mut *store, "vltFailLen"),
                    inst.get_typed_func::<i32, i32>(&mut *store, "vltFailAt"),
                ) {
                    if let Ok(s) = read_cli_str(&mut *store, &len, &at) {
                        message = s;
                    }
                }
                if message.is_empty() {
                    message = trap_text(&e);
                }
                out.push((
                    plan_idx,
                    TestOutcome {
                        status: 1,
                        message,
                        output: text,
                    },
                ));
                // Re-instantiate for the next test. A failure here is terminal for
                // the rest of THIS file only.
                match instantiate_program(engine, module, sink.clone()) {
                    Ok(pair) => live = pair,
                    Err(e) => {
                        let msg = format!("re-instantiating after a trap: {}", trap_text(&e));
                        let done: Vec<usize> = out.iter().map(|(k, _)| *k).collect();
                        for &(k, _) in selected {
                            if !done.contains(&k) {
                                out.push((
                                    k,
                                    TestOutcome {
                                        status: 1,
                                        message: msg.clone(),
                                        output: String::new(),
                                    },
                                ));
                            }
                        }
                        return out;
                    }
                }
            }
        }
    }
    out
}

/// The engine test programs load and run on, built once per `vl test` and shared
/// by BOTH phases. It must be one engine: a `Module` belongs to the engine that
/// compiled it, and instantiating a collect-phase module in a run-phase store built
/// on a second engine fails as `incompatible import type for imports::__print_i32__`
/// — the import types are structurally identical but engine-local, so the mismatch
/// reads as a print-ABI bug and is nothing of the sort. Built lazily so `vl check`
/// and `vl fmt`, which share this pump, never pay for an engine they do not use.
fn test_engine(slot: &mut Option<Engine>) -> Result<Engine> {
    if let Some(engine) = slot {
        return Ok(engine.clone());
    }
    let engine = gc_engine(run_collector()?)?;
    *slot = Some(engine.clone());
    Ok(engine)
}

/// How many workers to use: the brain's `--jobs` when it asked for one, else one
/// per available core. (`--jobs` is POLICY the VL side parses; the ncpu default is
/// mechanism only the host can see.)
fn test_worker_count(requested: i32) -> usize {
    if requested > 0 {
        return requested as usize;
    }
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

/// Whether `$VL_TEST_TRACE=1` asked for the per-file scheduling trace below.
fn test_trace_on() -> bool {
    std::env::var("VL_TEST_TRACE").map(|v| v == "1").unwrap_or(false)
}

/// Emit one per-file scheduling stamp (`$VL_TEST_TRACE=1` only), microseconds
/// from a phase-local epoch. `eprintln!` takes the stderr lock, so lines from
/// concurrent workers never interleave.
///
/// WHY STAMPS AND NOT A STOPWATCH. The claim `vl test` makes is about
/// SCHEDULING — files run concurrently — but the obvious proxy for it, "`--jobs
/// N` finishes faster than `--jobs 1`", measures scheduling TIMES the free CPU
/// the box happens to have. On a saturated machine those are indistinguishable:
/// a serial-fallback REGRESSION and a merely BUSY runner both read ~1.0. That
/// proxy is what the suite asserted until 2026-08-16, and it flaked on exactly
/// that ambiguity — twice on 2026-08-04, on master and on an unrelated PR, under
/// the `deno test --parallel` sweep that runs ~1,876 subprocess-spawning cases
/// against 4 vCPUs. It also carried a cold-start bias (the parallel leg ran
/// first and absorbed the one-time wasmtime compile of the seed), which failed
/// it on an IDLE 24-core box; and pinned to ONE core it read 7.06 against a
/// `< 0.70` threshold, because 4 threads timeslicing a single core are strictly
/// slower than 1.
///
/// These stamps witness the schedule itself: the intervals OVERLAP under
/// `--jobs N>1` and are DISJOINT under `--jobs 1`, on any core count, under any
/// load. Contention makes each file take LONGER, which makes the overlap wider
/// — the measurement gets more robust as the box gets busier, not less.
fn test_trace_stamp(phase: &str, file: usize, start_us: u128, end_us: u128) {
    eprintln!("vl-test-trace {phase} file={file} start_us={start_us} end_us={end_us}");
}

// ── `vl check` — driven by the in-wasm CLI command-queue (docs/cli-design.md) ──
// The host is a thin PUMP: push argv, then call `cliNext()` until CMD_DONE,
// servicing each raw I/O command (read a file, print a line) and committing the
// result back. ALL policy — arg parsing, running the checker in-module,
// diagnostic formatting, severity gating, the exit code — lives in `cli.vl`
// inside the seed, so it survives the host's planned shrink to a WASI shim.

const CMD_DONE: i32 = 0;
const CMD_LIST_DIR: i32 = 1;
const CMD_READ_FILE: i32 = 2;
const CMD_WRITE_FILE: i32 = 3;
const CMD_PRINT_OUT: i32 = 4;
const CMD_PRINT_ERR: i32 = 5;
const CMD_READ_STDIN: i32 = 6;
const CMD_TEST_STASH: i32 = 7;
const CMD_TEST_COLLECT: i32 = 8;
const CMD_TEST_RUN: i32 = 9;

/// Read a string payload via a bare `<prefix>Len()` / `<prefix>At(j)` accessor pair
/// (one UTF-32 code point per `At`) off an instance that is NOT the compiler — a
/// `vl test` module's `vltFailLen`/`vltFailAt`, whose exports come from `std:test`
/// and carry no bulk twin. Payloads inside the compiler go through `StrOut`, which
/// takes the bulk path when the seed offers one.
fn read_cli_str(
    store: &mut Store<()>,
    len: &TypedFunc<(), i32>,
    at: &TypedFunc<i32, i32>,
) -> Result<String> {
    let n = len.call(&mut *store, ())?;
    let mut s = String::with_capacity(n.max(0) as usize);
    for j in 0..n {
        push_cp(&mut s, at.call(&mut *store, j)? as u32, j);
    }
    Ok(s)
}

/// `vl check` (and, later, every subcommand) over the command-queue pump. The host
/// performs only raw mechanism: load the compiler module, resolve the compiler
/// path + TTY colour, stream argv in, then loop servicing file reads and line
/// prints until the VL program reports CMD_DONE, and exit with its code.
fn cli_pump(args: &[String]) -> Result<()> {
    use std::io::{IsTerminal, Write};
    // Resolve the compiler module (host mechanism): --compiler / env / default.
    let mut compiler: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--compiler" {
            compiler = args.get(i + 1).cloned();
            i += 1;
        }
        i += 1;
    }
    let compiler = resolve_compiler(compiler);

    // A COLLECTING collector, unlike the one-shot compile paths. The pump drives one
    // compiler instance across every file a directory walk finds, so its garbage grows
    // with the FILE COUNT; under the null collector the heap only ever grows and a walk
    // of a few dozen files dies with `wasm trap: allocation size too large`. Two copies
    // of this repo's own `compiler/` (54 files) were enough.
    let engine = gc_engine(match std::env::var("VL_PUMP_GC").ok().as_deref() {
        Some("null") => Collector::Null,
        Some("tracing") => Collector::Copying,
        Some("refcount") => Collector::DeferredReferenceCounting,
        _ => Collector::Auto,
    })?;
    let (mut store, inst) = load_compiler(&engine, &compiler)?;

    // TTY + NO_COLOR is host mechanism; the VL formatter can't probe isatty, so the
    // resolved decision rides in as a synthetic `--color=always|never` argument.
    let color = std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none();

    let arg_reset = inst.get_typed_func::<(), i32>(&mut store, "cliArgReset")?;
    let arg_push = inst.get_typed_func::<i32, i32>(&mut store, "cliArgPush")?;
    let arg_commit = inst.get_typed_func::<(), i32>(&mut store, "cliArgCommit")?;
    arg_reset.call(&mut store, ())?;
    for a in args {
        for ch in a.chars() {
            arg_push.call(&mut store, ch as i32)?;
        }
        arg_commit.call(&mut store, ())?;
    }
    let color_arg = if color { "--color=always" } else { "--color=never" };
    for ch in color_arg.chars() {
        arg_push.call(&mut store, ch as i32)?;
    }
    arg_commit.call(&mut store, ())?;

    let next = inst.get_typed_func::<(), i32>(&mut store, "cliNext")?;
    let cmd_path = StrOut::probe(&mut store, &inst, "cliCmdPath")?;
    let cmd_data = StrOut::probe(&mut store, &inst, "cliCmdData")?;
    let result_in = StrIn::probe(&mut store, &inst, "cliResult")?;
    let file_commit = inst.get_typed_func::<i32, i32>(&mut store, "cliFileCommit")?;
    let dir_name_push = inst.get_typed_func::<i32, i32>(&mut store, "cliDirNamePush")?;
    let dir_entry_push = inst.get_typed_func::<i32, i32>(&mut store, "cliDirEntryPush")?;
    let dir_commit = inst.get_typed_func::<i32, i32>(&mut store, "cliDirCommit")?;
    let exit_code = inst.get_typed_func::<(), i32>(&mut store, "cliExitCode")?;

    // `vl test` state: the modules the brain has handed over (CMD_TEST_STASH), then
    // what collection learned about each (CMD_TEST_COLLECT), reused by the run.
    let mut test_files: Vec<TestFile> = Vec::new();
    let mut test_regs: Vec<TestRegistry> = Vec::new();
    let mut test_engine_slot: Option<Engine> = None;

    let mut out = std::io::stdout();
    let mut err = std::io::stderr();
    loop {
        match next.call(&mut store, ())? {
            CMD_DONE => break,
            CMD_LIST_DIR => {
                // List one directory (no recursion, no skip-list, no glob — all VL
                // policy). `cliDirCommit(1)` when the path is a directory (entries
                // streamed first), `0` when it is a file or does not exist, so the
                // VL program can classify a file-vs-directory target.
                let path = cmd_path.read(&mut store)?;
                match std::fs::read_dir(&path) {
                    Ok(entries) => {
                        for entry in entries.flatten() {
                            let is_dir =
                                entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                            for ch in entry.file_name().to_string_lossy().chars() {
                                dir_name_push.call(&mut store, ch as i32)?;
                            }
                            dir_entry_push.call(&mut store, if is_dir { 1 } else { 0 })?;
                        }
                        dir_commit.call(&mut store, 1)?;
                    }
                    Err(_) => {
                        // Not a directory (a file, or missing) — no entries.
                        dir_commit.call(&mut store, 0)?;
                    }
                }
            }
            CMD_READ_FILE => {
                let path = cmd_path.read(&mut store)?;
                // A `std:` key maps to `<stdDir>/<name>.vl` (slash segments are
                // subdirectories); every other key is a filesystem path read as-is.
                // A missing file commits `found = 0` (the VL program raises its own
                // unresolvable-import / cannot-read diagnostic).
                let data = match path.strip_prefix("std:") {
                    Some(name) => read_std_module(name),
                    None => read_utf8(std::path::Path::new(&path)),
                };
                match data {
                    Some(s) => {
                        result_in.send(&mut store, &s)?;
                        file_commit.call(&mut store, 1)?;
                    }
                    None => {
                        file_commit.call(&mut store, 0)?;
                    }
                }
            }
            CMD_WRITE_FILE => {
                // Write the formatted (or fixed) contents back to disk. Path +
                // data both ride the current-command payload.
                let path = cmd_path.read(&mut store)?;
                let data = cmd_data.read(&mut store)?;
                std::fs::write(&path, data.as_bytes())
                    .map_err(|e| Error::from(e).context(format!("writing `{path}`")))?;
            }
            CMD_READ_STDIN => {
                // `… | vl fmt` — slurp stdin and commit it like a file read.
                use std::io::Read;
                let mut s = String::new();
                std::io::stdin().read_to_string(&mut s).ok();
                result_in.send(&mut store, &s)?;
                file_commit.call(&mut store, 1)?;
            }
            CMD_PRINT_OUT => {
                // Raw stdout (no added newline) — formatted source carries its own
                // trailing newline, so `vl fmt` output stays byte-exact.
                let data = cmd_data.read(&mut store)?;
                write!(out, "{data}")?;
            }
            CMD_PRINT_ERR => {
                let line = cmd_data.read(&mut store)?;
                writeln!(err, "{line}")?;
            }
            CMD_TEST_STASH => {
                // The brain just emitted a test module; keep its bytes. They come
                // back off the driver's own readback channel — the same `rbyte`
                // `Len`/`At`/`Store` triple `vl build` reads — so nothing new
                // crosses.
                let path = cmd_path.read(&mut store)?;
                let bytes = BytesOut::probe(&mut store, &inst, "rbyte")?.read(&mut store)?;
                test_files.push(TestFile { path, bytes });
            }
            CMD_TEST_COLLECT => {
                // Instantiate every stashed module in parallel (this is where the
                // Cranelift compile lands) and commit each registry back IN STASH
                // ORDER — the brain attributes names to files by commit order.
                let jobs = inst.get_typed_func::<(), i32>(&mut store, "cliTestJobsWanted")?;
                let workers = test_worker_count(jobs.call(&mut store, ())?);
                let name_push = inst.get_typed_func::<i32, i32>(&mut store, "cliTestNamePush")?;
                let name_commit =
                    inst.get_typed_func::<i32, i32>(&mut store, "cliTestNameCommit")?;
                let file_commit =
                    inst.get_typed_func::<i32, i32>(&mut store, "cliTestFileCommit")?;
                let engine_t = test_engine(&mut test_engine_slot)?;
                let trace = test_trace_on();
                let epoch = std::time::Instant::now();
                test_regs = parallel_map(test_files.len(), workers, |i| {
                    let start_us = epoch.elapsed().as_micros();
                    let reg = collect_test_file(&engine_t, &test_files[i]);
                    if trace {
                        test_trace_stamp("collect", i, start_us, epoch.elapsed().as_micros());
                    }
                    reg
                });
                for reg in &test_regs {
                    for (name, skip) in reg.names.iter().zip(reg.skips.iter()) {
                        for ch in name.chars() {
                            name_push.call(&mut store, ch as i32)?;
                        }
                        name_commit.call(&mut store, *skip)?;
                    }
                    let status = if reg.error.is_empty() { 0 } else { 1 };
                    if status != 0 {
                        result_in.send(&mut store, &reg.error)?;
                    }
                    file_commit.call(&mut store, status)?;
                }
            }
            CMD_TEST_RUN => {
                // Read the plan the brain built, group it by file (one instance per
                // file), run the files across the pool, and commit the outcomes back
                // in PLAN order so the report is deterministic.
                let jobs = inst.get_typed_func::<(), i32>(&mut store, "cliTestJobsWanted")?;
                let workers = test_worker_count(jobs.call(&mut store, ())?);
                let plan_count = inst.get_typed_func::<(), i32>(&mut store, "cliTestPlanCount")?;
                let plan_file = inst.get_typed_func::<i32, i32>(&mut store, "cliTestPlanFile")?;
                let plan_test = inst.get_typed_func::<i32, i32>(&mut store, "cliTestPlanTest")?;
                let out_push = inst.get_typed_func::<i32, i32>(&mut store, "cliTestOutPush")?;
                let res_commit =
                    inst.get_typed_func::<(i32, i32), i32>(&mut store, "cliTestResultCommit")?;
                let n = plan_count.call(&mut store, ())?;
                let mut per_file: Vec<Vec<(usize, i32)>> =
                    (0..test_regs.len()).map(|_| Vec::new()).collect();
                for k in 0..n {
                    let f = plan_file.call(&mut store, k)? as usize;
                    let t = plan_test.call(&mut store, k)?;
                    if f < per_file.len() {
                        per_file[f].push((k as usize, t));
                    }
                }
                let engine_t = test_engine(&mut test_engine_slot)?;
                let trace = test_trace_on();
                let epoch = std::time::Instant::now();
                let batches = parallel_map(per_file.len(), workers, |i| {
                    let start_us = epoch.elapsed().as_micros();
                    let batch = run_test_file(&engine_t, &test_regs[i], &per_file[i]);
                    if trace {
                        test_trace_stamp("run", i, start_us, epoch.elapsed().as_micros());
                    }
                    batch
                });
                let mut outcomes: Vec<Option<TestOutcome>> =
                    (0..n as usize).map(|_| None).collect();
                for batch in batches {
                    for (k, outcome) in batch {
                        if k < outcomes.len() {
                            outcomes[k] = Some(outcome);
                        }
                    }
                }
                for (k, slot) in outcomes.into_iter().enumerate() {
                    let outcome = slot.unwrap_or(TestOutcome {
                        status: 1,
                        message: "the runner produced no result for this test".to_string(),
                        output: String::new(),
                    });
                    if !outcome.message.is_empty() {
                        result_in.send(&mut store, &outcome.message)?;
                    }
                    for ch in outcome.output.chars() {
                        out_push.call(&mut store, ch as i32)?;
                    }
                    res_commit.call(&mut store, (k as i32, outcome.status))?;
                }
            }
            other => bail!("vl: unknown CLI command {other} from the wasm pump"),
        }
    }
    out.flush().ok();
    err.flush().ok();
    std::process::exit(exit_code.call(&mut store, ())?);
}


/// Print a failed run the way anyhow would, plus — when a wasm TRAP is anywhere in
/// the cause chain — the VL-level `note:` that says which source construct stops
/// here. Without it a trap reaches the author as an opcode name over an address
/// backtrace, with nothing naming the VL operation that refused.
fn report(err: Error) -> ! {
    eprintln!("Error: {err:?}");
    if let Some(note) = err
        .chain()
        .find_map(|c| c.downcast_ref::<Trap>())
        .and_then(|t| trap_explanation(*t))
    {
        eprintln!("\nnote: {note}");
    }
    std::process::exit(1);
}

fn main() {
    match real_main() {
        Ok(()) => {}
        Err(e) => report(e),
    }
}

fn real_main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    // `fmt`, `run`, and `check` have their own arg shapes (optional/absent file,
    // flags, stdin), so they're dispatched before the positional `<cmd> <input>`.
    if args.get(1).map(|s| s == "fmt").unwrap_or(false) {
        // The subcommand rides as argv[0] so the VL program dispatches on it.
        return cli_pump(&args[1..]);
    }
    if args.get(1).map(|s| s == "run").unwrap_or(false) {
        return run_cmd(&args[2..]);
    }
    if args.get(1).map(|s| s == "check").unwrap_or(false) {
        // The subcommand rides as argv[0] so the VL program dispatches on it.
        return cli_pump(&args[1..]);
    }
    if args.get(1).map(|s| s == "test").unwrap_or(false) {
        // `vl test [path]` — same pump, three more commands (docs/internals/vl-test-design.md).
        return cli_pump(&args[1..]);
    }
    if args.len() < 3 {
        usage();
    }
    let cmd = args[1].as_str();
    let input = args[2].as_str();
    let flag = |name: &str| -> Option<String> {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let compiler = resolve_compiler(flag("--compiler"));

    // Read the source lazily: a `vl run <file.wasm>` input is a binary module, not
    // UTF-8, so we must not slurp it as a string up front.
    let read_source = || {
        std::fs::read_to_string(input)
            .map_err(|e| Error::from(e).context(format!("reading `{input}`")))
    };
    // The compile step always runs under the null collector (one-shot batch work);
    // only the user program's own execution gets a real (DRC) collector.
    let compile_engine = gc_engine(Collector::Null)?;

    match cmd {
        "build" => {
            let out = flag("-o").unwrap_or_else(|| {
                input.strip_suffix(".vl").unwrap_or(input).to_string() + ".wasm"
            });
            // `--names` embeds a wasm "name" custom section (legible trap backtraces).
            let names = args.iter().any(|a| a == "--names");
            let bytes = compile_vl(
                &compile_engine,
                &compiler,
                &read_source()?,
                input,
                "compileSrc",
                names,
            )?;
            std::fs::write(&out, &bytes)?;
            // Optimize the written module in place (wasm-opt, when present). Two
            // rungs, and `-O3` WINS when both are given — it is a superset of `-O`'s
            // effect on every measured shape, so running `-O` first would only cost a
            // process spawn. `-O3` is the release profile (`RELEASE_PASSES`), not a
            // bare binaryen level.
            if args.iter().any(|a| a == "-O3") {
                optimize_in_place(&out, "-O3", RELEASE_PASSES)?;
            } else if args.iter().any(|a| a == "-O") {
                optimize_in_place(&out, "-O", OPT_PASSES)?;
            }
            let len = std::fs::metadata(&out)
                .map(|m| m.len())
                .unwrap_or(bytes.len() as u64);
            println!("wrote {out} ({len} bytes)");
            // `--wat`: also write a `.wat` text dump beside the module (wasm-dis,
            // when present). Reflects the `-O`-optimized module if both are given.
            if args.iter().any(|a| a == "--wat") {
                let wat = format!("{}.wat", out.strip_suffix(".wasm").unwrap_or(&out));
                disassemble_to_wat(&out, &wat)?;
            }
            // The written module must be a module the engine will ACCEPT — see
            // `validate_written_module`. Runs LAST so `--wat` still dumps a broken
            // module (that dump is how an emit bug gets diagnosed).
            if !args.iter().any(|a| a == "--no-validate") {
                validate_written_module(&compile_engine, &out)?;
            }
        }
        _ => usage(),
    }
    Ok(())
}
