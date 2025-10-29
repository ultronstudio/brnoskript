import { T, Tok, kw, isDigit, isIdStart, isIdPart } from "./tokens.js";

export class Lexer {
  private i = 0; private line = 1; private col = 1;
  constructor(private src: string) {}

  lex(): Tok[] {
    const out: Tok[] = [];
    while (!this.eof()) {
      this.skipWS();
      if (this.eof()) break;
      const startCol = this.col;
      const c = this.advance();

      switch (c) {
        case "(": out.push(this.tok(T.LParen, "(")); break;
        case ")": out.push(this.tok(T.RParen, ")")); break;
        case "{": out.push(this.tok(T.LBrace, "{")); break;
        case "}": out.push(this.tok(T.RBrace, "}")); break;
        case "[": out.push(this.tok(T.LBracket, "[")); break;
        case "]": out.push(this.tok(T.RBracket, "]")); break;
        case ".": out.push(this.tok(T.Dot, ".")); break;
        case ",": out.push(this.tok(T.Comma, ",")); break;

        case "+": {
          if (this.match("+")) { out.push(this.tok(T.PlusPlus, "++")); break; }
          if (this.match("=")) { out.push(this.tok(T.PlusEq, "+=")); break; }
          out.push(this.tok(T.Plus, "+")); break;
        }
        case "-": {
          if (this.match("-")) { out.push(this.tok(T.MinusMinus, "--")); break; }
          if (this.match("=")) { out.push(this.tok(T.MinusEq, "-=")); break; }
          out.push(this.tok(T.Minus, "-")); break;
        }
        case "*": {
          if (this.match("*")) { out.push(this.tok(T.StarStar, "**")); break; }
          if (this.match("=")) { out.push(this.tok(T.StarEq, "*=")); break; }
          out.push(this.tok(T.Star, "*")); break;
        }
        case "/": {
          if (this.peek()==="/") { this.skipLineComment(); break; }
          if (this.peek()==="*") { this.skipBlockComment(); break; }
          if (this.match("=")) { out.push(this.tok(T.SlashEq, "/=")); break; }
          out.push(this.tok(T.Slash, "/")); break;
        }
        case "%": { if (this.match("=")) { out.push(this.tok(T.PercentEq, "%=")); break; } out.push(this.tok(T.Percent, "%")); break; }

        case "&": {
          if (this.match("&")) { out.push(this.tok(T.AndAnd, "&&")); break; }
          throw this.err("Očekávám '&&'");
        }
        case "|": {
          if (this.match("|")) { out.push(this.tok(T.OrOr, "||")); break; }
          throw this.err("Očekávám '||'");
        }

        case "!": out.push(this.tok(this.match("=") ? T.BangEq : T.Bang, this.src.slice(this.i-1, this.i))); break;
        case "=": out.push(this.tok(this.match("=") ? T.EqEq   : T.Eq,   this.src.slice(this.i-1, this.i))); break;
        case "<": out.push(this.tok(this.match("=") ? T.LtEq   : T.Lt,   this.src.slice(this.i-1, this.i))); break;
        case ">": out.push(this.tok(this.match("=") ? T.GtEq   : T.Gt,   this.src.slice(this.i-1, this.i))); break;

        case "?": {
          if (this.match("?")) { out.push(this.tok(T.QMarkQMark, "??")); break; }
          throw this.err("Neznámý otazníkový operátor (používáme jen '??')");
        }

        case '"': out.push(this.string()); break;

        default:
          if (isDigit(c)) { out.push(this.number(c)); break; }
          if (isIdStart(c)) { out.push(this.identifier(c)); break; }
          throw new SyntaxError(`[LEX] Nečekaný znak '${c}' na ${this.line}:${startCol}`);
      }
    }
    out.push({ t: T.EOF, lex: "", line: this.line, col: this.col });
    return out;
  }

  private eof() { return this.i >= this.src.length; }
  private peek() { return this.src[this.i] ?? "\0"; }
  private peekN(n: number) { return this.src[this.i + n] ?? "\0"; }
  private advance() { const ch = this.src[this.i++]; if (ch === "\n"){ this.line++; this.col=1; } else this.col++; return ch; }
  private match(expected: string) { if (this.peek() !== expected) return false; this.i++; this.col++; return true; }
  private tok(t: T, lex: string, lit?: any): Tok { return { t, lex, lit, line: this.line, col: this.col }; }
  private err(msg: string) { return new SyntaxError(`[LEX] ${msg} na ${this.line}:${this.col}`); }

  private skipWS() {
    while (!this.eof()) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\r" || c === "\n") { this.advance(); continue; }
      break;
    }
  }
  private skipLineComment() { while (this.peek() !== "\n" && !this.eof()) this.advance(); }
  private skipBlockComment() {
    this.advance(); // consume '*'
    while (!(this.peek() === "*" && this.peekN(1) === "/") && !this.eof()) this.advance();
    if (!this.eof()) { this.advance(); this.advance(); } // '*/'
  }

  private string(): Tok {
    let v = "";
    while (this.peek() !== '"' && !this.eof()) v += this.advance();
    if (this.eof()) throw new SyntaxError("[LEX] Neuzavřený string");
    this.advance(); // closing "
    return this.tok(T.String, `"${v}"`, v);
  }
  private number(first: string): Tok {
    let s = first;
    while (isDigit(this.peek())) s += this.advance();
    if (this.peek() === "." && isDigit(this.peekN(1))) {
      s += this.advance();
      while (isDigit(this.peek())) s += this.advance();
    }
    return this.tok(T.Number, s, Number(s));
  }
  private identifier(first: string): Tok {
    let s = first;
    while (isIdPart(this.peek())) s += this.advance();
    if (s === "piča") return this.tok(T.PICA, s);
    const k = kw.get(s);
    if (k !== undefined) return this.tok(k, s, s);
    return this.tok(T.Identifier, s, s);
  }
}
