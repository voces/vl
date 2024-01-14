import { ParseTree, TerminalNode, Token } from "antlr4";
import VLLexer from "./antlr/VL_Lexer.ts";
import VLParser, {
  ArrayContext,
  AssignStatementContext,
  BlockContext,
  BreakStatementContext,
  ContinueStatementContext,
  ExprContext,
  ForStatementContext,
  FunctionCallContext,
  FunctionDeclContext,
  IfStatementContext,
  ObjectContext,
  ProgramContext,
  ReturnStatementContext,
  StatementContext,
  VarDeclContext,
  WhileStatementContext,
} from "./antlr/VL_Parser.ts";

const assertNumber = (value: unknown) => {
  if (typeof value !== "number") {
    throw new Error(`Expected number, got ${typeof value} (${value})`);
  }
  return value;
};

const resolveValue = (scopes: Record<string, unknown>[], name: string) => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i][name];
  }
  throw new ReferenceError(`${name} is not defined`);
};

const resolveScope = (scopes: Record<string, unknown>[], name: string) => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i];
  }
  throw new ReferenceError(`${name} is not defined`);
};

const internalExecute = (
  cur: ParseTree,
  scopes: Record<string, unknown>[],
  flags: {
    returning: number;
    breaking: string | boolean;
    continuing: string | boolean;
  },
): unknown => {
  const nest = (node: ParseTree, _scopes = scopes, _flags = flags) => {
    // if (!(node instanceof TerminalNode)) {
    //   console.log(node?.constructor.name, node?.getText());
    // }
    return internalExecute(node, _scopes, _flags);
  };

  if (cur instanceof ProgramContext || cur instanceof BlockContext) {
    const label = cur instanceof BlockContext
      ? cur.label()?.ID().getText()
      : undefined;
    scopes = [...scopes, {}];
    let last;
    for (const child of cur.blockStatement_list()) {
      if (!child.statement()) continue;
      last = nest(child.statement());
      if (flags.returning) return last ?? null;
      if (flags.continuing) return null;
      if (flags.breaking) {
        if (label && flags.breaking === label) flags.breaking = false;
        return null;
      }
    }
    return last ?? null;
  }

  if (cur instanceof StatementContext) {
    if (cur.children) return nest(cur.children[0]) ?? null;
    return null;
  }

  if (cur instanceof IfStatementContext) {
    const value = nest(cur.expr());
    if (value !== false && value != null) return nest(cur.statement());
    const elses = cur.elseIfStatement_list();
    for (const cur of elses) {
      const value = nest(cur.expr());
      if (value !== false && value != null) return nest(cur.statement());
    }
    const elseStatement = cur.elseStatement();
    if (elseStatement) return nest(elseStatement.statement());
    return null;
  }

  if (cur instanceof ForStatementContext) {
    const label = cur.label()?.ID().getText();
    const name = cur.ID().getText();
    const [from, to, step] = cur.expr_list();
    const innerScope = { [name]: nest(from) };
    scopes = [...scopes, innerScope];
    const toValue = nest(to);
    if (typeof toValue !== "number") {
      throw new Error(`Expected to to be a number, got ${to} (${typeof to})`);
    }
    const statement = cur.statement();
    let result;
    while (assertNumber(innerScope[name]) <= toValue) {
      result = nest(statement, scopes);
      if (flags.breaking) {
        if (typeof flags.breaking === "string") {
          if (flags.breaking === label) flags.breaking = false;
        } else flags.breaking = false;
        return null;
      }
      if (flags.continuing) {
        if (typeof flags.continuing === "string") {
          if (flags.continuing === label) flags.continuing = false;
          else return null;
        } else flags.continuing = false;
      }
      if (step) {
        const constant = step.NUMBER();
        if (constant) {
          innerScope[name] = (innerScope[name] as number) +
            parseFloat(constant.getText());
        } else innerScope[name] = nest(statement, scopes);
      } else innerScope[name] = (innerScope[name] as number) + 1;
    }
    return result ?? null;
  }

  if (cur instanceof WhileStatementContext) {
    const label = cur.label()?.ID().getText();
    const condition = cur.expr();
    const statement = cur.statement();
    let result;
    while (nest(condition)) {
      result = nest(statement);
      if (flags.breaking) {
        if (typeof flags.breaking === "string") {
          if (flags.breaking === label) flags.breaking = false;
        } else flags.breaking = false;
        return null;
      }
      if (flags.continuing) {
        if (typeof flags.continuing === "string") {
          if (flags.continuing === label) flags.continuing = false;
          else return null;
        } else flags.continuing = false;
      }
    }
    return result ?? null;
  }

  if (cur instanceof ReturnStatementContext) {
    const expr = cur.expr();
    if (expr) {
      const val = nest(expr);
      flags.returning++;
      return val;
    }
    flags.returning++;
    return null;
  }

  if (cur instanceof BreakStatementContext) {
    flags.breaking = cur.ID()?.getText() ?? true;
    return null;
  }

  if (cur instanceof ContinueStatementContext) {
    flags.continuing = cur.ID()?.getText() ?? true;
    return null;
  }

  if (cur instanceof VarDeclContext) {
    const init = cur.expr();
    const ids = cur.ID_list();
    const name = ids[ids.length - 1].getText();
    return scopes[scopes.length - 1][name] = init ? nest(init) ?? null : null;
  }

  if (cur instanceof AssignStatementContext) {
    let host:
      | Record<string | number, unknown>
      | Map<unknown, unknown>;
    let key: unknown;
    let value: unknown;
    if (cur.DOT()) {
      host = nest(cur.expr(0)) as
        | Record<string | number, unknown>
        | Map<unknown, unknown>;
      key = cur.ID().getText();
      value = nest(cur.expr(1));
    } else if (cur.LBRACK()) {
      host = nest(cur.expr(0)) as
        | Record<string | number, unknown>
        | Map<unknown, unknown>;
      key = nest(cur.expr(1));
      value = nest(cur.expr(2));
    } else {
      key = cur.ID().getText();
      host = resolveScope(scopes, key as string) as Record<string, unknown>;
      value = nest(cur.expr(0));
    }

    const get = <T>(): T =>
      (host instanceof Map ? host.get(key) : host[key as string]) as T;
    const set = (value: unknown) => {
      if (host instanceof Map) {
        host.set(key, value);
        return value;
      }
      return host[key as string] = value;
    };

    if (cur.PLUS()) return set(get<number>() + (value as number));
    if (cur.MINUS()) return set(get<number>() - (value as number));
    if (cur.STAR()) return set(get<number>() * (value as number));
    if (cur.DIV()) return set(get<number>() / (value as number));
    if (cur.MOD()) return set(get<number>() % (value as number));
    if (cur.CARET()) return set(get<number>() ** (value as number));
    return set(value);
  }

  if (cur instanceof FunctionDeclContext) {
    const name = cur.ID()?.getText();
    const params = cur.params()?.param_list().map((p) => {
      let [type, name] = p.ID_list() as [
        TerminalNode | undefined,
        TerminalNode | undefined,
      ];
      if (!name) [type, name] = [undefined, type];
      const param: { name: string; type?: string } = { name: name!.getText() };
      if (type) param.type = type.getText();
      return param;
    }) ?? [];
    const body = cur.statement();
    const func = (...args: unknown[]) =>
      nest(body, [
        ...scopes,
        Object.fromEntries(params.map((p, i) => [p.name, args[i]])),
      ]);
    if (name) scopes[scopes.length - 1][name] = func;
    return func;
  }

  if (cur instanceof ExprContext) {
    if (cur.children && cur.children.length === 1) {
      return nest(cur.children![0]) ?? null;
    }

    // ( expr )
    if (cur.LPAREN()) return nest(cur.children![1]) ?? null;

    // expr [ expr ]
    if (cur.LBRACK()) {
      const host = nest(cur.expr(0));
      const key = nest(cur.expr(1));
      if (typeof key === "number" && Array.isArray(host)) {
        return host[key] ?? null;
      }
      if (host instanceof Map) return host.get(key) ?? null;
      throw new Error(`Unsure how to access "${key}" on ${host}`);
    }

    // expr . expr
    if (cur.DOT()) {
      const host = nest(cur.expr(0));
      const key = cur.ID().getText();
      if (host instanceof Map) return host.get(key) ?? null;
      throw new Error(`Unsure how to access "${key}" on ${host}`);
    }

    // expr op expr
    const binOp = cur.binaryOp();
    if (binOp) {
      const [left, right] = cur.expr_list();
      const leftValue = nest(left);
      const rightValue = nest(right);

      if (binOp.PLUS()) return (leftValue as number) + (rightValue as number);
      if (binOp.MINUS()) return (leftValue as number) - (rightValue as number);
      if (binOp.STAR()) return (leftValue as number) * (rightValue as number);
      if (binOp.DIV()) return (leftValue as number) / (rightValue as number);
      if (binOp.MOD()) return (leftValue as number) % (rightValue as number);
      if (binOp.CARET()) return (leftValue as number) ** (rightValue as number);
      if (binOp.AND()) return (leftValue as boolean) && (rightValue as boolean);
      if (binOp.OR()) return (leftValue as boolean) || (rightValue as boolean);
      if (binOp.EQUAL_TO()) {
        return (leftValue as number) === (rightValue as number);
      }
      if (binOp.GREATER_THAN()) {
        return (leftValue as number) > (rightValue as number);
      }
      if (binOp.GREATER_THAN_OR_EQUAL_TO()) {
        return (leftValue as number) >= (rightValue as number);
      }
      if (binOp.LESS_THAN()) {
        return (leftValue as number) < (rightValue as number);
      }
      if (binOp.LESS_THAN_OR_EQUAL_TO()) {
        return (leftValue as number) <= (rightValue as number);
      }

      throw new Error(`Unhandled binary operator ${binOp.getText()}`);
    }

    // op expr
    const prefixOp = cur.prefixOp();
    if (prefixOp) {
      const expr = cur.expr(0);
      const value = nest(expr);
      if (prefixOp.NOT() || prefixOp.EXCLAMATION()) {
        if (typeof value === "boolean" || value == null) return !value;
        return false;
      }

      if (prefixOp.MINUSMINUS() || prefixOp.PLUSPLUS()) {
        let host:
          | Record<string | number, unknown>
          | Map<unknown, unknown>;
        let key: unknown;
        const expr = cur.expr(0);
        if (expr.DOT()) {
          host = nest(expr.expr(0)) as
            | Record<string | number, unknown>
            | Map<unknown, unknown>;
          key = expr.ID().getText();
        } else if (expr.LBRACK()) {
          host = nest(expr.expr(0)) as
            | Record<string | number, unknown>
            | Map<unknown, unknown>;
          key = nest(expr.expr(1));
        } else if (expr.ID()) {
          key = expr.ID().getText();
          host = resolveScope(scopes, key as string) as Record<string, unknown>;
        } else throw new Error("Expected ID, property, or index");

        const adjustment = prefixOp.MINUSMINUS() ? -1 : 1;

        if (host instanceof Map) {
          const before = host.get(key);
          const after = (before as number) + adjustment;
          host.set(key, after);
          return after;
        } else {
          return host[key as string | number] =
            host[key as string | number] as number + adjustment;
        }
      }

      throw new Error(`Unhandled prefix subtype ${prefixOp.getText()}`);
    }

    // expr op
    const postfixOp = cur.postfixOp();
    if (postfixOp) {
      let host:
        | Record<string | number, unknown>
        | Map<unknown, unknown>;
      let key: unknown;
      const expr = cur.expr(0);
      if (expr.DOT()) {
        host = nest(expr.expr(0)) as
          | Record<string | number, unknown>
          | Map<unknown, unknown>;
        key = expr.ID().getText();
      } else if (expr.LBRACK()) {
        host = nest(expr.expr(0)) as
          | Record<string | number, unknown>
          | Map<unknown, unknown>;
        key = nest(expr.expr(1));
      } else if (expr.ID()) {
        key = expr.ID().getText();
        host = resolveScope(scopes, key as string) as Record<string, unknown>;
      } else throw new Error("Expected ID, property, or index");

      const adjustment = postfixOp.MINUSMINUS() ? -1 : 1;

      if (host instanceof Map) {
        const before = host.get(key);
        const after = (before as number) + adjustment;
        host.set(key, after);
        return before;
      } else {
        const before = host[key as string | number];
        host[key as string | number] = before as number + adjustment;
        return before;
      }
    }

    throw new Error(`Unhandled ExprContext subtype ${cur.getText()}`);
  }

  if (cur instanceof FunctionCallContext) {
    const name = cur.ID().getText();
    const func = resolveValue(scopes, name);
    if (typeof func !== "function") {
      throw new TypeError(`${name} is not a function`);
    }

    const raw = cur.args();
    const args = raw ? raw.expr_list().map((arg) => nest(arg)) : [];

    const returning = flags.returning;
    const result = func(...args) ?? null;
    if (flags.returning === returning + 1) flags.returning--;
    return result;
  }

  if (cur instanceof ObjectContext) {
    const obj = new Map();
    for (const itm of cur.pair_list()) {
      if (itm.COLON()) {
        if (itm.LBRACK()) {
          obj.set(nest(itm.expr(0)), nest(itm.expr(1)));
        } else if (itm.STRING()) {
          obj.set(itm.STRING().getText().slice(1, -1), nest(itm.expr(0)));
        } else {
          obj.set(itm.ID().getText(), nest(itm.expr(0)));
        }
      } else {
        const key = itm.ID().getText();
        obj.set(key, resolveValue(scopes, key));
      }
    }
    return obj;
  }

  if (cur instanceof ArrayContext) {
    const arr = [];
    let i = 0;
    for (const itm of cur.children!) {
      if (itm instanceof ExprContext) arr[i] = nest(itm);
      if (itm instanceof TerminalNode && itm.symbol.type === VLLexer.COMMA) i++;
    }
    return arr;
  }

  if (cur instanceof TerminalNode) {
    try {
      if (cur.symbol.type === VLLexer.NUMBER) return parseFloat(cur.getText());
    } catch (err) {
      debugger;
      throw err;
    }
    if (cur.symbol.type === VLLexer.STRING) return cur.getText().slice(1, -1);
    if (cur.symbol.type === VLLexer.TRUE) return true;
    if (cur.symbol.type === VLLexer.FALSE) return false;
    if (cur.symbol.type === VLLexer.NULL) return null;
    if (cur.symbol.type === VLLexer.ID) {
      return resolveValue(scopes, cur.getText()) ?? null;
    }

    throw new Error(
      `Unhandled terminal node ${
        VLLexer.ruleNames[cur.symbol.type - 1]
      } (${cur.symbol.text})`,
    );
  }

  throw new Error(`Unhandled node ${cur?.constructor.name} (${cur})`);
};

export const execute = (node: ParseTree, scope?: Record<string, unknown>) =>
  internalExecute(node, [scope ?? {}], {
    returning: 0,
    breaking: false,
    continuing: false,
  });
