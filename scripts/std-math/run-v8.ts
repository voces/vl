// Run a VL-built module under Deno (V8) with the repo's JS host imports; write prints to a file.
import { vlHostImports } from "../../compiler/vlHostImports.ts";

const [wasmPath, outPath] = Deno.args;
const logs: string[] = [];
const mod = new WebAssembly.Module(Deno.readFileSync(wasmPath));
const declared = WebAssembly.Module.imports(mod).filter((i) => i.module === "imports").map((i) => i.name);
const { extern, imports } = vlHostImports(logs, declared);
const inst = new WebAssembly.Instance(mod, { extern, imports });
const start = inst.exports.__start__ ?? inst.exports._start;
if (typeof start === "function") (start as () => void)();
Deno.writeTextFileSync(outPath, logs.join("\n") + "\n");
console.log(`${logs.length} lines, exports: ${Object.keys(inst.exports).join(",")}`);
