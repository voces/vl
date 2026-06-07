import { Scope, VLObjectType, VLType, withScope } from "./toAST.ts";

const symmetricOps = (
  name: string,
  paramaterType: VLType,
): VLObjectType["properties"] => [{
  name: {
    type: "Union",
    subTypes: [
      { type: "StringLiteral", value: "-" },
      { type: "StringLiteral", value: "*" },
      { type: "StringLiteral", value: "/" },
      { type: "StringLiteral", value: "%" },
      { type: "StringLiteral", value: "+" },
      { type: "StringLiteral", value: "=" },
    ],
  },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name },
  },
}, {
  name: {
    type: "Union",
    subTypes: [
      { type: "StringLiteral", value: "!=" },
      { type: "StringLiteral", value: "<" },
      { type: "StringLiteral", value: "<=" },
      { type: "StringLiteral", value: "==" },
      { type: "StringLiteral", value: ">" },
      { type: "StringLiteral", value: ">=" },
    ],
  },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name: "boolean" },
  },
}];

// Bitwise / shift operator methods (`& | ^ << >> >>>`), defined ONLY on the
// integer types (i32/i64) — not on f32/f64, so a float operand (`1.0 & 2`) fails
// to find the operator method and is rejected. The result is the integer type
// itself, mirroring `+`/`%`. The unary `~` (bitwise NOT) is lowered in codegen
// as `xor -1` and never resolves through a method field, so it needs no entry.
const integerOps = (
  name: string,
  paramaterType: VLType,
): VLObjectType["properties"] => [{
  name: {
    type: "Union",
    subTypes: [
      { type: "StringLiteral", value: "&" },
      { type: "StringLiteral", value: "|" },
      { type: "StringLiteral", value: "^" },
      { type: "StringLiteral", value: "<<" },
      { type: "StringLiteral", value: ">>" },
      { type: "StringLiteral", value: ">>>" },
    ],
  },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name },
  },
}];

// deno-lint-ignore no-explicit-any
const namedFunc = <F extends (...args: any[]) => unknown>(
  name: string,
  fn: F,
) => {
  Object.defineProperty(fn, "toString", {
    value: () => name,
    enumerable: false,
  });
  return fn;
};

export const defaultScope = () => {
  // A builtin numeric/boolean accepts another object that is *nominally* the
  // same type (same `name`), not only the canonical scope object by reference.
  // Per-call-site type instantiation (monomorphization) clones and unifies
  // types, producing structural copies of e.g. `i32` that are no longer ===
  // the scope object; identity alone would then reject a value that is plainly
  // an i32. The `name` is set only on these builtins, so this stays precise.
  const isNominal = (right: VLType, name: string): boolean =>
    right.type === "Object" && right.name === name;
  const scope: Scope = {
    i32: {
      type: "Object",
      properties: [
        ...symmetricOps("i32", {
          type: "Custom",
          validate: namedFunc("i32", (right: VLType) =>
            right === scope.i32 || isNominal(right, "i32") ||
            right.type === "IntegerLiteral"),
          name: "i32",
        }),
        ...integerOps("i32", {
          type: "Custom",
          validate: namedFunc("i32", (right: VLType) =>
            right === scope.i32 || isNominal(right, "i32") ||
            right.type === "IntegerLiteral"),
          name: "i32",
        }),
      ],
      name: "i32",
    },
    i64: {
      type: "Object",
      properties: [
        ...symmetricOps("i64", {
          type: "Union",
          subTypes: [{ type: "Alias", name: "i32" }, {
            type: "Custom",
            validate: namedFunc(
              "i64",
              (right: VLType) =>
                right === scope.i64 || isNominal(right, "i64") ||
                right.type === "IntegerLiteral",
            ),
            name: "i64",
          }],
        }),
        ...integerOps("i64", {
          type: "Union",
          subTypes: [{ type: "Alias", name: "i32" }, {
            type: "Custom",
            validate: namedFunc(
              "i64",
              (right: VLType) =>
                right === scope.i64 || isNominal(right, "i64") ||
                right.type === "IntegerLiteral",
            ),
            name: "i64",
          }],
        }),
      ],
      name: "i64",
    },
    f32: {
      type: "Object",
      properties: symmetricOps("f32", {
        type: "Custom",
        validate: namedFunc("f32", (right: VLType) =>
          right === scope.f32 || isNominal(right, "f32") ||
          right.type === "IntegerLiteral" ||
          right.type === "RealLiteral"),
        name: "f32",
      }),
      name: "f32",
    },
    f64: {
      type: "Object",
      properties: symmetricOps("f64", {
        type: "Union",
        subTypes: [
          { type: "Alias", name: "i32" },
          { type: "Alias", name: "f32" },
          {
            type: "Custom",
            validate: namedFunc("f64", (right: VLType) =>
              right === scope.f64 || isNominal(right, "f64") ||
              right.type === "IntegerLiteral" ||
              right.type === "RealLiteral"),
            name: "f64",
          },
        ],
      }),
      name: "f64",
    },
    // A string is an `i32`-indexed collection of char codes — the index signature
    // gives it a WasmGC i32-array representation plus `.length` (array.len) and
    // `s[i]` (array.get) for free — with `+` (concat) and `=` operators. Operands
    // validate nominally (another string, or a string literal).
    string: {
      type: "Object",
      name: "string",
      properties: [
        { name: { type: "Alias", name: "i32" }, type: { type: "Alias", name: "i32" } },
        {
          name: {
            type: "Union",
            subTypes: [
              { type: "StringLiteral", value: "+" },
              { type: "StringLiteral", value: "=" },
            ],
          },
          type: {
            type: "Function",
            paramaters: [{
              type: "Parameter",
              name: "right",
              paramaterType: {
                type: "Custom",
                validate: namedFunc("string", (right: VLType) =>
                  right === scope.string || isNominal(right, "string") ||
                  right.type === "StringLiteral"),
                name: "string",
              },
            }],
            return: { type: "Alias", name: "string" },
          },
        },
        {
          name: {
            type: "Union",
            subTypes: [
              { type: "StringLiteral", value: "==" },
              { type: "StringLiteral", value: "!=" },
            ],
          },
          type: {
            type: "Function",
            paramaters: [{
              type: "Parameter",
              name: "right",
              paramaterType: {
                type: "Custom",
                validate: namedFunc("string", (right: VLType) =>
                  right === scope.string || isNominal(right, "string") ||
                  right.type === "StringLiteral"),
                name: "string",
              },
            }],
            return: { type: "Alias", name: "boolean" },
          },
        },
        // Richer string methods (ROADMAP A7). Declared as function-typed
        // properties so member-call dispatch resolves them through the normal
        // object machinery; toWasm lowers each by name. A `string` argument
        // validates nominally (another string or a string literal).
        {
          name: { type: "StringLiteral", value: "slice" },
          type: {
            type: "Function",
            paramaters: [
              {
                type: "Parameter",
                name: "start",
                paramaterType: { type: "Alias", name: "i32" },
              },
              {
                type: "Parameter",
                name: "end",
                paramaterType: { type: "Alias", name: "i32" },
              },
            ],
            return: { type: "Alias", name: "string" },
          },
        },
        {
          name: { type: "StringLiteral", value: "indexOf" },
          type: {
            type: "Function",
            paramaters: [{
              type: "Parameter",
              name: "sub",
              paramaterType: {
                type: "Custom",
                validate: namedFunc("string", (right: VLType) =>
                  right === scope.string || isNominal(right, "string") ||
                  right.type === "StringLiteral"),
                name: "string",
              },
            }],
            return: { type: "Alias", name: "i32" },
          },
        },
        {
          name: { type: "StringLiteral", value: "includes" },
          type: {
            type: "Function",
            paramaters: [{
              type: "Parameter",
              name: "sub",
              paramaterType: {
                type: "Custom",
                validate: namedFunc("string", (right: VLType) =>
                  right === scope.string || isNominal(right, "string") ||
                  right.type === "StringLiteral"),
                name: "string",
              },
            }],
            return: { type: "Alias", name: "boolean" },
          },
        },
        {
          name: { type: "StringLiteral", value: "charCodeAt" },
          type: {
            type: "Function",
            paramaters: [{
              type: "Parameter",
              name: "index",
              paramaterType: { type: "Alias", name: "i32" },
            }],
            return: { type: "Alias", name: "i32" },
          },
        },
      ],
    },
    boolean: {
      type: "Object",
      properties: [{
        name: {
          type: "Union",
          subTypes: [
            { type: "StringLiteral", value: "!=" },
            { type: "StringLiteral", value: "&&" },
            { type: "StringLiteral", value: "=" },
            { type: "StringLiteral", value: "==" },
            { type: "StringLiteral", value: "||" },
          ],
        },
        type: {
          type: "Function",
          paramaters: [{
            type: "Parameter",
            name: "right",
            paramaterType: {
              type: "Custom",
              validate: namedFunc(
                "boolean",
                (right: VLType) =>
                  right === scope.boolean || isNominal(right, "boolean") ||
                  right.type === "BooleanLiteral" ||
                  (right.type === "Alias" && right.name === "boolean"),
              ),
            },
          }],
          return: { type: "Alias", name: "boolean" },
        },
      }],
      name: "boolean",
    },
  };

  withScope(scope, () => {
    scope.__store_i32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    // Render `length` raw bytes at `address` as a string (pairs with
    // `__store_string__`).
    scope.__log_string__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "length",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    // Copy a string's char codes as bytes into linear memory at `address`,
    // returning the byte length — bridges a GC string to `__log_string__`.
    scope.__store_string__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "string" },
      }],
      return: { type: "Alias", name: "i32" },
    };

    scope.__load_i32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "i32" },
    };

    scope.__store_i64__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "i64" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__store_f32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "f32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__store_f64__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "f64" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__memory_grow__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "pages",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: {
        // TODO: Should instead return null and be throwable
        type: "Union",
        subTypes: [
          { type: "IntegerLiteral", value: 0, text: "0" },
          { type: "IntegerLiteral", value: 1, text: "1" },
        ],
      },
    };

    scope.__memory_size__ = {
      type: "Function",
      paramaters: [],
      return: { type: "Alias", name: "i32" },
    };

    scope.__log__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "length",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    // `Map()` / `Set()`: builtin constructors for the hash collections (B6a).
    // Construction spelling is PROVISIONAL (uncommitted, mirroring how List's
    // construction is uncommitted) — a no-arg builtin call whose result type is
    // pinned from the binding's annotation (`let m: {[string]: i32} = Map()`),
    // exactly like an empty `[]` takes its element type from the desired type.
    // The return is a fresh inference hole; `ensureType` against the annotation
    // resolves it to the concrete `{[K]:V}` map type. toWasm lowers the call to
    // an empty-map allocation by name.
    scope.Map = {
      type: "Function",
      paramaters: [],
      return: { type: "Infer", subType: { type: "Unknown" } },
    };
    scope.Set = {
      type: "Function",
      paramaters: [],
      return: { type: "Infer", subType: { type: "Unknown" } },
    };

    // `print(value)`: a built-in that logs a value of any printable type. The
    // parameter accepts anything (codegen in toWasm dispatches on the argument's
    // type to a type-specific host sink); supported today are numerics, boolean,
    // and string.
    scope.print = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Custom", validate: namedFunc("any", () => true) },
      }],
      return: { type: "Alias", name: "null" },
    };

    // `toString(x): string` — render a number/boolean as a VL string (a WasmGC
    // i32-array of char codes) for diagnostics/output in the self-hosted
    // compiler (H2). Accepts an i32 (signed decimal, handling negatives and 0)
    // or a boolean (`"true"`/`"false"`); an integer/boolean literal validates
    // too. f64 stringification is a deliberate follow-up (not wired). toWasm
    // lowers the call by name to a lazily-emitted itoa helper.
    scope["toString"] = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "value",
        paramaterType: {
          type: "Custom",
          validate: namedFunc(
            "i32 | boolean",
            (right: VLType) =>
              right === scope.i32 || isNominal(right, "i32") ||
              right === scope.boolean || isNominal(right, "boolean") ||
              right.type === "IntegerLiteral" ||
              right.type === "BooleanLiteral" ||
              (right.type === "Alias" &&
                (right.name === "i32" || right.name === "boolean")),
          ),
        },
      }],
      return: { type: "Alias", name: "string" },
    };

    // `fromCodePoint(code: i32): string` — construct a single-character VL string
    // from a Unicode code point. A VL string is a WasmGC i32-array of code points,
    // so this allocates a length-1 array holding `code`. Bootstrap-critical for the
    // self-hosted lexer, which must materialize the value of a decoded `\xXX` /
    // `\uXXXX`/`\u{…}` escape. Named for the actual number scheme (each element is a
    // Unicode code point), unlike JS's UTF-16-code-unit `fromCharCode`. Mirrors
    // `toString`: an i32 (or integer literal) is accepted, and toWasm lowers the
    // call by name to an inline length-1 array.
    scope["fromCodePoint"] = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "code",
        paramaterType: {
          type: "Custom",
          validate: namedFunc(
            "i32",
            (right: VLType) =>
              right === scope.i32 || isNominal(right, "i32") ||
              right.type === "IntegerLiteral" ||
              (right.type === "Alias" && right.name === "i32"),
          ),
        },
      }],
      return: { type: "Alias", name: "string" },
    };
  });

  return scope;
};
