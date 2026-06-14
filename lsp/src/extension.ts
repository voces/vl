import * as path from "path";
import * as os from "node:os";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  commands as Commands,
  ExtensionContext,
  OutputChannel,
  Terminal,
  TextDocument,
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

let defaultClient: LanguageClient;
const clients: Map<string, LanguageClient> = new Map();

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
  // `vital.checker` / `vital.compilerWasm` ride initializationOptions (read
  // once at client start — change requires a reload). The default is `"wasm"`
  // (kill-TS step 2); set `vital.checker` to `"ts"` to opt back into the
  // TypeScript checker. See lsp/src/wasmChecker.ts for the wasm-backed checker.
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
      checker: config.get<string>("checker", "wasm"),
      compilerWasm: config.get<string>("compilerWasm", ""),
    },
  };
  const client = new LanguageClient("Vital", serverOptions, clientOptions);
  client.start();
  client.registerProposedFeatures();
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

// Runs the active `.vl` file in an integrated terminal via the compiler's
// `deno task run` CLI (compile + run, streaming diagnostics and program output).
// The terminal is reused across runs. `cwd` is the compiler project root, found
// by walking up from the file (or its workspace folder) to the nearest
// `deno.json` — robust to how the extension itself is installed (symlinked dev
// install, dev host, or packaged), which `context.extensionPath` is not.
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
    // Resolve the project root from the document's real location *before* any
    // temp mirroring (a temp file under os.tmpdir() has no deno.json above it).
    // Prefer walking up from the file; fall back to its workspace folder, then
    // to the extension's parent dir for an in-tree (dev-host) install.
    const docDir = doc.uri.scheme === "file"
      ? path.dirname(doc.uri.fsPath)
      : undefined;
    const folder = Workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
    const cwd = (docDir && findProjectRoot(docDir)) ??
      (folder && findProjectRoot(folder)) ??
      path.dirname(context.extensionPath);
    // If the resolved root changed, the existing terminal is anchored to the
    // wrong directory — dispose it so the recreate branch below runs with the
    // correct cwd.
    if (terminal && terminalCwd !== cwd) {
      terminal.dispose();
      terminal = undefined;
      terminalCwd = undefined;
    }
    // Run the buffer as-is, with no save side effect: an untitled or unsaved
    // (dirty) document has no usable on-disk path, so mirror its current text to
    // a reused temp file. A clean, saved file runs by its real path (accurate
    // error paths, no temp clutter).
    let file: string;
    if (doc.isUntitled || doc.isDirty) {
      file = path.join(os.tmpdir(), "vital-run.vl");
      await writeFile(file, doc.getText());
    } else {
      file = doc.uri.fsPath;
    }
    if (!terminal) {
      terminal = Window.createTerminal({ name: "Vital", cwd });
      terminalCwd = cwd;
    }
    terminal.show(true);
    terminal.sendText(`deno task run "${file}"`);
  };

  context.subscriptions.push(Commands.registerCommand("vital.runFile", run));
};

export const activate = (context: ExtensionContext) => {
  const module = context.asAbsolutePath(path.join("dist", "server.mjs"));
  const outputChannel: OutputChannel = Window.createOutputChannel("vital");

  registerRunCommand(context);

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
  const promises: Thenable<void>[] = [];
  if (defaultClient) promises.push(defaultClient.stop());
  for (const client of clients.values()) promises.push(client.stop());
  await Promise.all(promises);
  return;
};
