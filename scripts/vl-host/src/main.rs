// The native `vl` tool — a single binary with deno-style subcommands:
//
//   vl build <in.vl> -o <out.wasm>   compile a file to a wasm module
//   vl check <in.vl>                 typecheck (and emit-validate); print diagnostics
//   vl run   <in.vl>                 compile in-memory, then instantiate + run
//   vl test  <path>...               corpus runner: adjudicate `// @directive` cases
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
    eprintln!(
        "usage: vl <build|check|run> <file.vl> [-o out.wasm] [--compiler vl-compiler.wasm]\n       vl test <path>... [--cases listfile] [--compiler vl-compiler.wasm]"
    );
    std::process::exit(2);
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
fn compile_vl(
    engine: &Engine,
    compiler_path: &str,
    source: &str,
    source_path: &str,
    entry: &str,
    emit_names: bool,
) -> Result<Vec<u8>> {
    // A `.cwasm` SIDECAR caches the Cranelift compilation of the compiler module
    // (the dominant fixed cost of every invocation). Keyed by freshness: rebuilt
    // whenever the `.wasm` is newer. `deserialize_file` is unsafe because a
    // corrupt/forged artifact is UB — we only ever load a sidecar this same
    // binary wrote next to the module it was derived from.
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
                "loading compiler module `{compiler_path}` (build it with: deno run -A scripts/build-compiler-wasm.ts)"
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
/// (top-level statements run via the wasm start function). Each completed print
/// line is handed to `emit` as it arrives (`vl run` streams to stdout; `vl test`
/// collects for the @log diff).
fn run_program_to(
    engine: &Engine,
    bytes: &[u8],
    emit: impl Fn(String) + Send + Sync + Clone + 'static,
) -> Result<()> {
    let module = Module::new(engine, bytes)?;
    let chars: Arc<Mutex<Vec<u32>>> = Arc::default();
    let mut store = Store::new(engine, ());
    let mut linker = Linker::new(engine);

    let e = emit.clone();
    linker.func_wrap("imports", "__print_i32__", move |v: i32| e(format!("{v}")))?;
    let e = emit.clone();
    linker.func_wrap("imports", "__print_i64__", move |v: i64| e(format!("{v}")))?;
    // f64: Rust's `{}` Display matches JS `String(v)` for the corpus values (whole
    // numbers print without a trailing `.0`, e.g. 4.0 → "4"), mirroring the host's
    // `__print_f64__` (`String(v)`) so emitted output matches `@log`. (Slice 3.)
    let e = emit.clone();
    linker.func_wrap("imports", "__print_f64__", move |v: f64| e(format!("{v}")))?;
    // f32: widen to f64 before Display so the printed decimal matches JS `String(v)`
    // (where a wasm f32 arrives as a JS number, i.e. its exact f64 value), mirroring the
    // host's `__print_f32__` (`String(v)`). Whole f32 values print without `.0` (e.g.
    // 6.5→"6.5", 10.0→"10"). (Slice 5.)
    let e = emit.clone();
    linker.func_wrap("imports", "__print_f32__", move |v: f32| {
        e(format!("{}", v as f64))
    })?;
    let e = emit.clone();
    linker.func_wrap("imports", "__print_bool__", move |v: i32| {
        e((if v != 0 { "true" } else { "false" }).to_string())
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
        emit(line);
    })?;

    // Instantiation runs the start function — the VL program's top level.
    let _instance = linker.instantiate(&mut store, &module)?;
    Ok(())
}

fn run_program(engine: &Engine, bytes: &[u8]) -> Result<()> {
    run_program_to(engine, bytes, |line| println!("{line}"))
}

// ── `vl test`: the native corpus runner ──────────────────────────────────────
//
// Adjudicates `tests/cases`-style files by their `// @directive` header (the
// grammar of tests/cases_test.ts), restricted to EXACTLY what the native
// pipeline can decide — the same contract `tests/selfhost_native_align_test.ts`
// asserts, so `vl test` is never a weaker gate than the deno harness it
// replaces:
//
//   @run + @log    full compile + run; captured print lines must EQUAL the
//                  ordered @log list, AND `vl check` must accept (exit-0 parity
//                  with the align suite's run cases).
//   @error[-at]    the file must be REJECTED by `vl check` at the parse/type
//                  stage (never accepted, never first caught at emit). The
//                  message TEXT and span are host-checker territory — the
//                  self-hosted checker's wording/positions differ, and the deno
//                  align suite never pins them either — so they mark the file
//                  as must-reject without being string-matched natively.
//   @check         accept mode (the default): `vl check` must exit 0.
//   @warning/@info/@hint  host-LINT severities; the native checker emits errors
//                  only, so these carry no native assertion (the accept/run
//                  contract of the file still holds) — align-suite parity.
//
// Anything else (@trap's mapped-message contract, @skip, typos) is UNSUPPORTED
// and fails the case loudly — a directive `vl test` cannot adjudicate must
// never look like a pass.

/// The native-relevant subset of a case file's `// @directive` header.
#[derive(Default)]
struct Directives {
    /// `@run` (a later `@check` resets to check mode, as in cases_test.ts).
    run: bool,
    /// Ordered `@log` expectations for the program's print output.
    logs: Vec<String>,
    /// Any `@error` / `@error-at`: the file must be rejected at parse/type.
    reject: bool,
    /// Directives the native runner cannot adjudicate (fail loudly).
    unsupported: Vec<String>,
}

fn parse_directives(src: &str) -> Directives {
    let mut d = Directives::default();
    for raw in src.lines() {
        let line = raw.trim();
        let Some(after) = line.strip_prefix("//") else {
            continue;
        };
        let Some(body) = after.trim().strip_prefix('@') else {
            continue;
        };
        let (key, rest) = body.split_at(body.find(char::is_whitespace).unwrap_or(body.len()));
        let text = rest.trim_start();
        match key {
            "run" => d.run = true,
            "check" => d.run = false,
            "log" => d.logs.push(text.to_string()),
            "error" | "error-at" => d.reject = true,
            // Host-lint severities: no native assertion (see the header above).
            "warning" | "info" | "hint" => {}
            other => {
                let tag = format!("@{other}");
                if !d.unsupported.contains(&tag) {
                    d.unsupported.push(tag);
                }
            }
        }
    }
    d
}

/// Recursively collect `.vl` case files under `dir`, sorted for determinism.
/// A directory holding an `entry.vl` is ONE multi-file module case (see
/// tests/cases_test.ts) — the native tool has no multi-file compile, so the
/// directory itself is pushed and `run_case` fails it loudly instead of
/// silently testing its siblings as standalone files.
fn collect_vl_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) -> Result<()> {
    if dir.join("entry.vl").is_file() {
        out.push(dir.to_path_buf());
        return Ok(());
    }
    let mut entries = std::fs::read_dir(dir)?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| Error::from(e).context(format!("reading `{}`", dir.display())))?
        .iter()
        .map(|e| e.path())
        .collect::<Vec<_>>();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            collect_vl_files(&p, out)?;
        } else if p.extension().is_some_and(|x| x == "vl") {
            out.push(p);
        }
    }
    Ok(())
}

/// Render an ordered expected-vs-actual diff of the @log lines.
fn diff_logs(want: &[String], got: &[String]) -> String {
    let mut out = format!(
        "@log mismatch: expected {} line(s), got {}",
        want.len(),
        got.len()
    );
    for i in 0..want.len().max(got.len()) {
        match (want.get(i), got.get(i)) {
            (w, g) if w == g => {}
            (Some(w), Some(g)) => {
                out.push_str(&format!("\n  line {}: expected {w:?}, got {g:?}", i + 1))
            }
            (Some(w), None) => out.push_str(&format!(
                "\n  line {}: expected {w:?}, got <end of output>",
                i + 1
            )),
            (None, Some(g)) => out.push_str(&format!(
                "\n  line {}: expected <end of output>, got {g:?}",
                i + 1
            )),
            (None, None) => unreachable!(),
        }
    }
    out
}

/// First lines of a compile error, indented for the FAIL report.
fn brief(e: &Error) -> String {
    e.to_string()
        .lines()
        .take(4)
        .collect::<Vec<_>>()
        .join("\n  ")
}

/// Adjudicate one case file; `Err` carries the human-readable failure report.
fn run_case(
    compile_engine: &Engine,
    run_engine: &Engine,
    compiler: &str,
    path: &std::path::Path,
) -> std::result::Result<(), String> {
    if path.is_dir() {
        return Err(
            "multi-file module case (entry.vl) — host-only, not supported by `vl test`".into(),
        );
    }
    let path_str = path.to_string_lossy();
    let source = std::fs::read_to_string(path).map_err(|e| format!("reading `{path_str}`: {e}"))?;
    let d = parse_directives(&source);
    if !d.unsupported.is_empty() {
        return Err(format!(
            "unsupported directive(s): {} — `vl test` cannot adjudicate these; the case stays host-side",
            d.unsupported.join(", ")
        ));
    }
    if d.run && d.reject {
        return Err("conflicting directives: @run with @error".into());
    }

    // Every case runs through `vl check` (the checkSrc entrypoint): reject cases
    // must FAIL it at parse/type; accept and @run cases must pass it clean.
    let check = compile_vl(
        compile_engine,
        compiler,
        &source,
        &path_str,
        "checkSrc",
        false,
    );
    if d.reject {
        return match check {
            Ok(_) => Err("expected rejection (@error), but `vl check` accepted".into()),
            Err(e) => {
                let msg = e.to_string();
                // compile_vl prefixes its bail with the stage ("parse error\n…").
                if msg.starts_with("parse error") || msg.starts_with("type error") {
                    Ok(())
                } else {
                    Err(format!(
                        "expected a parse/type rejection — the checker must catch this BEFORE emit\n  {}",
                        brief(&e)
                    ))
                }
            }
        };
    }
    if let Err(e) = check {
        return Err(format!("`vl check` should accept, got:\n  {}", brief(&e)));
    }
    if !d.run {
        return Ok(());
    }

    // @run: full compile (names on, like `vl run`), execute, diff print lines.
    let bytes = compile_vl(
        compile_engine,
        compiler,
        &source,
        &path_str,
        "compileSrc",
        true,
    )
    .map_err(|e| format!("@run compile failed:\n  {}", brief(&e)))?;
    let lines: Arc<Mutex<Vec<String>>> = Arc::default();
    let sink = lines.clone();
    run_program_to(run_engine, &bytes, move |l| sink.lock().unwrap().push(l))
        .map_err(|e| format!("runtime error: {e}"))?;
    let got = lines.lock().unwrap();
    if *got != d.logs {
        return Err(diff_logs(&d.logs, &got));
    }
    Ok(())
}

/// `vl test <path>... [--cases listfile]`: gather cases from positional files/
/// directories and `--cases` list files (one path per line, relative to the
/// list file's directory; `#` comments and blank lines ignored), run each, and
/// report `ok`/`FAIL` per case plus a final summary. Exits 1 on any failure.
fn cmd_test(args: &[String], compile_engine: &Engine, compiler: &str) -> Result<()> {
    let mut cases: Vec<(String, std::path::PathBuf)> = Vec::new();
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--compiler" => i += 2,
            "--cases" => {
                let Some(list) = args.get(i + 1) else { usage() };
                let text = std::fs::read_to_string(list)
                    .map_err(|e| Error::from(e).context(format!("reading `{list}`")))?;
                let base = std::path::Path::new(list)
                    .parent()
                    .unwrap_or(std::path::Path::new("."));
                for raw in text.lines() {
                    let line = raw.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    cases.push((line.to_string(), base.join(line)));
                }
                i += 2;
            }
            flag if flag.starts_with('-') => usage(),
            path => {
                let p = std::path::PathBuf::from(path);
                if p.is_dir() {
                    let mut found = Vec::new();
                    collect_vl_files(&p, &mut found)?;
                    if found.is_empty() {
                        bail!("no .vl files under `{path}`");
                    }
                    cases.extend(found.into_iter().map(|f| (f.display().to_string(), f)));
                } else {
                    cases.push((path.to_string(), p));
                }
                i += 1;
            }
        }
    }
    if cases.is_empty() {
        usage();
    }
    // User programs get a real (DRC) collector, exactly like `vl run`.
    let run_engine = gc_engine(Collector::DeferredReferenceCounting)?;
    let (mut passed, mut failed) = (0u32, 0u32);
    for (name, path) in &cases {
        match run_case(compile_engine, &run_engine, compiler, path) {
            Ok(()) => {
                passed += 1;
                println!("ok {name}");
            }
            Err(report) => {
                failed += 1;
                println!("FAIL {name}\n  {}", report.replace('\n', "\n  "));
            }
        }
    }
    println!("vl test: {passed} passed, {failed} failed");
    if failed > 0 {
        std::process::exit(1);
    }
    Ok(())
}

/// Resolve a `wasm-opt` binary: `$VL_WASM_OPT` override first, else a PATH scan.
/// Returns `None` when none is found (so `-O` can degrade gracefully).
fn wasm_opt_path() -> Option<String> {
    if let Ok(p) = std::env::var("VL_WASM_OPT") {
        return Some(p);
    }
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        let cand = format!("{dir}/wasm-opt");
        if std::fs::metadata(&cand)
            .map(|m| m.is_file())
            .unwrap_or(false)
        {
            return Some(cand);
        }
    }
    None
}

/// `vl build -O`: shell out to `wasm-opt` to shrink the emitted module IN PLACE,
/// when a `wasm-opt` is available. VL output is WasmGC, so the GC + reference-type
/// features are REQUIRED for binaryen to even validate it; we enable EXACTLY those
/// two — `-all` would turn on post-3.0 features that wasmtime then refuses to load.
/// A missing `wasm-opt` is a soft no-op (the unoptimized module is already written).
fn optimize_in_place(path: &str) -> Result<()> {
    let Some(opt) = wasm_opt_path() else {
        eprintln!(
            "note: -O requested but no `wasm-opt` on PATH (set $VL_WASM_OPT) — wrote the unoptimized module"
        );
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

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
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
        "test" => cmd_test(&args, &compile_engine, &compiler)?,
        _ => usage(),
    }
    Ok(())
}
