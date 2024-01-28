import * as path from "path";
import {
  ExtensionContext,
  OutputChannel,
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
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{
      scheme,
      language: "vital",
      pattern: scheme === "file" ? `${folder!.uri.fsPath}/**/*` : undefined,
    }],
    diagnosticCollectionName: "vital",
    outputChannel: outputChannel,
  };
  const client = new LanguageClient("Vital", serverOptions, clientOptions);
  client.start();
  client.registerProposedFeatures();
  return client;
};

export const activate = (context: ExtensionContext) => {
  const module = context.asAbsolutePath(path.join("dist", "server.js"));
  const outputChannel: OutputChannel = Window.createOutputChannel("vital");

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
