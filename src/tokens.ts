/* Tokeny + klíčová slova + unicode helpery */

export enum T {
  // Interpunkce
  LParen, RParen, LBrace, RBrace, Comma,
  LBracket, RBracket,
  Dot, // ← tečka
  Colon, // ← dvojtečka

  // Operátory
  Plus, Minus, Star, Slash, Percent,
  Bang, BangEq,
  Eq, EqEq,
  Lt, LtEq, Gt, GtEq,
  AndAnd, OrOr,

  // Nové operátory
  PlusEq, MinusEq, StarEq, SlashEq, PercentEq,
  PlusPlus, MinusMinus,
  StarStar,        // **
  QMarkQMark,      // ??

  // Atomické tokeny
  Identifier, Number, String,

  // Terminátor
  PICA,            // "piča"

  // Klíčová slova
  NECH, ROB, VRAT,            // nech, rob, vrat
  ESLI, INAK, SALINA,         // esli, inak, šalina
  VYBLIJ,                     // vyblij(...)
  ROZNI, ZHASNI, NULL,        // rožni/zhasni/null

  // Nové klíčové
  VOKNO,                      // import
  ZKUS, CHYT, POTOM,          // try/catch/finally
  VYPADNI, PRESKOC,           // break/continue
  OKRUH,                      // for-like

  EOF,
}

export type Tok = { t: T; lex: string; lit?: any; line: number; col: number };

export const kw = new Map<string, T>([
  ["nech", T.NECH],
  ["rob", T.ROB],
  ["vrat", T.VRAT],
  ["esli", T.ESLI],
  ["inak", T.INAK],
  ["šalina", T.SALINA],
  ["vyblij", T.VYBLIJ],
  ["rožni", T.ROZNI],
  ["zhasni", T.ZHASNI],
  ["null", T.NULL],
  ["piča", T.PICA],
  ["vokno", T.VOKNO],
  ["zkus", T.ZKUS],
  ["chyť", T.CHYT],
  ["potom", T.POTOM],
  ["vypadni", T.VYPADNI],
  ["přeskoč", T.PRESKOC],
  ["okruh", T.OKRUH],
]);

export const isDigit = (ch: string) => /\d/u.test(ch);
export const isIdStart = (ch: string) => /[\p{L}_]/u.test(ch);
export const isIdPart  = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
