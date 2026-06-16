// The native `vl` tool — a single binary with deno-style subcommands:
//
//   vl build <in.vl> -o <out.wasm>   compile a file to a wasm module
//   vl check <in.vl>                 typecheck (and emit-validate); print diagnostics
//   vl run   <in.vl>                 compile in-memory, then instantiate + run
//   vl fmt   [path] [-w|--check]     format source (stdout / write / CI gate); stdin when no path
//
// This is a THIN host adapter: all compiler logic (lex/parse/typecheck/emit) lives
// in the self-hosted compiler wasm (`build/vl-compiler.wasm`, built by
// scripts/build-compiler-wasm.ts from the VL-written compiler). The Rust side only
// does argv, file I/O, stdout, and the wasmtime embedding — it never parses or
// types VL. Future subcommands (fmt, test, …) follow the same shape: the brains
// land in the wasm, the adapter stays an I/O shim.
//
// The compiler module is resolved from (first hit wins):
//   --compiler <path>  |  $VL_COMPILER_WASM  |  ./build/vl-compiler.wasm
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
fn load_compiler(engine: &Engine, compiler_path: &str) -> Result<(Store<()>, Instance)> {
    let sidecar = format!("{compiler_path}.cwasm");
    let fresh = match (
        std::fs::metadata(&sidecar),
        std::fs::metadata(compiler_path),
    ) {
        (Ok(c), Ok(w)) => matches!((c.modified(), w.modified()), (Ok(cm), Ok(wm)) if cm >= wm),
        _ => false,
    };
    let module = if fresh {
        match unsafe { Module::deserialize_file(engine, &sidecar) } {
            Ok(m) => m,
            Err(_) => Module::from_file(engine, compiler_path)?, // stale config/version — recompile
        }
    } else {
        let m = Module::from_file(engine, compiler_path).map_err(|e| {
            e.context(format!(
                "loading compiler module `{compiler_path}` (build it with: scripts/refresh-compiler.sh)"
            ))
        })?;
        // Best-effort cache write; failure is non-fatal (read-only dirs etc.).
        if let Ok(bytes) = m.serialize() {
            let _ = std::fs::write(&sidecar, bytes);
        }
        m
    };
    let mut store = Store::new(engine, ());
    let linker = Linker::new(engine);
    let inst = linker.instantiate(&mut store, &module)?;
    Ok((store, inst))
}

fn compile_vl(
    engine: &Engine,
    compiler_path: &str,
    source: &str,
    source_path: &str,
    entry: &str,
    emit_names: bool,
) -> Result<Vec<u8>> {
    let (mut store, inst) = load_compiler(engine, compiler_path)?;

    let src_reset = inst.get_typed_func::<(), i32>(&mut store, "srcReset")?;
    let src_push = inst.get_typed_func::<i32, i32>(&mut store, "srcPush")?;
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

    // Multi-file module resolution (H3): when the source has a line-leading
    // `import {` (the host CLI's cheap textual gate — an import-free file keeps
    // the single-source path byte-identical) AND the compiler module exposes the
    // module-table exports (older seeds: fall back to today's behavior), run the
    // FETCH LOOP — commit the entry, then read + commit whatever resolved keys
    // the compiler still needs, until the graph is closed. Module keys are
    // `/`-separated paths relative to whatever the entry path was, so the host
    // just reads them; a missing file commits `found = 0` (the unresolvable
    // diagnostic fires inside the wasm instead of an infinite re-request).
    let has_imports = source.lines().any(|l| {
        let t = l.trim_start();
        t.strip_prefix("import")
            .map(|rest| rest.trim_start().starts_with('{'))
            .unwrap_or(false)
    });
    if has_imports {
        if let (Ok(mod_reset), Ok(key_push), Ok(msrc_push), Ok(commit), Ok(pend_n), Ok(pend_len), Ok(pend_at)) = (
            inst.get_typed_func::<(), i32>(&mut store, "modReset"),
            inst.get_typed_func::<i32, i32>(&mut store, "modKeyPush"),
            inst.get_typed_func::<i32, i32>(&mut store, "modSrcPush"),
            inst.get_typed_func::<i32, i32>(&mut store, "modCommit"),
            inst.get_typed_func::<(), i32>(&mut store, "modPendingCount"),
            inst.get_typed_func::<i32, i32>(&mut store, "modPendingLen"),
            inst.get_typed_func::<(i32, i32), i32>(&mut store, "modPendingAt"),
        ) {
            let commit_module =
                |store: &mut Store<()>, key: &str, src: Option<&str>| -> Result<()> {
                    for ch in key.chars() {
                        key_push.call(&mut *store, ch as i32)?;
                    }
                    if let Some(s) = src {
                        for ch in s.chars() {
                            msrc_push.call(&mut *store, ch as i32)?;
                        }
                    }
                    commit.call(&mut *store, if src.is_some() { 1 } else { 0 })?;
                    Ok(())
                };
            mod_reset.call(&mut store, ())?;
            commit_module(&mut store, source_path, Some(source))?;
            loop {
                let n = pend_n.call(&mut store, ())?;
                if n == 0 {
                    break;
                }
                // Snapshot the pending keys first — committing mutates the list.
                let mut keys = Vec::with_capacity(n as usize);
                for i in 0..n {
                    let len = pend_len.call(&mut store, i)?;
                    let mut key = String::with_capacity(len as usize);
                    for j in 0..len {
                        if let Some(c) = char::from_u32(pend_at.call(&mut store, (i, j))? as u32) {
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
                        Some(name) => std_dir()
                            .and_then(|dir| std::fs::read_to_string(dir.join(format!("{name}.vl"))).ok()),
                        None => std::fs::read_to_string(&key).ok(),
                    };
                    commit_module(&mut store, &key, src.as_deref())?;
                }
            }
        }
    }

    src_reset.call(&mut store, ())?;
    for ch in source.chars() {
        src_push.call(&mut store, ch as i32)?;
    }
    let rc = compile.call(&mut store, ())?;
    if rc != 0 {
        let stage = match rc {
            1 => "parse",
            2 => "type",
            _ => "emit",
        };
        let diags = render_diags(&inst, &mut store, source_path)?;
        bail!("{stage} error\n{}", diags.trim_end());
    }
    let n = rlen.call(&mut store, ())?;
    let mut bytes = Vec::with_capacity(n as usize);
    for i in 0..n {
        bytes.push(rat.call(&mut store, i)? as u8);
    }
    Ok(bytes)
}

/// Instantiate an emitted VL program with the host print-import family and run it
/// (top-level statements run via the wasm start function). Print output streams to
/// stdout as it arrives.
fn run_program(engine: &Engine, bytes: &[u8]) -> Result<()> {
    let module = Module::new(engine, bytes)?;
    let chars: Arc<Mutex<Vec<u32>>> = Arc::default();
    let mut store = Store::new(engine, ());
    let mut linker = Linker::new(engine);

    linker.func_wrap("imports", "__print_i32__", |v: i32| println!("{v}"))?;
    linker.func_wrap("imports", "__print_i64__", |v: i64| println!("{v}"))?;
    // f64: Rust's `{}` Display matches JS `String(v)` for the corpus values (whole
    // numbers print without a trailing `.0`, e.g. 4.0 → "4"), mirroring the host's
    // `__print_f64__` (`String(v)`) so emitted output matches `@log`. (Slice 3.)
    linker.func_wrap("imports", "__print_f64__", |v: f64| println!("{v}"))?;
    // f32: widen to f64 before Display so the printed decimal matches JS `String(v)`
    // (where a wasm f32 arrives as a JS number, i.e. its exact f64 value), mirroring the
    // host's `__print_f32__` (`String(v)`). Whole f32 values print without `.0` (e.g.
    // 6.5→"6.5", 10.0→"10"). (Slice 5.)
    linker.func_wrap("imports", "__print_f32__", |v: f32| {
        println!("{}", v as f64)
    })?;
    linker.func_wrap("imports", "__print_bool__", |v: i32| {
        println!("{}", if v != 0 { "true" } else { "false" })
    })?;
    let c = chars.clone();
    linker.func_wrap("imports", "__print_char__", move |code: i32| {
        c.lock().unwrap().push(code as u32);
    })?;
    let c = chars.clone();
    linker.func_wrap("imports", "__print_str_flush__", move || {
        let mut buf = c.lock().unwrap();
        let line: String = buf.iter().filter_map(|&cp| char::from_u32(cp)).collect();
        buf.clear();
        println!("{line}");
    })?;

    // Instantiation runs the start function — the VL program's top level.
    let _instance = linker.instantiate(&mut store, &module)?;
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

/// Format `source` via the seed's `formatSrc` (single-file, purely syntactic — no
/// module resolution; the formatting logic lives in `format.vl`). Returns the
/// canonical reprint, or `None` on a lex/parse error (the driver signals -1), so
/// the caller leaves the source unchanged rather than emit a corrupt partial.
fn format_source(
    store: &mut Store<()>,
    inst: &Instance,
    source: &str,
) -> Result<Option<String>> {
    let src_reset = inst.get_typed_func::<(), i32>(&mut *store, "srcReset")?;
    let src_push = inst.get_typed_func::<i32, i32>(&mut *store, "srcPush")?;
    let format = inst.get_typed_func::<(), i32>(&mut *store, "formatSrc")?;
    let fmt_at = inst.get_typed_func::<i32, i32>(&mut *store, "fmtByteAt")?;
    src_reset.call(&mut *store, ())?;
    for ch in source.chars() {
        src_push.call(&mut *store, ch as i32)?;
    }
    let len = format.call(&mut *store, ())?;
    if len < 0 {
        return Ok(None);
    }
    let mut out = String::with_capacity(len as usize);
    for j in 0..len {
        if let Some(c) = char::from_u32(fmt_at.call(&mut *store, j)? as u32) {
            out.push(c);
        }
    }
    Ok(Some(out))
}

/// Directories skipped when walking broadly, so `vl fmt .` doesn't descend into
/// build output, deps, or vendored copies. Mirrors the retired TS CLI's `SKIP_DIRS`.
const SKIP_DIRS: [&str; 4] = ["node_modules", ".git", "dist", "reference"];

/// Collect every `*.vl` under `dir`, recursively, honouring the skip-list.
fn collect_vl_files(
    dir: &std::path::Path,
    out: &mut Vec<std::path::PathBuf>,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)
        .map_err(|e| Error::from(e).context(format!("reading dir `{}`", dir.display())))?
    {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if !SKIP_DIRS.contains(&name.as_ref()) {
                collect_vl_files(&path, out)?;
            }
        } else if name.ends_with(".vl") {
            out.push(path);
        }
    }
    Ok(())
}

/// `vl fmt` — the self-hosted formatter (`format.vl` via the seed's `formatSrc`),
/// matching the retired TS CLI's `fmt`:
///   vl fmt <file.vl>        print the formatted source to stdout
///   vl fmt -w <path>        rewrite the file(s) in place (only when changed)
///   vl fmt --check <path>   exit non-zero if any file is not already formatted
///   vl fmt <dir>            recurse over every *.vl under a directory
///   cmd | vl fmt            format stdin to stdout
fn run_fmt(args: &[String]) -> Result<()> {
    use std::io::{Read, Write};
    let mut write = false;
    let mut check = false;
    let mut compiler: Option<String> = None;
    let mut paths: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-w" | "--write" => write = true,
            "--check" => check = true,
            "--compiler" => {
                compiler = args.get(i + 1).cloned();
                i += 1;
            }
            a if !a.starts_with('-') => paths.push(a.to_string()),
            _ => {} // ignore unknown flags (parity with the TS arg parser)
        }
        i += 1;
    }
    let compiler = compiler
        .or_else(|| std::env::var("VL_COMPILER_WASM").ok())
        .unwrap_or_else(|| "build/vl-compiler.wasm".to_string());

    let engine = gc_engine(Collector::Null)?;
    let (mut store, inst) = load_compiler(&engine, &compiler)?;

    // No path: format stdin to stdout (`cmd | vl fmt`). `-w` is meaningless on a
    // stream; `--check` reports drift via the exit code.
    if paths.is_empty() {
        let mut source = String::new();
        std::io::stdin().read_to_string(&mut source)?;
        let formatted =
            format_source(&mut store, &inst, &source)?.unwrap_or_else(|| source.clone());
        if check {
            std::process::exit(if formatted == source { 0 } else { 1 });
        }
        std::io::stdout().write_all(formatted.as_bytes())?;
        return Ok(());
    }

    // Expand each path: a file is taken as-is; a directory is walked recursively.
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    for p in &paths {
        let path = std::path::Path::new(p);
        match std::fs::metadata(path) {
            Ok(m) if m.is_dir() => collect_vl_files(path, &mut files)?,
            Ok(_) => files.push(path.to_path_buf()),
            Err(_) => {
                eprintln!("fmt: no such file or directory: {p}");
                std::process::exit(2);
            }
        }
    }
    files.sort();

    let mut drift = 0;
    for file in &files {
        let source = std::fs::read_to_string(file)
            .map_err(|e| Error::from(e).context(format!("reading `{}`", file.display())))?;
        let formatted =
            format_source(&mut store, &inst, &source)?.unwrap_or_else(|| source.clone());
        let changed = formatted != source;
        if check {
            if changed {
                eprintln!("{}: not formatted", file.display());
                drift += 1;
            }
        } else if write {
            if changed {
                std::fs::write(file, formatted.as_bytes())?;
            }
        } else {
            std::io::stdout().write_all(formatted.as_bytes())?;
        }
    }
    // --check is a CI gate: non-zero exit when any file would change.
    if check && drift > 0 {
        std::process::exit(1);
    }
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    // `fmt` has its own arg shape (optional path — stdin when absent — plus flags),
    // so it is dispatched before the positional `<cmd> <input>` parsing below.
    if args.get(1).map(|s| s == "fmt").unwrap_or(false) {
        return run_fmt(&args[2..]);
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
    let compiler = flag("--compiler")
        .or_else(|| std::env::var("VL_COMPILER_WASM").ok())
        .unwrap_or_else(|| "build/vl-compiler.wasm".to_string());

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
        "check" => {
            // `check` is parse + typecheck only (the `checkSrc` entrypoint) — NOT a
            // full compile. Emit is `vl build`'s job; running it here would only be
            // slower and would reject type-valid programs the emitter can't yet
            // lower. Diagnostics surface through compile_vl's error path. (No names:
            // check emits nothing.)
            compile_vl(
                &compile_engine,
                &compiler,
                &read_source()?,
                input,
                "checkSrc",
                false,
            )?;
            println!("ok");
        }
        "run" => {
            // Accept either VL source or an already-built wasm module (magic-byte
            // detection): `vl run prog.wasm` runs a prebuilt module straight through
            // wasmtime, skipping the compiler — which also lets `vl build -O` output
            // be run and gated end to end.
            let raw = std::fs::read(input)
                .map_err(|e| Error::from(e).context(format!("reading `{input}`")))?;
            let bytes = if raw.starts_with(b"\0asm") {
                raw
            } else {
                let source = String::from_utf8(raw).map_err(|e| {
                    Error::from(e).context(format!(
                        "`{input}` is neither UTF-8 VL source nor a wasm module"
                    ))
                })?;
                // `vl run` always embeds names so a trap backtrace is legible.
                compile_vl(
                    &compile_engine,
                    &compiler,
                    &source,
                    input,
                    "compileSrc",
                    true,
                )?
            };
            let run_engine = gc_engine(Collector::DeferredReferenceCounting)?;
            run_program(&run_engine, &bytes)?;
        }
        _ => usage(),
    }
    Ok(())
}
