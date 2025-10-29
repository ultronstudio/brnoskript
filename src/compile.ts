import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import type { Stmt } from "./ast.js";

/**
 * compileSource: text → AST (Stmt[])
 * Žádná optimalizace – jen lex+parse.
 */
export function compileSource(source: string): Stmt[] {
  const toks = new Lexer(source).lex();
  const ast: Stmt[] = new Parser(toks).parse();
  return ast;
}