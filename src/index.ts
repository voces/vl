import { CharStream, CommonTokenStream } from "antlr4";
import VLLexer from "./antlr/VL_Lexer.ts";
import VLParser from "./antlr/VL_Parser.ts";
import { execute } from "./execute.ts";

const getDefaultGlobalScope = () => ({
  out: console.log,
  err: console.error,
  now: () => performance.now(),
});

const run = (code: string) => {
  const chars = new CharStream(code);
  const lexer = new VLLexer(chars);

  const tokens = new CommonTokenStream(lexer);
  const parser = new VLParser(tokens);
  const ast = parser.program();

  try {
    return execute(ast, getDefaultGlobalScope());
  } catch (err) {
    console.log(ast.toStringTree(VLParser.ruleNames, parser));
    console.error(err);
  }
};

const ret = run(`
let foo = [5]
out(foo[0]++)
out(foo)
`);

if (ret) console.log(ret);
