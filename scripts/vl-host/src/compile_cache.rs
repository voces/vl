// The whole-compile file cache, stage S1 of docs/internals/incremental-compilation-design.md
// (§4.1, §4.2). OPT-IN: active only under `VL_COMPILE_CACHE=1`.
//
// An ACTION is one compile in a fresh compiler instance (`vl build`, one pooled `vl test`
// file). Its key has two levels. The MANIFEST key hashes everything the host knows before
// the guest runs: the action kind, the resolved seed's SHA-256, this host's build id, every
// keyed environment variable, and the values the host stages (argv with the resolved colour,
// the VL root, the cwd, the entry and its bytes). The manifest holds the last few
// TRANSCRIPTS recorded under that key: every module the guest asked for, with the SHA-256 of
// the reply or `absent`. A lookup replays a transcript against the filesystem, without a
// guest; when every reply matches, the guest would have asked for the same things and been
// told the same things, so it would have emitted the same bytes, and the result is served.
//
// Only the guest's emitted bytes are stored. A failed compile, a trap, and any run under a
// bypass variable store nothing. Stage S2 adds one more action kind, `opt`: the host's `-O`
// chain (its own steps and `wasm-opt`), keyed on the bytes it is given rather than on a
// transcript, whose result is the final module and its source map.

use std::cell::RefCell;
use std::path::{Path, PathBuf};

use super::{hex, private_cache_dir, prune_cache_dir, sha256, user_cache_root};

/// The exit code of a `VL_COMPILE_CACHE_VERIFY=1` mismatch: a cache defect, not a compiler
/// crash (70), so the two stay separable in a report.
pub const EXIT_CACHE_MISMATCH: i32 = 71;

/// The default `$VL_COMPILE_CACHE_MAX_MB`: one large project's test run stores ~290 MiB, so a
/// smaller bound had dev, release and test builds evicting each other.
const DEFAULT_MAX_MB: u64 = 4096;

/// The transcripts one manifest keeps, most recent first.
const MANIFEST_KEEP: usize = 4;
const MANIFEST_MAGIC: &str = "VLCM1";
const RESULT_MAGIC: &[u8; 8] = b"VLCR0001";

/// Invisible to every output: the cache's own controls and the Cranelift module cache's.
const INERT: &[&str] = &[
    "VL_CACHE_DIR",
    "VL_CACHE_MAX_MB",
    "VL_COMPILE_CACHE",
    "VL_COMPILE_CACHE_MAX_MB",
    "VL_COMPILE_CACHE_TRACE",
    "VL_COMPILE_CACHE_VERIFY",
    "VL_NO_CACHE",
];

/// A variable that exists to OBSERVE a compile: a hit would skip the thing measured, and a
/// store would key a result on an observation. `VL_REP_SHADOW` prints a report the guest
/// computes during the compile, so it is one too.
fn is_bypass(k: &str) -> bool {
    matches!(
        k,
        "VL_FUEL"
            | "VL_GC_STATS"
            | "VL_TEST_TRACE"
            | "VL_COMPILE_GC_TRACE"
            | "VL_FAULT_INJECT"
            | "VL_REP_SHADOW"
    ) || k.starts_with("VL_PROFILE")
        || k.ends_with("_DUMP")
        || k.ends_with("_EXPLAIN")
}

/// Every `VL_*` and `BINARYEN_*` variable that is neither inert nor bypass, sorted. The
/// default is over-keying: a missing input is a wrong result, an extra one only a miss.
fn keyed_env() -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = std::env::vars_os()
        .map(|(k, val)| (k.to_string_lossy().into_owned(), val.to_string_lossy().into_owned()))
        .filter(|(k, _)| {
            (k.starts_with("VL_") || k.starts_with("BINARYEN_")) && !INERT.contains(&k.as_str())
        })
        .collect();
    v.sort();
    v
}

fn env_on(k: &str) -> bool {
    std::env::var_os(k).is_some_and(|v| !v.is_empty() && v != "0")
}

/// `VL_COMPILE_CACHE_TRACE=1`: one stderr line per lookup — `hit`, `miss`, `stored`,
/// `verified` or `off (<why>)`.
pub fn trace(what: &str) {
    if env_on("VL_COMPILE_CACHE_TRACE") {
        eprintln!("vl: compile cache {what}");
    }
}

/// Whether this process may look up and store, and whether every hit is re-checked cold.
/// `Err` carries why not, for the trace.
pub fn mode() -> Result<bool, String> {
    if std::env::var_os("VL_COMPILE_CACHE").is_none_or(|v| v != "1") {
        return Err("not enabled".to_string());
    }
    if env_on("VL_NO_COMPILE_CACHE") {
        return Err("VL_NO_COMPILE_CACHE".to_string());
    }
    if let Some(k) = std::env::vars_os()
        .map(|(k, _)| k.to_string_lossy().into_owned())
        .find(|k| is_bypass(k))
    {
        return Err(format!("bypass {k}"));
    }
    Ok(std::env::var_os("VL_COMPILE_CACHE_VERIFY").is_some_and(|v| v == "1"))
}

type Reads = Vec<(String, Option<[u8; 32]>)>;

thread_local! {
    /// The module reads of the action running on this thread, while one is recorded.
    static RECORDING: RefCell<Option<Reads>> = const { RefCell::new(None) };
}

/// Record one reply to a guest's module request: the key it asked for and the SHA-256 of
/// what it was told, or `None` for absent. A no-op unless this thread is recording.
pub fn record_read(key: &str, data: Option<&str>) {
    RECORDING.with(|r| {
        if let Some(reads) = r.borrow_mut().as_mut() {
            reads.push((key.to_string(), data.map(|d| sha256(d.as_bytes()))));
        }
    });
}

/// One cacheable action, named by its manifest key.
pub struct Action {
    dir: PathBuf,
    mkey: [u8; 32],
    verify: bool,
    tag: &'static str,
}

/// The trace prefix of an action kind: the `-O` chain's lines read `-O hit`, `-O miss`, …,
/// so a build that runs both actions reports each.
fn tag_of(kind: &str) -> &'static str {
    if kind == "opt" { "-O " } else { "" }
}

/// One length-prefixed field of a key, so no two field lists hash alike.
fn feed(h: &mut Vec<u8>, part: &[u8]) {
    h.extend_from_slice(&(part.len() as u64).to_le_bytes());
    h.extend_from_slice(part);
}

fn transcript_text(reads: &Reads) -> String {
    let mut s = format!("T {}\n", reads.len());
    for (key, hash) in reads {
        let h = hash.map_or_else(|| "-".to_string(), |h| hex(&h));
        s.push_str(&format!("{h} {}\n", hex(key.as_bytes())));
    }
    s
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

/// A manifest's transcripts, most recent first. A file that does not parse reads as empty,
/// which is a miss.
fn parse_manifest(text: &str) -> Vec<Reads> {
    let mut lines = text.lines();
    if lines.next() != Some(MANIFEST_MAGIC) {
        return Vec::new();
    }
    let mut out = Vec::new();
    while let Some(head) = lines.next() {
        let Some(n) = head.strip_prefix("T ").and_then(|n| n.parse::<usize>().ok()) else {
            return Vec::new();
        };
        let mut reads = Vec::with_capacity(n);
        for _ in 0..n {
            let Some((h, k)) = lines.next().and_then(|l| l.split_once(' ')) else {
                return Vec::new();
            };
            let hash = match h {
                "-" => None,
                h => match unhex(h).and_then(|b| <[u8; 32]>::try_from(b).ok()) {
                    Some(b) => Some(b),
                    None => return Vec::new(),
                },
            };
            let Some(key) = unhex(k).and_then(|b| String::from_utf8(b).ok()) else {
                return Vec::new();
            };
            reads.push((key, hash));
        }
        out.push(reads);
    }
    out
}

/// Write `bytes` to `path` through a temp file unique to this process and thread, so a
/// concurrent reader sees the whole old file or the whole new one. Best-effort.
fn publish(path: &Path, bytes: &[u8]) {
    static SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = path.with_extension(format!("{}.{n}.tmp", std::process::id()));
    if std::fs::write(&tmp, bytes).is_err() || std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
}

/// Make an entry young again for the LRU prune, at most once a minute.
fn touch(path: &Path) {
    let stale = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age.as_secs() >= 60);
    if stale {
        if let Ok(f) = std::fs::OpenOptions::new().write(true).open(path) {
            let _ = f.set_modified(std::time::SystemTime::now());
        }
    }
}

/// The soft size `<cache>/compile/` is pruned back to: `$VL_COMPILE_CACHE_MAX_MB` MiB,
/// default 4096.
fn max_bytes() -> u64 {
    std::env::var("VL_COMPILE_CACHE_MAX_MB")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_MAX_MB)
        .saturating_mul(1 << 20)
}

impl Action {
    /// The action named by `kind` and the `parts` the host knows before the guest runs (the
    /// seed's SHA-256 first, then what it stages), or `None` (traced) when the cache is off
    /// for this process, has no private directory, or `parts` cannot be computed. `parts` is
    /// called only when the cache is on, so a default run pays for none of it.
    pub fn new(kind: &str, parts: impl FnOnce() -> Option<Vec<Vec<u8>>>) -> Option<Action> {
        let tag = tag_of(kind);
        let verify = match mode() {
            Ok(v) => v,
            Err(why) => {
                trace(&format!("{tag}off ({why})"));
                return None;
            }
        };
        let root = user_cache_root()?;
        let dir = root.join("compile");
        if private_cache_dir(&root).is_err() || private_cache_dir(&dir).is_err() {
            trace(&format!("{tag}off (unsafe dir)"));
            return None;
        }
        let mut h = Vec::new();
        feed(&mut h, MANIFEST_MAGIC.as_bytes());
        feed(&mut h, kind.as_bytes());
        feed(&mut h, env!("VL_HOST_BUILD_ID").as_bytes());
        for (k, v) in keyed_env() {
            feed(&mut h, k.as_bytes());
            feed(&mut h, v.as_bytes());
        }
        for p in parts()? {
            feed(&mut h, &p);
        }
        Some(Action { dir, mkey: sha256(&h), verify, tag })
    }

    fn trace(&self, what: &str) {
        trace(&format!("{}{what}", self.tag));
    }

    fn manifest_path(&self) -> PathBuf {
        self.dir.join(format!("{}.m", hex(&self.mkey)))
    }

    fn result_key(&self, reads: &Reads) -> [u8; 32] {
        let mut h = self.mkey.to_vec();
        h.extend_from_slice(transcript_text(reads).as_bytes());
        sha256(&h)
    }

    fn result_path(&self, rkey: &[u8; 32]) -> PathBuf {
        self.dir.join(format!("{}.r", hex(rkey)))
    }

    /// Replay each stored transcript against the world through `read` — the same reader the
    /// guest's requests are served by — and return the bytes of the first that matches.
    fn lookup(&self, read: &dyn Fn(&str) -> Option<String>) -> Option<(Vec<u8>, [u8; 32])> {
        let mpath = self.manifest_path();
        let manifest = std::fs::read_to_string(&mpath).ok()?;
        let mut seen: std::collections::HashMap<String, Option<[u8; 32]>> =
            std::collections::HashMap::new();
        for reads in parse_manifest(&manifest) {
            let matches = reads.iter().all(|(key, want)| {
                let got = *seen
                    .entry(key.clone())
                    .or_insert_with(|| read(key).map(|d| sha256(d.as_bytes())));
                got == *want
            });
            if !matches {
                continue;
            }
            let rkey = self.result_key(&reads);
            let rpath = self.result_path(&rkey);
            let file = std::fs::read(&rpath).ok()?;
            if file.len() < 40 || &file[..8] != RESULT_MAGIC || file[8..40] != sha256(&file[40..]) {
                return None;
            }
            touch(&mpath);
            touch(&rpath);
            return Some((file[40..].to_vec(), rkey));
        }
        None
    }

    fn store(&self, reads: Reads, bytes: &[u8]) {
        let rkey = self.result_key(&reads);
        let rpath = self.result_path(&rkey);
        let mut file = Vec::with_capacity(40 + bytes.len());
        file.extend_from_slice(RESULT_MAGIC);
        file.extend_from_slice(&sha256(bytes));
        file.extend_from_slice(bytes);
        publish(&rpath, &file);
        let mpath = self.manifest_path();
        let old = std::fs::read_to_string(&mpath).map(|t| parse_manifest(&t)).unwrap_or_default();
        let mut text = format!("{MANIFEST_MAGIC}\n{}", transcript_text(&reads));
        for t in old.into_iter().filter(|t| *t != reads).take(MANIFEST_KEEP - 1) {
            text.push_str(&transcript_text(&t));
        }
        publish(&mpath, text.as_bytes());
        prune_cache_dir(&self.dir, &rpath, &[".m", ".r"], max_bytes());
        self.trace("stored");
    }
}

/// Run one action through the cache. On a hit, `from_hit` turns the stored bytes into the
/// caller's result; under `VL_COMPILE_CACHE_VERIFY=1` the action is ALSO compiled cold and a
/// difference exits with `EXIT_CACHE_MISMATCH`. On a miss, `compile` runs with this thread's
/// module reads recorded, and `emitted` says which of its results may be stored (a failed
/// or invalid compile returns `None` and stores nothing).
pub fn serve<T>(
    action: Option<&Action>,
    read: &dyn Fn(&str) -> Option<String>,
    mut compile: impl FnMut() -> wasmtime::Result<T>,
    emitted: impl Fn(&T) -> Option<Vec<u8>>,
    from_hit: impl FnOnce(Vec<u8>) -> T,
) -> wasmtime::Result<T> {
    let Some(action) = action else {
        return compile();
    };
    if let Some((bytes, rkey)) = action.lookup(read) {
        action.trace("hit");
        if !action.verify {
            return Ok(from_hit(bytes));
        }
        let cold = compile()?;
        let fresh = emitted(&cold);
        if fresh.as_deref() != Some(&bytes[..]) {
            let at = fresh.as_ref().map_or(0, |f| {
                f.iter().zip(&bytes).position(|(a, b)| a != b).unwrap_or(f.len().min(bytes.len()))
            });
            eprintln!(
                "vl: compile cache MISMATCH — a cached result differs from a cold compile \
                 (manifest {}, result {}, first differing byte at offset {at}; cached {} bytes, \
                 cold {})",
                hex(&action.mkey),
                hex(&rkey),
                bytes.len(),
                fresh.map_or_else(|| "no module".to_string(), |f| format!("{} bytes", f.len())),
            );
            std::process::exit(EXIT_CACHE_MISMATCH);
        }
        action.trace("verified");
        return Ok(cold);
    }
    action.trace("miss");
    RECORDING.with(|r| *r.borrow_mut() = Some(Vec::new()));
    let result = compile();
    let reads = RECORDING.with(|r| r.borrow_mut().take()).unwrap_or_default();
    if let Ok(t) = &result {
        if let Some(bytes) = emitted(t) {
            action.store(reads, &bytes);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_limit_is_4096_mib() {
        if std::env::var_os("VL_COMPILE_CACHE_MAX_MB").is_none() {
            assert_eq!(max_bytes(), 4096 << 20);
        }
    }
}
