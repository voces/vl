import * as path from "path";
import * as os from "node:os";
import { unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import {
  CancellationToken,
  commands as Commands,
  ExtensionContext,
  Location,
  OutputChannel,
  Position,
  Range,
  RelativePattern,
  StatusBarAlignment,
  StatusBarItem,
  Terminal,
  TestController,
  TestItem,
  TestItemCollection,
  TestMessage,
  TestRun,
  TestRunProfileKind,
  TestRunRequest,
  tests as Tests,
  TextDocument,
  ThemeColor,
  Uri,
  window as Window,
  workspace as Workspace,
  WorkspaceFolder,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { STD_SOURCES } from "../../std/embedded.ts";
import { stdUriPathToKey, VL_STD_SCHEME } from "./moduleGraph.ts";
import { type SeedOriginInfo, seedStatusView } from "./typeFeatures.ts";
import {
  type DiscoveredTest,
  discoverTests,
  failureAnchor,
  type FailureLocation,
  parseTestReport,
  planFileRun,
  type RunTarget,
  type TestKind,
} from "./testDiscovery.ts";

let defaultClient: LanguageClient;
const clients: Map<string, LanguageClient> = new Map();

// ---- status-bar seed indicator (D9.2) ---------------------------------------
//
// ONE item per window, updated by whichever client last reported — each server
// (one per outermost workspace folder, plus the untitled default) sends
// `vital/seedOrigin` with the seed-ladder rung it loaded, or null when NO seed
// loaded. The degraded state gets the warning background: every LSP feature is
// silently empty without a seed, and that used to be invisible outside the
// output channel (the survey's "a glance beats a debugging session").
let seedStatusItem: StatusBarItem | undefined;

const updateSeedStatus = (origin: SeedOriginInfo | null): void => {
  if (seedStatusItem === undefined) {
    seedStatusItem = Window.createStatusBarItem(StatusBarAlignment.Left, 0);
    seedStatusItem.name = "Vital: compiler seed";
  }
  const view = seedStatusView(origin);
  seedStatusItem.text = view.text;
  seedStatusItem.tooltip = view.tooltip;
  seedStatusItem.backgroundColor = view.degraded
    ? new ThemeColor("statusBarItem.warningBackground")
    : undefined;
  seedStatusItem.show();
};

let _sortedWorkspaceFolders: string[] | undefined;
const sortedWorkspaceFolders = () => {
  if (_sortedWorkspaceFolders === void 0) {
    _sortedWorkspaceFolders = Workspace.workspaceFolders
      ? Workspace.workspaceFolders.map((folder) => {
        let result = folder.uri.toString();
        if (result.charAt(result.length - 1) !== "/") result = result + "/";
        return result;
      }).sort((a, b) => a.length - b.length)
      : [];
  }
  return _sortedWorkspaceFolders;
};
Workspace.onDidChangeWorkspaceFolders(() =>
  _sortedWorkspaceFolders = undefined
);

const getOuterMostWorkspaceFolder = (folder: WorkspaceFolder) => {
  const sorted = sortedWorkspaceFolders();
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== "/") uri = uri + "/";
    if (uri.startsWith(element)) {
      return Workspace.getWorkspaceFolder(Uri.parse(element))!;
    }
  }
  return folder;
};

const createClient = (
  module: string,
  outputChannel: OutputChannel,
  scheme: "untitled" | "file",
  folder?: WorkspaceFolder,
) => {
  const serverOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: {
      module,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6012"] },
    },
  };
  // `vital.compilerWasm` rides initializationOptions (read once at client start —
  // change requires a reload): an override path for the self-hosted compiler seed
  // the LSP runs on. The TS checker is gone (kill-TS) — the server runs entirely
  // on the wasm seed; see lsp/src/wasmChecker.ts.
  const config = Workspace.getConfiguration("vital", folder?.uri);
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{
      scheme,
      language: "vital",
      pattern: scheme === "file" ? `${folder!.uri.fsPath}/**/*` : undefined,
    }],
    diagnosticCollectionName: "vital",
    outputChannel: outputChannel,
    initializationOptions: {
      compilerWasm: config.get<string>("compilerWasm", ""),
      // The server's seed ladder execs `vl seed` through this (its rung 5);
      // without it the ladder always ran `vl` from PATH and the setting only
      // steered the Run command — found by the editor-surface survey.
      compilerPath: config.get<string>("compilerPath", ""),
    },
  };
  const client = new LanguageClient("Vital", serverOptions, clientOptions);
  client.start();
  // (A `registerProposedFeatures()` call used to sit AFTER `start()` — dead by
  // ordering, and no proposed LSP feature is in use; removed rather than moved.)
  // The seed-origin status item (D9.2). Registered after `start()` — the v9
  // client queues handler registrations until the connection is live.
  client.onNotification("vital/seedOrigin", updateSeedStatus);
  return client;
};

// Walks up from `startDir` to the nearest ancestor holding a `deno.json` (the
// compiler project root, which defines the `run` task + binaryen import map).
// Returns undefined if none is found before the filesystem root.
const findProjectRoot = (startDir: string): string | undefined => {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, "deno.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

// How a `.vl` document reaches the native `vl` binary — resolved identically by
// the Run command (Ctrl+F5) and the test controller, which is why it lives here
// rather than inside either one.
interface VlInvocation {
  /** The binary to spawn: `vital.compilerPath`, else `vl` from the PATH. */
  bin: string;
  /** The setting as written, empty when unset — the wording of an error. */
  configured: string;
  /** Working directory: deno.json root → workspace folder → file's dir → $HOME. */
  cwd: string;
  /** `vital.compilerWasm`, empty when unset — threads through as `--compiler`. */
  compilerWasm: string;
}

// Resolve the terminal's/child's cwd from the document's real location *before*
// any temp mirroring (a temp file under os.tmpdir() has no deno.json above it).
// A `deno.json` ancestor (the compiler repo's own dev loop, where `vl` defaults
// its seed to <cwd>/build/) wins; every other project runs from its WORKSPACE
// FOLDER, then from the file's own directory, then $HOME. NEVER the extension
// install path: the old last rung was `dirname(context.extensionPath)`, written
// for an in-tree dev-host install — under a symlinked install it opened the
// terminal in `~/.vscode-server/extensions`, a directory that means nothing to
// the user. (Re-landed: #2078 shipped this and #2079 unknowingly reverted it via
// a stale-base file carry — see that PR's postmortem note.)
const resolveVl = (uri: Uri): VlInvocation => {
  const docDir = uri.scheme === "file" ? path.dirname(uri.fsPath) : undefined;
  const folder = Workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  const cwd = (docDir && findProjectRoot(docDir)) ??
    (folder && findProjectRoot(folder)) ??
    folder ??
    docDir ??
    os.homedir();
  const config = Workspace.getConfiguration("vital", uri);
  const configured = config.get<string>("compilerPath", "").trim();
  const bin = configured
    ? (path.isAbsolute(configured) ? configured : path.join(cwd, configured))
    : "vl";
  return {
    bin,
    configured,
    cwd,
    compilerWasm: config.get<string>("compilerWasm", "").trim(),
  };
};

// Probe the binary BEFORE committing to a terminal or a test run: a missing
// (`ENOENT`) or wrong-platform (`exec format error`) binary fails to spawn.
// Returns an actionable message, or undefined when the binary executes. `vl`
// with no args prints usage and exits non-zero, but it EXECUTES — `error` is set
// only when the OS can't run it at all, so a non-zero status is fine.
const probeVl = (vl: VlInvocation): string | undefined => {
  const probe = spawnSync(vl.bin, [], { stdio: "ignore" });
  if (!probe.error) return undefined;
  const where = vl.configured
    ? `the \`vl\` binary at ${vl.bin}`
    : "`vl` on your PATH";
  return `Vital: can't run ${where} (${probe.error.message}). Build it for ` +
    "this platform with `cd scripts/vl-host && cargo build --release`, then " +
    "set `vital.compilerPath` to it (or put `vl` on your PATH).";
};

// Runs the active `.vl` file in an integrated terminal via the native `vl`
// binary (`vl run` — compile + run, streaming diagnostics and program output).
// The terminal is reused across runs; binary and cwd come from `resolveVl`.
const registerRunCommand = (context: ExtensionContext) => {
  let terminal: Terminal | undefined;
  // Track the cwd the terminal was opened in: the terminal's working directory
  // is fixed at creation time, so if the resolved project root changes (e.g.
  // the user switches to a file from a different vl repo), we must dispose and
  // recreate the terminal rather than reusing one anchored to the wrong root.
  let terminalCwd: string | undefined;
  Window.onDidCloseTerminal((closed) => {
    if (closed === terminal) {
      terminal = undefined;
      terminalCwd = undefined;
    }
  });

  const run = async () => {
    const editor = Window.activeTextEditor;
    if (!editor || editor.document.languageId !== "vital") {
      Window.showErrorMessage("Vital: open a .vl file to run it.");
      return;
    }
    const doc = editor.document;
    const vl = resolveVl(doc.uri);
    const cwd = vl.cwd;
    // If the resolved root changed, the existing terminal is anchored to the
    // wrong directory — dispose it so the recreate branch below runs with the
    // correct cwd.
    if (terminal && terminalCwd !== cwd) {
      terminal.dispose();
      terminal = undefined;
      terminalCwd = undefined;
    }
    // A `*.test.vl` file goes through the TEST RUNNER (`vl test <file>`) —
    // `vl run` on a test module executes only its registration pass, which
    // "succeeds" without running a single test. Decided on the DOCUMENT's own
    // name (an untitled buffer can't be a test file).
    const isTest = !doc.isUntitled && doc.uri.path.endsWith(".test.vl");
    // Run the buffer as-is, with no save side effect: an untitled or unsaved
    // (dirty) document has no usable on-disk path, so mirror its current text to
    // a reused temp file — keeping the `.test.vl` suffix when the source is a
    // test file, since the runner discovers by that suffix. A clean, saved file
    // runs by its real path (accurate error paths, no temp clutter).
    let file: string;
    if (doc.isUntitled || doc.isDirty) {
      file = path.join(os.tmpdir(), isTest ? "vital-run.test.vl" : "vital-run.vl");
      await writeFile(file, doc.getText());
    } else {
      file = doc.uri.fsPath;
    }
    // A missing or wrong-platform binary gets a clear error instead of a cryptic
    // shell failure leaking into the terminal.
    const unspawnable = probeVl(vl);
    if (unspawnable !== undefined) {
      Window.showErrorMessage(unspawnable);
      return;
    }
    // Thread the configured seed through to `vl run` when set; otherwise `vl`
    // defaults to <cwd>/build/vl-compiler.wasm (the project root).
    const compilerArg = vl.compilerWasm
      ? ` --compiler "${vl.compilerWasm}"`
      : "";
    const binToken = vl.configured ? `"${vl.bin}"` : "vl";
    if (!terminal) {
      terminal = Window.createTerminal({ name: "Vital", cwd });
      terminalCwd = cwd;
    }
    terminal.show(true);
    terminal.sendText(`${binToken} ${isTest ? "test" : "run"} "${file}"${compilerArg}`);
  };

  context.subscriptions.push(Commands.registerCommand("vital.runFile", run));
};

// The wire shape of one reference location in a server-sent command argument
// (LSP `Location`, plain JSON — classes don't survive the connection).
type WireLocation = {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

// The click-through behind the export reference-count code lens (D9.4). The
// server can't target `editor.action.showReferences` directly — its arguments
// must be real `Uri`/`Position`/`Location` instances, and the LSP wire delivers
// plain JSON — so the lens command points here and this shim revives the values
// (the standard pattern; rust-analyzer ships the same shim).
const registerShowReferences = (context: ExtensionContext) => {
  context.subscriptions.push(
    Commands.registerCommand(
      "vital.showReferences",
      (
        uri: string,
        position: { line: number; character: number },
        locations: WireLocation[],
      ) =>
        Commands.executeCommand(
          "editor.action.showReferences",
          Uri.parse(uri),
          new Position(position.line, position.character),
          (locations ?? []).map((l) =>
            new Location(
              Uri.parse(l.uri),
              new Range(
                l.range.start.line,
                l.range.start.character,
                l.range.end.line,
                l.range.end.character,
              ),
            )
          ),
        ),
    ),
  );
};

// ---- Testing API: per-test click-to-run (D9 slot 8) --------------------------
//
// A `TestController` over `*.test.vl`, which buys the gutter run icon on each
// `it(...)`, the Test Explorer tree, and pass/fail state rendered AT the test
// (the survey's §4 verdict over CodeLens, which has no gutter icon at all).
// Everything decidable without VS Code lives in `testDiscovery.ts` and is unit
// tested; this is the wiring.
//
// The CLI needed no change: `vl test <file>` accepts a single file (any
// suffix — a non-directory path short-circuits the `*.test.vl` walk) and `-t`
// filters by SUBSTRING over the `describe > it` path. So one child process per
// clicked root, and the report is read back onto items by that same path.
//
// ONE RUN PROFILE, no debug: VL has no DAP adapter, and a Debug profile that
// silently behaves like Run is worse than an absent one.
//
// A `describe` item is a SCOPE, not a test — the runner registers only leaves —
// so it takes no state of its own; its children carry the results.

/** `<file uri>#<kind>:<ordinal>:<path>` — the ordinal keeps duplicate names distinct. */
const testItemId = (uri: Uri, node: DiscoveredTest, ordinal: number): string =>
  `${uri.toString()}#${node.kind}:${ordinal}:${node.path}`;

/** The `kind`/`path` back out of an id, or undefined for a FILE item. */
const testItemTarget = (id: string): RunTarget | undefined => {
  const hash = id.indexOf("#");
  if (hash < 0) return undefined;
  const rest = id.slice(hash + 1);
  const kindEnd = rest.indexOf(":");
  const ordEnd = rest.indexOf(":", kindEnd + 1);
  if (kindEnd < 0 || ordEnd < 0) return undefined;
  return { kind: rest.slice(0, kindEnd) as TestKind, path: rest.slice(ordEnd + 1) };
};

const isTestFile = (uri: Uri): boolean =>
  uri.scheme === "file" && uri.path.endsWith(".test.vl");

/** The file item an item belongs to (a file item is its own root). */
const fileItemOf = (item: TestItem): TestItem => {
  let cur = item;
  while (cur.parent !== undefined) cur = cur.parent;
  return cur;
};

/** Every `it`/`itSkip` item beneath `item`, in registration order. */
const leafItemsOf = (item: TestItem): TestItem[] => {
  const out: TestItem[] = [];
  const walk = (children: TestItemCollection): void => {
    children.forEach((child) => {
      if (testItemTarget(child.id)?.kind === "describe") walk(child.children);
      else out.push(child);
    });
  };
  walk(item.children);
  return out;
};

const registerTestController = (context: ExtensionContext) => {
  const ctrl = Tests.createTestController("vital", "Vital");
  context.subscriptions.push(ctrl);

  const fileItem = (uri: Uri): TestItem => {
    const id = uri.toString();
    const existing = ctrl.items.get(id);
    if (existing !== undefined) return existing;
    const item = ctrl.createTestItem(id, path.basename(uri.fsPath), uri);
    // Children arrive from `resolveHandler` — the tree stays lazy so opening a
    // large workspace does not read every test file up front.
    item.canResolveChildren = true;
    ctrl.items.add(item);
    return item;
  };

  const rebuild = (item: TestItem, uri: Uri, text: string): void => {
    let ordinal = 0;
    const build = (
      nodes: readonly DiscoveredTest[],
      into: TestItemCollection,
    ): void => {
      const built: TestItem[] = [];
      for (const node of nodes) {
        const child = ctrl.createTestItem(
          testItemId(uri, node, ordinal++),
          node.name,
          uri,
        );
        child.range = new Range(
          node.range.start.line,
          node.range.start.character,
          node.range.end.line,
          node.range.end.character,
        );
        // `itSkip` still appears in the tree (the runner collects and reports
        // it) — labelled, so a green run of a skipped test is not a surprise.
        if (node.kind === "itSkip") child.description = "skip";
        if (node.children.length > 0) build(node.children, child.children);
        built.push(child);
      }
      into.replace(built);
    };
    build(discoverTests(text), item.children);
  };

  // The buffer wins over the file on disk: an unsaved edit that renames a test
  // must move its gutter icon immediately, not on save.
  const textOf = async (uri: Uri): Promise<string> => {
    const open = Workspace.textDocuments.find(
      (d) => d.uri.toString() === uri.toString(),
    );
    if (open !== undefined) return open.getText();
    return new TextDecoder().decode(await Workspace.fs.readFile(uri));
  };

  const load = async (item: TestItem): Promise<void> => {
    if (item.uri === undefined) return;
    try {
      rebuild(item, item.uri, await textOf(item.uri));
    } catch {
      // A file deleted between the watcher event and the read: leave the item's
      // children as they are; the delete handler removes it a moment later.
    }
  };

  // A workspace-wide sweep, scoped exactly like the language clients: one pass
  // per workspace folder, `node_modules` excluded.
  const discoverWorkspace = async (): Promise<void> => {
    for (const folder of Workspace.workspaceFolders ?? []) {
      const found = await Workspace.findFiles(
        new RelativePattern(folder, "**/*.test.vl"),
        "**/node_modules/**",
      );
      for (const uri of found) fileItem(uri);
    }
    // Plus any test file open from outside every folder (a loose file), which
    // `findFiles` cannot see.
    for (const doc of Workspace.textDocuments) {
      if (isTestFile(doc.uri)) await load(fileItem(doc.uri));
    }
  };

  ctrl.resolveHandler = async (item) => {
    if (item === undefined) await discoverWorkspace();
    else await load(item);
  };
  ctrl.refreshHandler = async () => {
    await discoverWorkspace();
    const items: TestItem[] = [];
    ctrl.items.forEach((i) => items.push(i));
    for (const i of items) await load(i);
  };

  // Open documents re-scan as they are typed in, debounced: the scan is cheap
  // but rebuilding the item tree resets the Explorer's selection.
  const pending = new Map<string, number>();
  const scheduleRescan = (uri: Uri): void => {
    if (!isTestFile(uri)) return;
    const key = uri.toString();
    const queued = pending.get(key);
    if (queued !== undefined) clearTimeout(queued);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        void load(fileItem(uri));
      }, 300) as unknown as number,
    );
  };

  context.subscriptions.push(
    Workspace.onDidOpenTextDocument((doc) => {
      if (isTestFile(doc.uri)) void load(fileItem(doc.uri));
    }),
    Workspace.onDidChangeTextDocument((e) => scheduleRescan(e.document.uri)),
  );
  for (const doc of Workspace.textDocuments) {
    if (isTestFile(doc.uri)) void load(fileItem(doc.uri));
  }

  const watcher = Workspace.createFileSystemWatcher("**/*.test.vl");
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => void load(fileItem(uri))),
    watcher.onDidChange((uri) => void load(fileItem(uri))),
    watcher.onDidDelete((uri) => ctrl.items.delete(uri.toString())),
  );

  // A file item can reach the run handler still unresolved (Run All, or a click
  // on a collapsed file). Without its children the run would have no items to
  // report onto and would look like a silent no-op — so fill it in first. Only
  // when EMPTY: a reload recreates every item, which would invalidate the very
  // items the request is holding.
  const ensureLoaded = async (item: TestItem): Promise<void> => {
    if (item.children.size === 0) await load(item);
  };

  ctrl.createRunProfile(
    "Run",
    TestRunProfileKind.Run,
    (request, token) => runTests(ctrl, ensureLoaded, request, token),
    true,
  );
};

/**
 * One `vl test` child, its whole report collected. Rejects only when the process
 * cannot be spawned at all — a failing test is an exit code, not an error.
 * Cancellation KILLS the child; the report collected so far is still returned,
 * so the tests that did finish keep their real results.
 */
const spawnVlTest = (
  vl: VlInvocation,
  args: string[],
  token: CancellationToken,
): Promise<{ text: string; code: number | null }> =>
  new Promise((resolve, reject) => {
    const child = spawn(vl.bin, args, { cwd: vl.cwd });
    let text = "";
    const cancel = token.onCancellationRequested(() => child.kill());
    child.stdout.on("data", (b: Buffer) => text += b.toString());
    child.stderr.on("data", (b: Buffer) => text += b.toString());
    child.on("error", (e) => {
      cancel.dispose();
      reject(e);
    });
    child.on("close", (code) => {
      cancel.dispose();
      resolve({ text, code });
    });
  });

const runTests = async (
  ctrl: TestController,
  ensureLoaded: (item: TestItem) => Promise<void>,
  request: TestRunRequest,
  token: CancellationToken,
): Promise<void> => {
  const run = ctrl.createTestRun(request);
  // `appendOutput` renders in a terminal: bare "\n" leaves a staircase.
  const say = (s: string) => run.appendOutput(s.replace(/\r?\n/g, "\r\n"));

  const roots: TestItem[] = [];
  if (request.include !== undefined) roots.push(...request.include);
  else ctrl.items.forEach((item) => roots.push(item));
  // `-t` has no negative form, so an excluded test inside a requested scope
  // still EXECUTES; what exclusion controls is what this run reports.
  const excluded = new Set((request.exclude ?? []).map((i) => i.id));

  // One group per file, preserving click order.
  const groups = new Map<string, { file: TestItem; roots: TestItem[] }>();
  for (const item of roots) {
    if (excluded.has(item.id)) continue;
    const file = fileItemOf(item);
    if (file.uri === undefined) continue;
    const key = file.id;
    const group = groups.get(key) ?? { file, roots: [] };
    group.roots.push(item);
    groups.set(key, group);
  }

  try {
    for (const { file, roots: picked } of groups.values()) {
      if (token.isCancellationRequested) break;
      await ensureLoaded(file);
      await runOneFile(run, say, file, picked, token);
    }
  } finally {
    run.end();
  }
};

/**
 * What a `std:test` failure location has to be resolved AGAINST. The module key
 * `std:test` reports is spelled exactly as the `vl test` target was, so it is
 * resolved the way the child would have resolved it: against the cwd the child
 * was spawned in.
 */
interface RunPaths {
  /** The cwd `vl test` ran in. */
  cwd: string;
  /** The path handed to `vl test` — the dirty MIRROR when the buffer is unsaved. */
  target: string;
  /** The document that path stands for: what the mirror must map back to. */
  uri: Uri;
}

/**
 * A reported `expect` location as an editor Location — the anchor that
 * SUPERSEDES the `it`-line heuristic (D9 slot 12).
 *
 * Two cases, and the second is the one the heuristic could never have served: a
 * location in the file under test resolves to the test document, and a location
 * in ANOTHER file — a helper that called `expect` without forwarding its own
 * `caller` — resolves to that file and anchors there. The deciding is in
 * `testDiscovery.ts` so it is unit-testable; only the vscode types are here.
 */
const anchorLocation = (paths: RunPaths, loc: FailureLocation): Location => {
  const at = failureAnchor(loc, paths.cwd, paths.target, path.resolve);
  return new Location(
    at.isTarget ? paths.uri : Uri.file(at.file),
    new Position(at.line, at.col),
  );
};

/**
 * The runner's report onto the item tree. Results are matched by the
 * scope-qualified path — the one string `vltRegister`, the report and `-t` all
 * agree on — so a result for a test OUTSIDE the request (a substring filter is
 * generous) still lands on its own item instead of being dropped. Ids of the
 * items that got a state go into `reported`.
 */
const applyReport = (
  run: TestRun,
  say: (s: string) => void,
  file: TestItem,
  leaves: readonly TestItem[],
  enqueued: readonly TestItem[],
  reported: Set<string>,
  text: string,
  paths: RunPaths,
): void => {
  const parsed = parseTestReport(text);

  // A file-level outcome belongs to no single test: `<compile>` (the module did
  // not typecheck) or `<file top level>` (its registration pass trapped).
  for (const failure of parsed.fileErrors) {
    const message = new TestMessage(`${failure.label}\n${failure.message}`);
    run.errored(file, message);
    for (const item of enqueued) {
      run.errored(item, message);
      reported.add(item.id);
    }
  }

  const byPath = new Map<string, TestItem[]>();
  for (const leaf of leaves) {
    const p = testItemTarget(leaf.id)!.path;
    const bucket = byPath.get(p);
    if (bucket === undefined) byPath.set(p, [leaf]);
    else bucket.push(leaf);
  }

  // Two `it`s can register the same path; the report emits a line for each, in
  // registration order, so pair them off in that order rather than picking one.
  const cursor = new Map<string, number>();
  for (const result of parsed.results) {
    const bucket = byPath.get(result.path);
    if (bucket === undefined) {
      // A name the scan cannot see — built at runtime, or registered from a
      // helper. It ran; say so rather than swallowing the line.
      say(
        `  (${result.outcome}: ${JSON.stringify(result.path)} — no item in ` +
          "the source scan)\n",
      );
      continue;
    }
    const nth = cursor.get(result.path) ?? 0;
    cursor.set(result.path, nth + 1);
    const item = bucket[Math.min(nth, bucket.length - 1)];
    reported.add(item.id);
    // No duration: the runner prints none, and an invented one is a lie the
    // Test Explorer would happily chart.
    if (result.outcome === "passed") run.passed(item);
    else if (result.outcome === "skipped") run.skipped(item);
    else {
      const message = new TestMessage(result.message ?? "test failed");
      // The `expect` site when the runner reported one; otherwise the `it` line,
      // which is still the best answer for a `fail(msg)`, a raw trap, or an
      // older runner whose report carries no location at all.
      if (result.location !== undefined) {
        message.location = anchorLocation(paths, result.location);
      } else if (item.uri !== undefined && item.range !== undefined) {
        message.location = new Location(item.uri, item.range);
      }
      run.failed(item, message);
    }
  }
};

const runOneFile = async (
  run: TestRun,
  say: (s: string) => void,
  file: TestItem,
  picked: readonly TestItem[],
  token: CancellationToken,
): Promise<void> => {
  const uri = file.uri!;
  const leaves = leafItemsOf(file);
  const all = leaves.map((i) => testItemTarget(i.id)!.path);

  // A click on the file item itself means the whole file; anything else names a
  // describe or a test.
  const targets: RunTarget[] = [];
  for (const item of picked) {
    if (item === file) {
      targets.length = 0;
      break;
    }
    const target = testItemTarget(item.id);
    if (target !== undefined) targets.push(target);
  }
  const specs = planFileRun(all, targets);

  // Which items each spec is answerable for, and every item this run touches.
  const wanted = new Set<string>();
  for (const spec of specs) for (const p of spec.targetPaths) wanted.add(p);
  const enqueued = leaves.filter((i) => wanted.has(testItemTarget(i.id)!.path));
  for (const item of enqueued) run.enqueued(item);
  const reported = new Set<string>();

  const vl = resolveVl(uri);
  const unspawnable = probeVl(vl);
  if (unspawnable !== undefined) {
    // A configuration error is a RUN error, never a silent no-op.
    const message = new TestMessage(unspawnable);
    for (const item of enqueued) run.errored(item, message);
    say(unspawnable + "\n");
    Window.showErrorMessage(unspawnable);
    return;
  }

  // An unsaved buffer runs as typed, mirrored to a temp file BESIDE the original
  // rather than under os.tmpdir() as the Run command does: a test module almost
  // always imports its subject by a relative path, and those resolve from the
  // file's own directory. The mirror is a dotfile (invisible to a `*.test.vl`
  // directory walk) and is removed when the run finishes; its only visible trace
  // is the path a COMPILE error would print.
  const doc = Workspace.textDocuments.find(
    (d) => d.uri.toString() === uri.toString(),
  );
  let target = uri.fsPath;
  let mirror: string | undefined;
  if (doc !== undefined && doc.isDirty) {
    mirror = path.join(
      path.dirname(uri.fsPath),
      "." + path.basename(uri.fsPath, ".vl") + ".vital-dirty.vl",
    );
    try {
      await writeFile(mirror, doc.getText());
      target = mirror;
    } catch (e) {
      const why = `Vital: could not mirror the unsaved buffer to ${mirror} ` +
        `(${e instanceof Error ? e.message : String(e)}). Save the file and ` +
        "run again.";
      const message = new TestMessage(why);
      for (const item of enqueued) run.errored(item, message);
      say(why + "\n");
      return;
    }
  }

  try {
    for (const spec of specs) {
      if (token.isCancellationRequested) break;
      const args = ["test", target];
      if (spec.filter !== undefined) args.push("-t", spec.filter);
      if (vl.compilerWasm) args.push("--compiler", vl.compilerWasm);
      say(`$ ${vl.bin} ${args.map((a) => JSON.stringify(a)).join(" ")}\n`);
      if (spec.extraPaths.length > 0) {
        // `-t` is a substring filter, so a name contained in another name runs
        // both. Say so, and report both — never drop the extra results.
        say(
          `  note: \`-t\` matches by substring, so this also runs: ` +
            spec.extraPaths.join(", ") + "\n",
        );
      }

      let outcome;
      try {
        outcome = await spawnVlTest(vl, args, token);
      } catch (e) {
        const why = `Vital: \`vl test\` failed to start (${
          e instanceof Error ? e.message : String(e)
        }).`;
        const message = new TestMessage(why);
        for (const item of enqueued) run.errored(item, message);
        say(why + "\n");
        return;
      }
      // The child's whole output reaches the run VERBATIM, before any parsing —
      // so nothing the report says can be lost to a classification miss.
      say(outcome.text);
      const before = reported.size;
      applyReport(run, say, file, leaves, enqueued, reported, outcome.text, {
        cwd: vl.cwd,
        target,
        uri,
      });
      if (outcome.code !== 0 && reported.size === before) {
        say(
          `  note: \`vl test\` exited ${outcome.code} without a report this ` +
            "run could read.\n",
        );
      }
    }
  } finally {
    if (mirror !== undefined) await unlink(mirror).catch(() => {});
  }

  // Anything asked for that the report never mentioned. Cancelled runs mark them
  // skipped; otherwise the scan saw a registration the runner did not make —
  // a conditional `it`, or one written inside a helper.
  for (const item of enqueued) {
    if (reported.has(item.id)) continue;
    if (token.isCancellationRequested) run.skipped(item);
    else {
      run.errored(
        item,
        new TestMessage(
          "`vl test` reported no result for this test. The scan found its " +
            "registration in the source, but the runner — which discovers by " +
            "instantiating the module — did not register it.",
        ),
      );
    }
  }
};

export const activate = (context: ExtensionContext) => {
  const module = context.asAbsolutePath(path.join("dist", "server.mjs"));
  const outputChannel: OutputChannel = Window.createOutputChannel("vital");

  registerRunCommand(context);
  registerShowReferences(context);
  registerTestController(context);

  // Serve `vl-std:/NAME.vl` documents from the generated embedded std map, so a
  // cross-file location into a `std:` module (go-to-definition / peek on a std
  // export) opens a read-only tab holding the real std source. The server emits
  // these URIs (`crossFileUriOf`) whenever the workspace has no `std/NAME.vl`
  // of its own; extension and server are bundled from the same tree, so this
  // map is byte-for-byte the source the checker resolved the range against.
  // The `.vl` suffix keys the tab to the `vital` language for highlighting.
  context.subscriptions.push(
    Workspace.registerTextDocumentContentProvider(VL_STD_SCHEME, {
      provideTextDocumentContent: (uri: Uri): string =>
        STD_SOURCES[stdUriPathToKey(uri.path)] ??
          `// ${uri.path.slice(1)} is not an embedded std module in this build.`,
    }),
  );

  const didOpenTextDocument = (document: TextDocument) => {
    // We are only interested in language mode text
    if (
      document.languageId !== "vital" ||
      (document.uri.scheme !== "file" && document.uri.scheme !== "untitled")
    ) return;

    const uri = document.uri;
    // Untitled files go to a default client.
    if (uri.scheme === "untitled" && !defaultClient) {
      defaultClient = createClient(module, outputChannel, "untitled");
      return;
    }

    let folder = Workspace.getWorkspaceFolder(uri);
    if (!folder) {
      if (!defaultClient) {
        defaultClient = createClient(module, outputChannel, "untitled");
      }
      return;
    }
    folder = getOuterMostWorkspaceFolder(folder);

    if (!clients.has(folder.uri.toString())) {
      clients.set(
        folder.uri.toString(),
        createClient(module, outputChannel, "file", folder),
      );
    }
  };

  Workspace.onDidOpenTextDocument(didOpenTextDocument);
  Workspace.textDocuments.forEach(didOpenTextDocument);
  Workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
};

export const deactivate = async () => {
  seedStatusItem?.dispose();
  seedStatusItem = undefined;
  const promises: Thenable<void>[] = [];
  if (defaultClient) promises.push(defaultClient.stop());
  for (const client of clients.values()) promises.push(client.stop());
  await Promise.all(promises);
  return;
};
