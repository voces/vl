lexer grammar VL_Lexer;

// Keywords
FUNCTION : 'function';
IF       : 'if';
THEN     : 'then';
ELSE     : 'else';
ELSEIF   : 'elseif';
WHILE    : 'while';
FOR      : 'for';
TO       : 'to';
STEP     : 'step';
IN       : 'in';
CONST    : 'const';
LET      : 'let';
RETURN   : 'return';
AWAIT    : 'await';
BREAK    : 'break';
CONTINUE : 'continue';
NOT      : 'not';
FROM     : 'from';
TYPE     : 'type';

// Values
NUMBER   : [0-9]+ ('.' [0-9]+)?;
STRING   : '"' (~["\\] | '\\' .)* '"' | '\'' (~['\\] | '\\' .)* '\'';
TRUE     : 'true';
FALSE    : 'false';
NULL     : 'null';

// Math Operators
PLUS     : '+';
MINUS    : '-';
STAR     : '*';
DIV      : '/';
MOD      : '%';
CARET    : '^';
EQUAL    : '=';
PLUSPLUS : '++';
MINUSMINUS : '--';

// Logical Operators
AND      : '&&';
OR       : '||';
EXCLAMATION : '!';

// Comparison Operators
EQUAL_TO                 : '==';
GREATER_THAN             : '>';
GREATER_THAN_OR_EQUAL_TO : '>=';
LESS_THAN                : '<';
LESS_THAN_OR_EQUAL_TO    : '<=';

// Punctuation
LPAREN   : '(';
RPAREN   : ')';
LBRACE   : '{';
RBRACE   : '}';
LBRACK   : '[';
RBRACK   : ']';
COMMA    : ',';
DOT      : '.';
COLON    : ':';
PIPE     : '|';

// Other tokens
ID       : [a-zA-Z_][a-zA-Z_0-9]*;
NEWLINE  : '\r'? '\n';
WS       : [ \t]+ -> skip;
COMMENT  : '//' ~[\r\n]* -> skip;