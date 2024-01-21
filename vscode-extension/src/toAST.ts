import VL_Parser, {
  ExprContext,
  FunctionDeclContext,
  ObjectContext,
  ParamContext,
  ProgramContext,
  StatementContext,
  TypeContext,
  VarDeclContext,
} from "./antlr/VL_Parser.ts";

type VLParameterNode = {
  type: "Parameter";
  name: string;
  paramaterType: VLType | undefined;
};

type VLFunctionDeclarationNode = {
  type: "FunctionDeclaration";
  name: string | undefined;
  parameters: VLParameterNode[];
  body: VLStatementNode[];
  returnType: VLType | undefined;
};

type VLNameNode = {
  type: "Name";
  name: string;
};

type VLBlockNode = {
  type: "Block";
  label: string | undefined;
  statements: VLStatementNode[];
};

type VLStringLiteralNode = {
  type: "StringLiteral";
  value: string;
};

type VLNumberLiteralNode = {
  type: "NumberLiteral";
  value: number;
};

type VLPropertyNode = {
  type: "Property";
  name: VLNameNode | VLStringLiteralNode | VLExpressionNode;
};

type VLObjectLiteralNode = {
  type: "ObjectLiteral";
  properties: VLPropertyNode[];
};

type VLExpressionNode =
  | VLFunctionDeclarationNode
  | VLNameNode
  | VLBlockNode
  | VLObjectLiteralNode
  | VLStringLiteralNode
  | VLNumberLiteralNode;

type VLVariableDeclarationNode = {
  type: "VariableDeclaration";
  name: string;
  variableType: VLType | undefined;
  value: VLExpressionNode | undefined;
};

type VLReturnNode = {
  type: "Return";
  value: VLExpressionNode | undefined;
};

type VLStatementNode =
  | VLVariableDeclarationNode
  | VLReturnNode
  | VLExpressionNode;

type VLAliasType = { type: "Alias"; name: string };
type VLFunctionType = {
  type: "Function";
  paramaters: VLAliasType[];
  return: VLAliasType;
  exceptions: VLAliasType[];
};
type VLType =
  | VLAliasType
  | VLFunctionType
  | VLStringLiteralNode
  | VLNumberLiteralNode;

export type VLProgramNode = {
  type: "Program";
  statements: VLStatementNode[];
  locals: Record<string, VLType>;
  errors: string[];
};

const toVariableDeclaration = (ctx: VarDeclContext) => {
  const ids = ctx.ID_list();
  const expr = ctx.expr();
  const node: VLVariableDeclarationNode = {
    type: "VariableDeclaration",
    name: ids.length === 1 ? ids[0].getText() : ids[1].getText(),
    variableType: ids.length === 2
      ? { type: "Alias", name: ids[0].getText() }
      : undefined,
    value: expr ? toExpression(expr) : undefined,
  };
  return node;
};

const toParameter = (ctx: ParamContext): VLParameterNode => {
  const ids = ctx.ID_list();
  return {
    type: "Parameter",
    name: ids.length === 1 ? ids[0].getText() : ids[1].getText(),
    paramaterType: ids.length === 2
      ? { type: "Alias", name: ids[0].getText() }
      : undefined,
  };
};

const toType = (ctx: TypeContext): VLType => {
  {
    const id = ctx.ID();
    if (id) return { type: "Alias", name: id.getText() };
  }

  throw new Error(`toType not implemented ${ctx.getText()}`);
};

const toFunctionDeclaration = (ast: FunctionDeclContext) => {
  const statement = toStatement(ast.statement());
  const statements = statement.type === "Block"
    ? statement.statements
    : [statement];
  const returnType = ast.type_();
  const node: VLFunctionDeclarationNode = {
    type: "FunctionDeclaration",
    name: ast.ID()?.getText(),
    parameters: ast.params().param_list().map(toParameter),
    body: statements,
    returnType: returnType ? toType(returnType) : undefined,
  };
  return node;
};

const toObjectLiteral = (ctx: ObjectContext): VLObjectLiteralNode => {
  return {
    type: "ObjectLiteral",
    properties: ctx.pair_list().map((p) => {
      const id = p.ID();
      if (id) {
        const value = p.expr(0);
        return {
          type: "Property",
          name: { type: "Name", name: id.getText() },
          value: value
            ? toExpression(p.expr(0))
            : { type: "Name", name: id.getText() },
        };
      }
      const string = p.STRING();
      if (string) {
        return {
          type: "Property",
          name: { type: "StringLiteral", value: string.getText() },
          value: toExpression(p.expr(0)),
        };
      }
      return {
        type: "Property",
        name: toExpression(p.expr(0)),
        value: toExpression(p.expr(1)),
      };
    }),
  };
};

const toExpression = (ctx: ExprContext): VLExpressionNode => {
  {
    const funcDecl = ctx.functionDecl();
    if (funcDecl) return toFunctionDeclaration(funcDecl);
  }

  {
    const id = ctx.ID();
    if (id) return { type: "Name", name: id.getText() };
  }

  {
    const block = ctx.block();
    if (block) {
      return {
        type: "Block",
        label: ctx.ID()?.getText(),
        statements: block.blockStatement_list().map((b) => b.statement())
          .filter(Boolean).map(toStatement),
      };
    }
  }

  {
    const obj = ctx.object();
    if (obj) return toObjectLiteral(obj);
  }

  {
    const num = ctx.NUMBER();
    if (num) return { type: "NumberLiteral", value: parseFloat(num.getText()) };
  }

  {
    const string = ctx.STRING();
    if (string) {
      return { type: "StringLiteral", value: string.getText().slice(1, -1) };
    }
  }

  throw new Error(`toExpression not implemented ${ctx.getText()}`);
};

const toStatement = (ctx: StatementContext): VLStatementNode => {
  {
    const varDecl = ctx.varDecl();
    if (varDecl) return toVariableDeclaration(varDecl);
  }

  {
    const expr = ctx.expr();
    if (expr) return toExpression(expr);
  }

  {
    const rtrn = ctx.returnStatement();
    if (rtrn) {
      const expr = rtrn.expr();
      return { type: "Return", value: expr ? toExpression(expr) : undefined };
    }
  }

  const opts = {
    assignStatement: ctx.assignStatement() ? true : false,
    ifStatement: ctx.ifStatement() ? true : false,
    whileStatement: ctx.whileStatement() ? true : false,
    forStatement: ctx.forStatement() ? true : false,
    breakStatement: ctx.breakStatement() ? true : false,
    continueStatement: ctx.continueStatement() ? true : false,
    returnStatement: ctx.returnStatement() ? true : false,
    typeStatement: ctx.typeStatement() ? true : false,
  };

  throw new Error(
    `toStatement not implemented ${ctx.getText()} ${
      Object.entries(opts).filter(([, v]) => v).map(([n]) => n)
    }`,
  );
};

export const toAST = (cst: ProgramContext) => {
  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    locals: {},
    errors: [],
  };

  console.log(cst.toStringTree(VL_Parser.ruleNames, cst.parser!));

  for (const blkStmt of cst.blockStatement_list()) {
    const stmt = blkStmt.statement();
    if (stmt) {
      const stmtNode = toStatement(stmt);
      if (stmtNode.type === "FunctionDeclaration") {
        if (stmtNode.name) {
          program.locals[stmtNode.name] = {
            type: "Function",
            paramaters: [],
            return: { type: "Alias", name: "null" },
            exceptions: [],
          };
        }
      }
      program.statements.push(toStatement(stmt));
    }
  }

  return program;
};
