// The native `vl` tool — a single binary with deno-style subcommands:
//
//   vl build <in.vl> -o <out.wasm>   compile a file to a wasm module
//   vl check <in.vl>                 typecheck (and emit-validate); print diagnostics
//   vl run   <in.vl>                 compile in-memory, then instantiate + run
//   vl fmt   [path] [-w|--check]     format source (stdout / write / CI gate); stdin when no path
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
    eprintln!("usage: vl <build|check|run|fmt> <file.vl> [-o out.wasm] [-w|--check] [--compiler vl-compiler.wasm]");
    std::process::exit(2);
}

/// The std source directory `std:` module keys read from. First hit wins:
/// `$VL_STD`; the repo `std/` resolved off the exe path (the dev tree — the
/// binary lives at `scripts/vl-host/target/release/vl`, so four levels up);
/// `<exe dir>/std` (the release layout: std ships beside the binary).
fn std_dir() -> Option<std::path::PathBuf> {
    if let Ok(dir) = std::env::var("VL_STD") {
        return Some(std::path::PathBuf::from(dir));
    }
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    let dev = exe_dir.join("../../../../std");
    if dev.is_dir() {
        return Some(dev);
    }
    Some(exe_dir.join("std"))
}

fn gc_engine(collector: Collector) -> Result<Engine> {
    let mut cfg = Config::new();
    cfg.wasm_gc(true);
    cfg.wasm_function_references(true);
    // The COMPILER instance is one-shot batch work: the null collector (never
    // frees) skips every DRC barrier/refcount, trading memory for speed — give it
    // a large reservation to grow into. User programs (`vl run`) keep DRC: they
    // may be long-lived and actually need garbage collected.
    cfg.collector(collector);
    if matches!(collector, Collector::Null) {
        cfg.gc_heap_reservation(8 << 30); // 8 GiB virtual reservation (lazily committed)
    }
    Engine::new(&cfg)
}

/// Render the compiler's accumulated diagnostics, one per line. A compiler
/// module with the structured per-diagnostic exports (`diagCount` /
/// `diagMsgLen` / `diagMsgAt` / `diagLine` / `diagCol`) renders a positioned
/// diagnostic as `path:line:col: message` — 1-based line, 0-based column (the
/// lexer's and the corpus `@error-at` directive's convention) — while
/// `diagLine(i) == 0` means "no position" and the message prints bare. An older
/// module without those exports degrades to the legacy newline-joined
/// `diagLen`/`diagAt` text (bare messages), byte-identical to before.
fn render_diags(inst: &Instance, store: &mut Store<()>, path: &str) -> Result<String> {
    if let (Ok(count), Ok(mlen), Ok(mat), Ok(dline), Ok(dcol)) = (
        inst.get_typed_func::<(), i32>(&mut *store, "diagCount"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagMsgLen"),
        inst.get_typed_func::<(i32, i32), i32>(&mut *store, "diagMsgAt"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagLine"),
        inst.get_typed_func::<i32, i32>(&mut *store, "diagCol"),
    ) {
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
                out.push_str(&format!("{path}:{line}:{col}: {msg}\n"));
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
        // Embedded seed (a `--features embed-seed` release binary): compile from the
        // baked-in bytes each run. No `.cwasm` sidecar — there's no path to key it on;
        // the Cranelift compile is the one cost a future cache could reclaim.
        CompilerSource::Embedded(bytes) => Module::from_binary(engine, bytes)
            .map_err(|e| e.context("loading the embedded compiler seed"))?,
        CompilerSource::Path(compiler_path) => {
            let sidecar = format!("{compiler_path}.cwasm");
            let fresh = match (
                std::fs::metadata(&sidecar),
                std::fs::metadata(compiler_path),
            ) {
                (Ok(c), Ok(w)) => {
                    matches!((c.modified(), w.modified()), (Ok(cm), Ok(wm)) if cm >= wm)
                }
                _ => false,
            };
            // Compile from the `.wasm` and rewrite the sidecar. The write is
            // best-effort (read-only dirs etc. are non-fatal) and also runs on
            // the fresh-but-undeserializable path below, so a sidecar from a
            // different wasmtime version/config (e.g. restored by a CI cache
            // with its mtime intact) heals on first use instead of forcing a
            // recompile on every later invocation.
            let compile_and_cache = || -> Result<Module> {
                let m = Module::from_file(engine, compiler_path).map_err(|e| {
                    e.context(format!(
                        "loading compiler module `{compiler_path}` (build it with: scripts/refresh-compiler.sh)"
                    ))
                })?;
                if let Ok(bytes) = m.serialize() {
                    // Atomic publish: write a unique temp then rename() into place.
                    // Parallel `vl` processes race otherwise — `fs::write` truncates-
                    // then-writes, and a concurrent `deserialize_file` MMAPS this file,
                    // so a torn read is UB (an intermittent hang/crash — surfaced as
                    // lint-self.sh's per-file `vl fmt` fan-out stalling in CI). rename(2)
                    // is atomic on POSIX: a reader sees either the whole old or whole new
                    // file, and an existing mmap keeps the old inode. Best-effort still.
                    let tmp = format!("{sidecar}.{}.tmp", std::process::id());
                    if std::fs::write(&tmp, &bytes).is_ok() {
                        if std::fs::rename(&tmp, &sidecar).is_err() {
                            let _ = std::fs::remove_file(&tmp);
                        }
                    }
                }
                Ok(m)
            };
            if fresh {
                match unsafe { Module::deserialize_file(engine, &sidecar) } {
                    Ok(m) => m,
                    Err(_) => compile_and_cache()?, // stale config/version — recompile
                }
            } else {
                compile_and_cache()?
            }
        }
    };
    Ok(module)
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
/// them gets the batched path; every current seed falls back to per-code-point
/// pushes, byte-identical in behavior and cost.
///
/// Batched ABI (compiler-side follow-up — no seed exports these yet):
///   `<name>Reserve(n: i32) -> i32` — capacity hint: about to append n more code
///       points (lets the buffer preallocate once instead of growing per push).
///   `ioMem` (exported linear memory) + `<name>Load(count: i32) -> i32` — append
///       the `count` UTF-32LE code points the host wrote at ioMem[0..4*count).
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
        let bulk = inst
            .get_memory(&mut *store, "ioMem")
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
                        Some(name) => {
                            std_dir().and_then(|dir| read_utf8(&dir.join(format!("{name}.vl"))))
                        }
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
    let (mut store, inst) = phase!("load_compiler", load_compiler(engine, compiler))?;
    compile_vl_instance(&mut store, &inst, source, source_path, entry, emit_names)
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
    let rlen = inst.get_typed_func::<(), i32>(&mut store, "rbyteLen")?;
    let rat = inst.get_typed_func::<i32, i32>(&mut store, "rbyteAt")?;

    // Opt into the wasm "name" custom section so trap backtraces name functions.
    // The export is OFF by default (the compiler leaves goldens byte-identical);
    // we flip it on only here, for the native tool's build/run paths. The export
    // is absent from older compiler modules, so treat a missing symbol as a no-op.
    if emit_names {
        if let Ok(set_names) = inst.get_typed_func::<i32, i32>(&mut store, "setEmitNames") {
            set_names.call(&mut store, 1)?;
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
    let bytes = phase!("readback", {
        let n = rlen.call(&mut store, ())?;
        let mut bytes = Vec::with_capacity(n as usize);
        for i in 0..n {
            bytes.push(rat.call(&mut store, i)? as u8);
        }
        Ok::<_, Error>(bytes)
    })?;
    Ok(bytes)
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
    let chars: Arc<Mutex<Vec<u32>>> = Arc::default();
    let mut store = Store::new(engine, ());
    let mut linker = Linker::new(engine);

    let s = sink.clone();
    linker.func_wrap("imports", "__print_i32__", move |v: i32| s(&v.to_string()))?;
    let s = sink.clone();
    linker.func_wrap("imports", "__print_i64__", move |v: i64| s(&v.to_string()))?;
    // f64: Rust's `{}` Display matches JS `String(v)` for the corpus values (whole
    // numbers print without a trailing `.0`, e.g. 4.0 → "4"), mirroring the host's
    // `__print_f64__` (`String(v)`) so emitted output matches `@log`. (Slice 3.)
    let s = sink.clone();
    linker.func_wrap("imports", "__print_f64__", move |v: f64| s(&v.to_string()))?;
    // f32: widen to f64 before Display so the printed decimal matches JS `String(v)`
    // (where a wasm f32 arrives as a JS number, i.e. its exact f64 value), mirroring the
    // host's `__print_f32__` (`String(v)`). Whole f32 values print without `.0` (e.g.
    // 6.5→"6.5", 10.0→"10"). (Slice 5.)
    let s = sink.clone();
    linker.func_wrap("imports", "__print_f32__", move |v: f32| {
        s(&(v as f64).to_string())
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
    let _instance = linker.instantiate(&mut store, &module)?;
    Ok(())
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
    let run_engine = gc_engine(Collector::DeferredReferenceCounting)?;
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

/// `vl build -O`: shell out to `wasm-opt` to shrink the emitted module IN PLACE,
/// when a `wasm-opt` is available. VL output is WasmGC, so the GC + reference-type
/// features are REQUIRED for binaryen to even validate it; we enable EXACTLY those
/// two — `-all` would turn on post-3.0 features that wasmtime then refuses to load.
/// A missing `wasm-opt` is a soft no-op (the unoptimized module is already written).
fn optimize_in_place(path: &str) -> Result<()> {
    let Some(opt) = binaryen_tool("wasm-opt", "VL_WASM_OPT") else {
        binaryen_missing_note("-O", "wasm-opt", "VL_WASM_OPT", "wrote the unoptimized module");
        return Ok(());
    };
    let status = std::process::Command::new(&opt)
        .args([
            path,
            "-O",
            "--enable-reference-types",
            "--enable-gc",
            "-o",
            path,
        ])
        .status()
        .map_err(|e| Error::from(e).context(format!("running wasm-opt `{opt}`")))?;
    if !status.success() {
        bail!("wasm-opt `{opt}` failed (exit {:?})", status.code());
    }
    Ok(())
}

/// `vl build --wat`: shell out to `wasm-dis` to write a `.wat` text dump beside the
/// emitted module. Like `-O`, WasmGC output needs the GC + reference-type features
/// enabled for `wasm-dis` to parse it (NOT `-all` — see `optimize_in_place`). A
/// missing `wasm-dis` is a soft no-op (the `.wasm` is already written).
fn disassemble_to_wat(wasm_path: &str, wat_path: &str) -> Result<()> {
    let Some(dis) = binaryen_tool("wasm-dis", "VL_WASM_DIS") else {
        binaryen_missing_note("--wat", "wasm-dis", "VL_WASM_DIS", "skipped the .wat");
        return Ok(());
    };
    let status = std::process::Command::new(&dis)
        .args([
            wasm_path,
            "--enable-reference-types",
            "--enable-gc",
            "-o",
            wat_path,
        ])
        .status()
        .map_err(|e| Error::from(e).context(format!("running wasm-dis `{dis}`")))?;
    if !status.success() {
        bail!("wasm-dis `{dis}` failed (exit {:?})", status.code());
    }
    println!("wrote {wat_path}");
    Ok(())
}

/// Compile `source` through the seed (names enabled, for legible trap traces) and
/// run the emitted module on the DRC engine.
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
    let run_engine = gc_engine(Collector::DeferredReferenceCounting)?;

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

/// Read the current command's string payload via a `<prefix>Len()` / `<prefix>At(j)`
/// accessor pair (one UTF-32 code point per `At`, the seed's string-out idiom).
fn read_cli_str(
    store: &mut Store<()>,
    len: &TypedFunc<(), i32>,
    at: &TypedFunc<i32, i32>,
) -> Result<String> {
    let n = len.call(&mut *store, ())?;
    let mut s = String::with_capacity(n.max(0) as usize);
    for j in 0..n {
        let v = at.call(&mut *store, j)? as u32;
        match char::from_u32(v) {
            Some(c) => s.push(c),
            // The seed only stores code points that came from valid strings, so
            // an unmappable value is a protocol bug — surface it in debug builds
            // rather than silently shortening the payload.
            None => debug_assert!(false, "invalid code point {v:#x} in a CLI payload at index {j}"),
        }
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

    let engine = gc_engine(Collector::Null)?;
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
    let path_len = inst.get_typed_func::<(), i32>(&mut store, "cliCmdPathLen")?;
    let path_at = inst.get_typed_func::<i32, i32>(&mut store, "cliCmdPathAt")?;
    let data_len = inst.get_typed_func::<(), i32>(&mut store, "cliCmdDataLen")?;
    let data_at = inst.get_typed_func::<i32, i32>(&mut store, "cliCmdDataAt")?;
    let result_in = StrIn::probe(&mut store, &inst, "cliResult")?;
    let file_commit = inst.get_typed_func::<i32, i32>(&mut store, "cliFileCommit")?;
    let dir_name_push = inst.get_typed_func::<i32, i32>(&mut store, "cliDirNamePush")?;
    let dir_entry_push = inst.get_typed_func::<i32, i32>(&mut store, "cliDirEntryPush")?;
    let dir_commit = inst.get_typed_func::<i32, i32>(&mut store, "cliDirCommit")?;
    let exit_code = inst.get_typed_func::<(), i32>(&mut store, "cliExitCode")?;

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
                let path = read_cli_str(&mut store, &path_len, &path_at)?;
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
                let path = read_cli_str(&mut store, &path_len, &path_at)?;
                // A `std:` key maps to `<stdDir>/<name>.vl` (slash segments are
                // subdirectories); every other key is a filesystem path read as-is.
                // A missing file commits `found = 0` (the VL program raises its own
                // unresolvable-import / cannot-read diagnostic).
                let data = match path.strip_prefix("std:") {
                    Some(name) => {
                        std_dir().and_then(|d| read_utf8(&d.join(format!("{name}.vl"))))
                    }
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
                let path = read_cli_str(&mut store, &path_len, &path_at)?;
                let data = read_cli_str(&mut store, &data_len, &data_at)?;
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
                let data = read_cli_str(&mut store, &data_len, &data_at)?;
                write!(out, "{data}")?;
            }
            CMD_PRINT_ERR => {
                let line = read_cli_str(&mut store, &data_len, &data_at)?;
                writeln!(err, "{line}")?;
            }
            other => bail!("vl: unknown CLI command {other} from the wasm pump"),
        }
    }
    out.flush().ok();
    err.flush().ok();
    std::process::exit(exit_code.call(&mut store, ())?);
}


fn main() -> Result<()> {
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
            // `-O`: optimize the written module in place (wasm-opt, when present).
            if args.iter().any(|a| a == "-O") {
                optimize_in_place(&out)?;
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
        }
        _ => usage(),
    }
    Ok(())
}
