// Public facade for the compiler front end.
//
// Historically this module was the antlr CST → AST walker. The hand-written
// lexer (`lexer.ts`) + parser (`parser.ts`) now emit the typed AST directly, so
// the CST-walking half is gone; the type-checking half lives in `typecheck.ts`.
// This file remains as the stable import surface (`./toAST.ts`) that the rest of
// the compiler — notably `toWasm.ts` — depends on: it re-exports the AST types,
// the shared `withScope`, the type-algebra entry points, and the parser.
export * from "./ast.ts";
export { withScope } from "./state.ts";
export {
  arrayElementType,
  conditionNarrowing,
  defaultIntegerType,
  distinctScalars,
  elseNarrowings,
  getConcreteType,
  nonNullable,
  placeKey,
  postGuardNarrowings,
  setNodeType,
  softenImplicitType,
  thenNarrowings,
  validateParameters,
  validateType,
  vlType,
} from "./typecheck.ts";
export { parseProgram } from "./parser.ts";
