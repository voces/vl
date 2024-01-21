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
    | assignStatement
    | ifStatement
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
    : CONST type? ID (NEWLINE* EQUAL NEWLINE* expr)?
    | LET type? ID (NEWLINE* EQUAL NEWLINE* expr)?
    ;

ifStatement
    : IF NEWLINE* expr NEWLINE* THEN? NEWLINE* statement
      (NEWLINE* elseIfStatement)*
      (NEWLINE* elseStatement)?
    ;

elseIfStatement
    : ELSEIF NEWLINE* expr NEWLINE* THEN? NEWLINE* statement
    ;

elseStatement
    : ELSE NEWLINE* statement
    ;

whileStatement
    : label? NEWLINE* WHILE NEWLINE* expr NEWLINE* statement
    ;

forStatement
    : label? NEWLINE* FOR NEWLINE* ID NEWLINE* IN NEWLINE* expr NEWLINE* TO NEWLINE* expr (NEWLINE* STEP NEWLINE* expr)? NEWLINE* statement
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
    : NUMBER
    | STRING
    | TRUE
    | FALSE
    | NULL
    | object
    | block
    | array
    | LPAREN NEWLINE* expr NEWLINE* RPAREN
    | expr LBRACK NEWLINE* expr NEWLINE* RBRACK // index expr
    | expr NEWLINE* DOT ID // property expr
    | prefixOp expr
    | expr postfixOp
    | expr NEWLINE* binaryOp NEWLINE* expr
    | functionCall
    | functionDecl
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

assignStatement
    : ID NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr // TODO: ID should be expr
    | expr NEWLINE* DOT ID NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr // TODO: ID should be expr
    | expr LBRACK NEWLINE* expr NEWLINE* RBRACK NEWLINE* (PLUS | MINUS | STAR | DIV | MOD | CARET | EXCLAMATION)? EQUAL NEWLINE* expr
    ;

functionCall
    : ID NEWLINE* LPAREN NEWLINE* args? RPAREN
    ;

params : param (NEWLINE* COMMA NEWLINE* param)* ;
param  : type? ID ;
args   : expr (NEWLINE* COMMA NEWLINE* expr)* ;

binaryOp
    : PLUS | MINUS | STAR | DIV | MOD | CARET | AND | OR | GREATER_THAN | GREATER_THAN_OR_EQUAL_TO | LESS_THAN | LESS_THAN_OR_EQUAL_TO | EQUAL_TO
    ;

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

block : label? LBRACE NEWLINE blockStatement* NEWLINE RBRACE
      | label? LBRACE NEWLINE RBRACE
      ;

typeStatement : TYPE EQUAL type ;

type
    : ID
    | NUMBER
    | TRUE
    | FALSE
    | STRING
    | NULL
    | objectType
    | type RBRACK LBRACK
    | RBRACE NEWLINE* type (NEWLINE* COMMA type)* NEWLINE* LBRACE
    ;

objectType
    : LBRACE RBRACE
    | LBRACE NEWLINE* pairType (NEWLINE* COMMA NEWLINE* pairType)* NEWLINE* RBRACE
    ;

pairType : (ID | STRING) NEWLINE* COLON NEWLINE* type ;
