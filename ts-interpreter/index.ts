import { CharStream, CommonTokenStream } from "antlr4";
import VLLexer from "./antlr/VL_Lexer.ts";
import VLParser, { ProgramContext } from "./antlr/VL_Parser.ts";
import { execute } from "./execute.ts";

const getDefaultGlobalScope = () => ({
  out: console.log,
  err: console.error,
  now: () => performance.now(),
});

export const parse = (code: string) => {
  const chars = new CharStream(code);
  const lexer = new VLLexer(chars);

  const tokens = new CommonTokenStream(lexer);
  const parser = new VLParser(tokens);
  return parser.program();
};

export const run = (
  code: string | ProgramContext,
  scope: Record<string, unknown> = getDefaultGlobalScope(),
) => execute(typeof code === "string" ? parse(code) : code, scope);
