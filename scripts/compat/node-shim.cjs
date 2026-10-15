// Runs one CommonJS `node` script under deno: `deno run -A node-shim.cjs <script> [args...]`.
// The script loads as CommonJS whatever its extension or package `type` says, because
// binaryen's npm `bin/` files are extensionless CommonJS inside a `"type": "module"` package.
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const target = path.resolve(process.argv[2]);
process.argv.splice(1, 1);
const m = new Module(target, null);
m.filename = target;
m.paths = Module._nodeModulePaths(path.dirname(target));
m._compile(fs.readFileSync(target, "utf8").replace(/^#!.*/, ""), target);
