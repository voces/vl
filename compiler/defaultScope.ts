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
      properties: symmetricOps("i32", {
        type: "Custom",
        validate: namedFunc("i32", (right: VLType) =>
          right === scope.i32 || isNominal(right, "i32") ||
          right.type === "IntegerLiteral"),
        name: "i32",
      }),
      name: "i32",
    },
    i64: {
      type: "Object",
      properties: symmetricOps("i64", {
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
  });

  return scope;
};
