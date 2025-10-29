import { T } from "./tokens.js";

export type Expr =
  | { k: "Lit"; v: any }
  | { k: "Var"; n: string }
  | { k: "Assign"; n: string; v: Expr }
  | { k: "Unary"; op: T; r: Expr }
  | { k: "Binary"; l: Expr; op: T; r: Expr }
  | { k: "Call"; callee: Expr; args: Expr[] }
  | { k: "Postfix"; n: string; op: T }      // x++ / x--
  | { k: "Get"; obj: Expr; name: string }   // obj.name
  ;

export type Stmt =
  | { k: "ExprS"; e: Expr }
  | { k: "Let"; n: string; init?: Expr }
  | { k: "Block"; body: Stmt[] }
  | { k: "If"; c: Expr; t: Stmt; e?: Stmt }
  | { k: "While"; c: Expr; b: Stmt }
  | { k: "Fun"; n: string; params: string[]; body: Stmt[] }
  | { k: "Return"; v?: Expr }
  | { k: "Import"; path: Expr }
  | { k: "Try"; body: Stmt[]; id?: string; handler?: Stmt[]; fin?: Stmt[] }
  | { k: "Break" }
  | { k: "Continue" }
  | { k: "ForDesugared"; init?: Stmt; cond?: Expr; step?: Expr; body: Stmt }
  ;
