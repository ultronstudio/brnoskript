#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { Interpreter, ModuleLoader } from "./runtime.js";
import { __setCompileHook } from "./index.js";

/* --- loader pro 'vokno' --- */
const moduleLoader: ModuleLoader = async (p: string) => {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return fs.readFileSync(abs, "utf8");
};

/* --- compile bridge pro import --- */
function compileSource(src: string) {
  const toks = new Lexer(src).lex();
  const ast = new Parser(toks).parse();
  return ast;
}

async function runSource(interp: Interpreter, src: string) {
  const program = compileSource(src);
  await interp.run(program);
}

async function runFile(interp: Interpreter, filePath: string) {
  const src = fs.readFileSync(filePath, "utf8");
  await runSource(interp, src);
}

async function repl(interp: Interpreter) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "brn> " });
  let buf = "";
  rl.prompt();
  for await (const line of rl) {
    buf += line + "\n";
    if (/\bpiča\s*$/.test(line) || /\}\s*$/.test(line)) {
      try { await runSource(interp, buf); }
      catch (e: any) { console.error(e?.message ?? String(e)); }
      buf = "";
    }
    rl.prompt();
  }
}

/* --- argv & start --- */
const args = process.argv.slice(2);
const fsEnabled = args.includes("--unsafe-fs");
const file = args.find(a => !a.startsWith("--"));

const interp = new Interpreter(moduleLoader, { fsEnabled });

// injekce compile hooku pro runtime Import
__setCompileHook();

if (file) await runFile(interp, file);
else await repl(interp);
