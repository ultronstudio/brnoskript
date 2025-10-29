// Barrel + compile hook, aby runtime mohl přivolat parser/lexer při 'vokno'

import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
export { Lexer } from "./lexer.js";
export { Parser } from "./parser.js";
export { Interpreter } from "./runtime.js";
export * from "./tokens.js";
export * from "./ast.js";

/** CLI musí zavolat tohle hned po vytvoření Interpreteru.
 *  Hook uloží funkci na globalThis, runtime si ji pak vytáhne.
 */
export function __setCompileHook(): void {
  (globalThis as any).__brno_compile = (src: string) => {
    const toks = new Lexer(src).lex();
    return new Parser(toks).parse();
  };
}
