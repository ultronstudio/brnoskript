import { T, Tok } from "./tokens.js";
import { Expr, Stmt } from "./ast.js";

export class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  parse(): Stmt[] {
    const out: Stmt[] = [];
    while (!this.is(T.EOF)) out.push(this.decl());
    return out;
  }

  /* -------- Declarations / Top-level -------- */
  private decl(): Stmt {
    if (this.try(T.NECH)) return this.letDecl();
    if (this.try(T.ROB))  return this.fnDecl();
    return this.stmt();
  }

  private letDecl(): Stmt {
    const name = this.expect(T.Identifier, "Čekám jméno proměnné").lit as string;
    let init: Expr | undefined;
    if (this.try(T.Eq)) init = this.expr();
    this.expect(T.PICA, "Čekám terminátor 'piča'");
    return { k: "Let", n: name, init };
  }

  private fnDecl(): Stmt {
    const name = this.expect(T.Identifier, "Čekám jméno funkce").lit as string;
    this.expect(T.LParen, "Čekám '('");
    const params: string[] = [];
    if (!this.is(T.RParen)) {
      do { params.push(this.expect(T.Identifier, "Čekám jméno parametru").lit as string); }
      while (this.try(T.Comma));
    }
    this.expect(T.RParen, "Čekám ')'");
    this.expect(T.LBrace, "Čekám '{' za deklarací funkce");
    const body = this.block().body;
    return { k: "Fun", n: name, params, body };
  }

  /* -------- Statements -------- */
  private stmt(): Stmt {
    if (this.try(T.LBrace)) return this.block();
    if (this.try(T.ESLI))   return this.ifStmt();
    if (this.try(T.SALINA)) return this.whileStmt();
    if (this.try(T.OKRUH))  return this.forStmt();
    if (this.try(T.VRAT))   return this.returnStmt();
    if (this.try(T.VYBLIJ)) return this.vyblijStmt();
    if (this.try(T.VOKNO))  return this.importStmt();
    if (this.try(T.ZKUS))   return this.tryStmt();
    if (this.try(T.VYPADNI)) { this.expect(T.PICA, "Čekám 'piča'"); return { k: "Break" }; }
    if (this.try(T.PRESKOC)) { this.expect(T.PICA, "Čekám 'piča'"); return { k: "Continue" }; }

    return this.exprStmt();
  }

  private block(): { k: "Block"; body: Stmt[] } {
    const body: Stmt[] = [];
    while (!this.is(T.RBrace) && !this.is(T.EOF)) body.push(this.decl());
    this.expect(T.RBrace, "Čekám '}'");
    return { k: "Block", body };
  }

  private ifStmt(): Stmt {
    this.expect(T.LParen, "Čekám '(' za 'esli'");
    const c = this.expr();
    this.expect(T.RParen, "Čekám ')'");
    const t = this.stmt();
    let e: Stmt | undefined;
    if (this.try(T.INAK)) e = this.stmt();
    return { k: "If", c, t, e };
  }

  private whileStmt(): Stmt {
    this.expect(T.LParen, "Čekám '(' za 'šalina'");
    const c = this.expr();
    this.expect(T.RParen, "Čekám ')'");
    const b = this.stmt();
    return { k: "While", c, b };
  }

  // okruh ( init piča; cond piča; step ) { body }
  private forStmt(): Stmt {
    this.expect(T.LParen, "Čekám '(' za 'okruh'");

    let init: Stmt | undefined;
    if (this.try(T.NECH)) init = this.letDecl();
    else if (!this.is(T.PICA)) init = this.exprStmtExpectingPica();
    else this.expect(T.PICA, "Čekám 'piča' po init části");

    let cond: Expr | undefined;
    if (!this.is(T.PICA)) cond = this.expr();
    this.expect(T.PICA, "Čekám 'piča' po cond části");

    let step: Expr | undefined;
    if (!this.is(T.RParen)) step = this.expr();
    this.expect(T.RParen, "Čekám ')'");
    const body = this.stmt();
    return { k: "ForDesugared", init, cond, step, body };
  }

  private returnStmt(): Stmt {
    let v: Expr | undefined;
    if (!this.is(T.PICA)) v = this.expr();
    this.expect(T.PICA, "Čekám 'piča' za 'vrat'");
    return { k: "Return", v };
  }

  private vyblijStmt(): Stmt {
    this.expect(T.LParen, "Čekám '(' za 'vyblij'");
    const arg = this.expr();
    this.expect(T.RParen, "Čekám ')'");
    this.expect(T.PICA, "Čekám 'piča'");
    return { k: "ExprS", e: { k: "Call", callee: { k: "Var", n: "vyblij" }, args: [arg] } };
  }

  private importStmt(): Stmt {
    const path =
      this.is(T.String) ? (this.advance(), { k: "Lit", v: this.prev().lit } as Expr) :
      this.expr();
    this.expect(T.PICA, "Čekám 'piča' po 'vokno'");
    return { k: "Import", path };
  }

  private tryStmt(): Stmt {
    this.expect(T.LBrace, "Čekám '{' po 'zkus'");
    const body = this.block().body;

    let id: string | undefined;
    let handler: Stmt[] | undefined;
    let fin: Stmt[] | undefined;

    if (this.try(T.CHYT)) {
      this.expect(T.LParen, "Čekám '(' po 'chyť'");
      if (this.is(T.Identifier)) { id = this.advance().lit as string; }
      this.expect(T.RParen, "Čekám ')'");
      this.expect(T.LBrace, "Čekám '{' po 'chyť(...)'");
      handler = this.block().body;
    }

    if (this.try(T.POTOM)) {
      this.expect(T.LBrace, "Čekám '{' po 'potom'");
      fin = this.block().body;
    }

    return { k: "Try", body, id, handler, fin };
  }

  private exprStmt(): Stmt {
    const e = this.expr();
    this.expect(T.PICA, "Čekám 'piča' na konci výrazu");
    return { k: "ExprS", e };
  }
  private exprStmtExpectingPica(): Stmt {
    const e = this.expr();
    this.expect(T.PICA, "Čekám 'piča'");
    return { k: "ExprS", e };
  }

  /* -------- Expressions (Pratt) -------- */
  private expr(): Expr { return this.assignment(); }

  private assignment(): Expr {
    const left = this.nullish();
    if (this.try(T.Eq) || this.try(T.PlusEq) || this.try(T.MinusEq) || this.try(T.StarEq) || this.try(T.SlashEq) || this.try(T.PercentEq)) {
      const op = this.prev().t;
      if (left.k !== "Var") throw this.err("Špatný cíl přiřazení");
      if (op === T.Eq) return { k: "Assign", n: left.n, v: this.assignment() };
      const base =
        op === T.PlusEq ? T.Plus :
        op === T.MinusEq ? T.Minus :
        op === T.StarEq ? T.Star :
        op === T.SlashEq ? T.Slash :
        T.Percent;
      return { k: "Assign", n: left.n, v: { k: "Binary", l: { k: "Var", n: left.n }, op: base, r: this.assignment() } };
    }
    return left;
  }

  private nullish(): Expr {
    let e = this.or();
    while (this.try(T.QMarkQMark)) {
      const right = this.or();
      e = { k: "Binary", l: e, op: T.QMarkQMark, r: right };
    }
    return e;
  }

  private or(): Expr {
    let e = this.and();
    while (this.try(T.OrOr)) e = { k: "Binary", l: e, op: T.OrOr, r: this.and() };
    return e;
  }

  private and(): Expr {
    let e = this.eq();
    while (this.try(T.AndAnd)) e = { k: "Binary", l: e, op: T.AndAnd, r: this.eq() };
    return e;
  }

  private eq(): Expr {
    let e = this.comp();
    while (this.try(T.EqEq) || this.try(T.BangEq)) {
      const op = this.prev().t;
      e = { k: "Binary", l: e, op, r: this.comp() };
    }
    return e;
  }

  private comp(): Expr {
    let e = this.term();
    while (this.try(T.Lt) || this.try(T.LtEq) || this.try(T.Gt) || this.try(T.GtEq)) {
      const op = this.prev().t;
      e = { k: "Binary", l: e, op, r: this.term() };
    }
    return e;
  }

  private term(): Expr {
    let e = this.factor();
    while (this.try(T.Plus) || this.try(T.Minus)) {
      const op = this.prev().t;
      e = { k: "Binary", l: e, op, r: this.factor() };
    }
    return e;
  }

  private factor(): Expr {
    let e = this.power();
    while (this.try(T.Star) || this.try(T.Slash) || this.try(T.Percent)) {
      const op = this.prev().t;
      e = { k: "Binary", l: e, op, r: this.power() };
    }
    return e;
  }

  private power(): Expr {
    let e = this.unary();
    if (this.try(T.StarStar)) {
      const r = this.power();
      e = { k: "Binary", l: e, op: T.StarStar, r };
    }
    return e;
  }

  private unary(): Expr {
    if (this.try(T.Bang) || this.try(T.Minus)) {
      const op = this.prev().t;
      return { k: "Unary", op, r: this.unary() };
    }
    return this.postfixOrMember();
  }

  // Řetězení: obj.f(args).g.h(args)...
  private postfixOrMember(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.try(T.LParen)) {
        const args: Expr[] = [];
        if (!this.is(T.RParen)) {
          do { args.push(this.expr()); } while (this.try(T.Comma));
        }
        this.expect(T.RParen, "Čekám ')'");
        e = { k: "Call", callee: e, args };
        continue;
      }
      if (this.try(T.Dot)) {
        const name = this.expect(T.Identifier, "Čekám identifikátor po '.'").lit as string;
        e = { k: "Get", obj: e, name };
        continue;
      }
      if (this.try(T.PlusPlus) || this.try(T.MinusMinus)) {
        const op = this.prev().t;
        if (e.k !== "Var") throw this.err("Postfix ++/-- jen na proměnné");
        e = { k: "Postfix", n: e.n, op };
        continue;
      }
      break;
    }
    return e;
  }

  private call(): Expr { return this.postfixOrMember(); } // zpětně kompatibilní

  private primary(): Expr {
    if (this.try(T.Number)) return { k: "Lit", v: this.prev().lit };
    if (this.try(T.String)) return { k: "Lit", v: this.prev().lit };
    if (this.try(T.ROZNI))  return { k: "Lit", v: true };
    if (this.try(T.ZHASNI)) return { k: "Lit", v: false };
    if (this.try(T.NULL))   return { k: "Lit", v: null };
    if (this.try(T.Identifier)) return { k: "Var", n: this.prev().lit as string };
    if (this.try(T.LParen)) { const e = this.expr(); this.expect(T.RParen, "Čekám ')'"); return e; }

    // Array literál: [a, b, c] → __arr(a, b, c)
    if (this.try(T.LBracket)) {
      const args: Expr[] = [];
      if (!this.is(T.RBracket)) {
        do { args.push(this.expr()); } while (this.try(T.Comma));
      }
      this.expect(T.RBracket, "Čekám ']'");
      return { k: "Call", callee: { k: "Var", n: "__arr" }, args };
    }

    throw this.err("Čekám výraz");
  }

  /* -------- helpers -------- */
  private is(t: T) { return this.peek().t === t; }
  private try(t: T) { if (this.is(t)) { this.i++; return true; } return false; }
  private expect(t: T, msg: string): Tok { if (this.is(t)) return this.toks[this.i++]; throw this.err(msg); }
  private prev() { return this.toks[this.i-1]; }
  private advance() { return this.toks[this.i++]; }
  private peek() { return this.toks[this.i]; }
  private err(m: string) {
    const p = this.peek();
    return new SyntaxError(`[PARSE] ${m} u tokenu '${p.lex}' na ${p.line}:${p.col}`);
  }
}
