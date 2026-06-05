parser grammar VL_Parser;
options { tokenVocab=VL_Lexer; }

// Entry point
program : blockStatement* EOF;

blockStatement
    : statement NEWLINE*
    | NEWLINE+
    ;

statement
    : varDecl
    | whileStatement
    | forStatement
    | breakStatement
    | continueStatement
    | returnStatement
    | expr
    | typeStatement
    ;

functionDecl
    : FUNCTION ID? LPAREN params? RPAREN (COLON NEWLINE* type)? NEWLINE* statement
    ;

varDecl
    : CONST ID (COLON NEWLINE* type)? (NEWLINE* EQUAL NEWLINE* expr)?
    | LET ID (COLON NEWLINE* type)? (NEWLINE* EQUAL NEWLINE* expr)?
    ;

if
    : IF NEWLINE* expr NEWLINE* THEN? NEWLINE* statement
      (NEWLINE* elseIf)*
      (NEWLINE* else)?
    ;

elseIf
    : ELSEIF NEWLINE* expr NEWLINE* THEN? NEWLINE* statement
    ;

else
    : ELSE NEWLINE* statement
    ;

whileStatement
    : label? NEWLINE* WHILE NEWLINE* expr NEWLINE* statement
    ;

forStatement
    : label? NEWLINE* FOR NEWLINE* ID NEWLINE* IN NEWLINE* expr (NEWLINE* TO NEWLINE* expr (NEWLINE* STEP NEWLINE* expr)?)? NEWLINE* statement
    ;

breakStatement
    : BREAK ID?
    ;

continueStatement
    : CONTINUE ID?
    ;

returnStatement
    : RETURN expr?
    ;

expr
    : object
    | block
    | array
    | if
    // Member access (`.` / `[]`) binds tighter than arithmetic/comparison
    // operators, so these reads must precede them (ANTLR4 left-recursive
    // precedence = alternative order). Else `a.x + b.y` mis-parses as
    // `(a.x + b).y`.
    // Method/indirect call on a member: `o.f(args)`. Must precede the bare
    // property read so the call form (the longer match) wins; no ambiguity with
    // the ID-based functionCall, which has no DOT.
    | expr NEWLINE* DOT ID NEWLINE* LPAREN NEWLINE* args? RPAREN // member call
    | expr LBRACK NEWLINE* expr NEWLINE* RBRACK // index expr
    | expr NEWLINE* DOT ID // property expr
    | expr NEWLINE* CARET NEWLINE* expr
    // Unary minus: binds tighter than `* / %` and `+ -` (so `-a * b` = `(-a) * b`)
    // but looser than `^` (so `-a ^ b` = `-(a ^ b)`). A leading `-` (no left
    // operand) is unary; between two exprs it's the binary subtraction above.
    | MINUS NEWLINE* expr
    | expr NEWLINE* (STAR | DIV | MOD) NEWLINE* expr
    | expr NEWLINE* (PLUS | MINUS) NEWLINE* expr
    | expr NEWLINE* (GREATER_THAN | GREATER_THAN_OR_EQUAL_TO | LESS_THAN | LESS_THAN_OR_EQUAL_TO) NEWLINE* expr
    | expr NEWLINE* (EQUAL_TO | NOT_EQUAL_TO) NEWLINE* expr
    | expr NEWLINE* AND NEWLINE* expr
    | expr NEWLINE* OR NEWLINE* expr
    | ID NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr
    | expr NEWLINE* DOT ID NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr
    | expr LBRACK NEWLINE* expr NEWLINE* RBRACK NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr
    | LPAREN NEWLINE* expr NEWLINE* RPAREN
    | prefixOp expr
    | expr postfixOp
    | functionCall
    | functionDecl
    | NUMBER
    | STRING
    | TRUE
    | FALSE
    | NULL
    | ID
    ;

object
    : LBRACE NEWLINE* pair (NEWLINE* COMMA NEWLINE* pair)* NEWLINE* RBRACE
    | LBRACE NEWLINE* RBRACE
    ;

pair
    : (ID | STRING | LBRACK expr RBRACK) NEWLINE* COLON NEWLINE* expr
    | ID
    ;

array
    : LBRACK NEWLINE* expr (NEWLINE* COMMA NEWLINE* expr?)* RBRACK
    | LBRACK NEWLINE* RBRACK
    ;

functionCall
    : ID NEWLINE* LPAREN NEWLINE* args? RPAREN
    ;

params : param (NEWLINE* COMMA NEWLINE* param)* ;
param  : ID (COLON NEWLINE* type)? ;
args   : arg (NEWLINE* COMMA NEWLINE* arg)* ;
arg    : (ID COLON NEWLINE*)? expr;

prefixOp
    : NOT
    | EXCLAMATION
    | PLUSPLUS
    | MINUSMINUS
    ;

postfixOp
    : PLUSPLUS
    | MINUSMINUS
    ;

label
    : ID COLON
    ;

block : label? LBRACE NEWLINE* blockStatement* RBRACE
      ;

typeStatement
    : TYPE ID EQUAL type
    | TYPE ID
    ;

type
    : LPAREN NEWLINE* type NEWLINE* RPAREN
    | ID
    | NUMBER
    | TRUE
    | FALSE
    | STRING
    | NULL
    | objectType
    | type LBRACK RBRACK
    // | LBRACK NEWLINE* type (NEWLINE* COMMA type)* NEWLINE* RBRACK
    | type NEWLINE* PIPE NEWLINE* type
    ;

objectType
    : LBRACE RBRACE
    | LBRACE NEWLINE* pairType (NEWLINE* COMMA NEWLINE* pairType)* NEWLINE* RBRACE
    ;

pairType
    : (ID | STRING) NEWLINE* COLON NEWLINE* type
    | LBRACK NEWLINE* type NEWLINE* RBRACK NEWLINE* COLON NEWLINE* type
    ;
