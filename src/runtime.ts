import { T } from "./tokens.js";
import { Expr, Stmt } from "./ast.js";

/* Signály pro řízení toku */
class ReturnSig { constructor(public v: any) { } }
class BreakSig { }
class ContinueSig { }

/* Prostředí */
class Env {
  private m = new Map<string, any>();
  constructor(private parent?: Env) {}
  def(n: string, v: any): void { this.m.set(n, v); }
  set(n: string, v: any): void {
    if (this.m.has(n)) { this.m.set(n, v); return; }
    if (this.parent) { this.parent.set(n, v); return; }
    throw new ReferenceError(`Neznámá proměnná '${n}'`);
  }
  get(n: string): any {
    if (this.m.has(n)) return this.m.get(n);
    if (this.parent) return this.parent.get(n);
    throw new ReferenceError(`Neznámá proměnná '${n}'`);
  }
}

/* Funkce */
export type BrnFun = {
  arity: number | null;
  call(i: Interpreter, args: any[]): any | Promise<any>;
  toString(): string;
};

class UserFun implements BrnFun {
  constructor(private name: string, private params: string[], private body: Stmt[], private clos: Env) { }
  get arity() { return this.params.length; }
  async call(i: Interpreter, args: any[]) {
    const e = new Env(this.clos);
    this.params.forEach((p, idx) => e.def(p, args[idx]));
    try { await i.block(this.body, e); } catch (r) { if (r instanceof ReturnSig) return r.v; throw r; }
    return null;
  }
  toString() { return `<rob ${this.name}>`; }
}

/* Loader pro importy (předá CLI) */
export type ModuleLoader = (path: string) => Promise<string>;

/* Volitelné schopnosti (FS apod.) */
export type Capabilities = {
  fsEnabled: boolean;
};

/* ---------------- Interpreter (ASYNC) ---------------- */
export class Interpreter {
  globals = new Env();

  constructor(
    private loader?: ModuleLoader,
    private caps: Capabilities = { fsEnabled: false },
  ) {
    this.installBuiltins();
    this.installStd();
  }

  async run(stmts: Stmt[]) { const e = this.globals; for (const s of stmts) await this.exec(s, e); }

  private truthy(v: any) { return !!v; }
  private eq(a: any, b: any) { return a === b; }
  private isNullish(x: any) { return x === null || x === undefined; }

  private async exec(s: Stmt, env: Env): Promise<void> {
    switch (s.k) {
      case "ExprS": await this.eval(s.e, env); return;
      case "Let": env.def(s.n, s.init ? await this.eval(s.init, env) : null); return;
      case "Block": await this.block(s.body, new Env(env)); return;
      case "If": {
        const c = this.truthy(await this.eval(s.c, env));
        await this.exec(c ? s.t : (s.e ?? { k: "Block", body: [] }), env);
        return;
      }
      case "While": {
        while (this.truthy(await this.eval(s.c, env))) {
          try { await this.exec(s.b, env); }
          catch (sig) {
            if (sig instanceof BreakSig) break;
            if (sig instanceof ContinueSig) continue;
            throw sig;
          }
        }
        return;
      }
      case "ForDesugared": {
        const loopEnv = new Env(env);
        if (s.init) await this.exec(s.init, loopEnv);
        while (s.cond ? this.truthy(await this.eval(s.cond, loopEnv)) : true) {
          try { await this.exec(s.body, loopEnv); }
          catch (sig) {
            if (sig instanceof BreakSig) break;
            if (sig instanceof ContinueSig) { if (s.step) await this.eval(s.step, loopEnv); continue; }
            throw sig;
          }
          if (s.step) await this.eval(s.step, loopEnv);
        }
        return;
      }
      case "Fun": env.def(s.n, new UserFun(s.n, s.params, s.body, env)); return;
      case "Return": throw new ReturnSig(s.v ? await this.eval(s.v, env) : null);
      case "Import": {
        if (!this.loader) throw new Error("Importy nejsou dostupné (bez loaderu).");
        const path = await this.eval(s.path, env);
        if (typeof path !== "string") throw new TypeError("vokno očekává stringovou cestu");
        const src = await this.loader(path);
        const compile = (globalThis as any).__brno_compile as ((src: string) => Stmt[]);
        if (typeof compile !== "function") throw new Error("Compile hook nenalezen (není volán __setCompileHook).");
        const ast = compile(src);
        await this.run(ast);
        return;
      }
      case "Try": {
        try {
          await this.block(s.body, new Env(env));
        } catch (e) {
          if (e instanceof ReturnSig || e instanceof BreakSig || e instanceof ContinueSig) throw e;
          if (s.handler) {
            const catchEnv = new Env(env);
            if (s.id) catchEnv.def(s.id, e);
            await this.block(s.handler, catchEnv);
          } else throw e;
        } finally {
          if (s.fin) await this.block(s.fin, new Env(env));
        }
        return;
      }
      case "Break": throw new BreakSig();
      case "Continue": throw new ContinueSig();
    }
  }

  async block(stmts: Stmt[], env: Env) { for (const st of stmts) await this.exec(st, env); }

  async eval(e: Expr, env: Env): Promise<any> {
    switch (e.k) {
      case "Lit": return e.v;
      case "Var": return env.get(e.n);
      case "Get": {
        const obj = await this.eval(e.obj, env);
        if (obj == null) throw new TypeError("Nelze číst vlastnost z null/undefined");
        return obj[e.name];
      }
      case "Assign": { const v = await this.eval(e.v, env); env.set(e.n, v); return v; }
      case "Postfix": {
        const cur = env.get(e.n);
        if (e.op === T.PlusPlus) { env.set(e.n, Number(cur) + 1); return cur; }
        if (e.op === T.MinusMinus) { env.set(e.n, Number(cur) - 1); return cur; }
        throw new Error("Neznámý postfix op");
      }
      case "Unary": {
        const r = await this.eval(e.r, env);
        if (e.op === T.Bang) return !this.truthy(r);
        if (e.op === T.Minus) return -Number(r);
        throw new Error("Unknown unary op");
      }
      case "Binary": {
        const L = async () => await this.eval(e.l, env);
        const R = async () => await this.eval(e.r, env);
        switch (e.op) {
          case T.Plus: { const l = await L(), r = await R(); return (typeof l === "string" || typeof r === "string") ? String(l) + String(r) : Number(l) + Number(r); }
          case T.Minus: return Number(await L()) - Number(await R());
          case T.Star: return Number(await L()) * Number(await R());
          case T.Slash: return Number(await L()) / Number(await R());
          case T.Percent: return Number(await L()) % Number(await R());
          case T.StarStar: return Math.pow(Number(await L()), Number(await R()));
          case T.EqEq: return this.eq(await L(), await R());
          case T.BangEq: return !this.eq(await L(), await R());
          case T.Lt: return Number(await L()) < Number(await R());
          case T.LtEq: return Number(await L()) <= Number(await R());
          case T.Gt: return Number(await L()) > Number(await R());
          case T.GtEq: return Number(await L()) >= Number(await R());
          case T.AndAnd: { const left = await L(); return this.truthy(left) ? await R() : left; }
          case T.OrOr: { const left = await L(); return this.truthy(left) ? left : await R(); }
          case T.QMarkQMark: { const left = await L(); return this.isNullish(left) ? await R() : left; }
        }
        throw new Error("Unknown binary op");
      }
      case "Call": {
        const cal = await this.eval(e.callee, env);
        const args = [];
        for (const a of e.args) args.push(await this.eval(a, env));
        if (!cal || typeof cal.call !== "function") throw new TypeError("Volat lze jen funkce");
        if (cal.arity !== null && cal.arity !== undefined && cal.arity !== args.length)
          throw new Error(`Arity: čekám ${cal.arity}, dostal ${args.length}`);
        return await cal.call(this, args);
      }
      case "FunExpr": {
        // anonymní funkce s uzávěrem
        return new UserFun("<anon>", e.params, e.body, env);
      }
    }
  }

  /* ---------- Builtins & Std ---------- */
  private installBuiltins() {
    // vyblij / aliasy
    const print: BrnFun = { arity: 1, call: (_i, a) => { console.log(a[0]); return null; }, toString: () => "<builtin vyblij>" };
    this.globals.def("vyblij", print);
    this.globals.def("řekni", print);
    this.globals.def("pisni", print);

    // čas (seconds)
    this.globals.def("fčil", { arity: 0, call: () => Date.now() / 1000, toString: () => "<builtin fčil>" } as BrnFun);

    // házej (throw)
    this.globals.def("házej", { arity: 1, call: (_i, [x]) => { throw x; }, toString: () => "<builtin házej>" } as BrnFun);

    // typ
    this.globals.def("typ", { arity: 1, call: (_i, [x]) => {
      if (x === null) return "null";
      if (Array.isArray(x)) return "pole";
      const t = typeof x;
      if (t === "number") return "číslo";
      if (t === "string") return "řetězec";
      if (t === "boolean") return x ? "pravda" : "nepravda";
      if (t === "function") return "funkce";
      if (t === "object") return "mapa";
      return t;
    }, toString: () => "<builtin typ>" } as BrnFun);

    // __arr: pole literál
    this.globals.def("__arr", {
      arity: null, call: (_i, args) => args, toString: () => "<builtin __arr>"
    } as BrnFun);

    // __obj: objektový literál
    this.globals.def("__obj", {
      arity: null,
      call: (_i, args) => {
        const o: Record<string, any> = {};
        for (let i = 0; i < args.length; i += 2) o[String(args[i])] = args[i+1];
        return o;
      },
      toString: () => "<builtin __obj>"
    } as BrnFun);
  }

  private installStd() {
    const ns = (dict: Record<string, BrnFun>) => ({ ...dict });

    /* text.* */
    const text: Record<string, BrnFun> = {
      "díl":   { arity: 3, call: (_,[s,od,kol]) => String(s).substring(Number(od), Number(od)+Number(kol)), toString(){return"<text.díl>"} },
      "nahrad":{ arity: 3, call: (_,[s,co,cim]) => String(s).split(String(co)).join(String(cim)), toString(){return"<text.nahrad>"} },
      "malý":  { arity: 1, call: (_,[s]) => String(s).toLowerCase(), toString(){return"<text.malý>"} },
      "velký": { arity: 1, call: (_,[s]) => String(s).toUpperCase(), toString(){return"<text.velký>"} },
      "řež":   { arity: 2, call: (_,[s,del]) => String(s).split(String(del)), toString(){return"<text.řež>"} },
      "spojuj":{ arity: 2, call: (_,[arr,sp]) => Array.from(arr).join(String(sp)), toString(){return"<text.spojuj>"} },
      "trim":  { arity: 1, call: (_,[s]) => String(s).trim(), toString(){return"<text.trim>"} },
      "obsahuje":{ arity:2, call:(_,[s,p])=>String(s).includes(String(p)), toString(){return"<text.obsahuje>"} },
      "zacina":{ arity:2, call:(_,[s,p])=>String(s).startsWith(String(p)), toString(){return"<text.zacina>"} },
      "končí": { arity:2, call:(_,[s,p])=>String(s).endsWith(String(p)), toString(){return"<text.končí>"} },
      "formátujDatum": { arity:2, call:(_,[ms,mask])=>{
        const d=new Date(Number(ms));
        return String(mask)
          .replace(/YYYY/g, String(d.getFullYear()))
          .replace(/MM/g, String(d.getMonth()+1).padStart(2,"0"))
          .replace(/DD/g, String(d.getDate()).padStart(2,"0"))
          .replace(/hh/g, String(d.getHours()).padStart(2,"0"))
          .replace(/mm/g, String(d.getMinutes()).padStart(2,"0"))
          .replace(/ss/g, String(d.getSeconds()).padStart(2,"0"));
      }, toString(){return"<text.formátujDatum>"} },
    };
    this.globals.def("text", ns(text));

    /* šalát.* */
    const salat: Record<string, BrnFun> = {
      "je":     { arity:1, call:(_,[x])=>Array.isArray(x), toString(){return"<šalát.je>"} },
      "vem":    { arity:2, call:(_,[a,i])=>a?.[Number(i)], toString(){return"<šalát.vem>"} },
      "hoď":    { arity:2, call:(_,[a,x])=>{ a.push(x); return a.length; }, toString(){return"<šalát.hoď>"} },
      "sekni":  { arity:1, call:(_,[a])=>a.pop(), toString(){return"<šalát.sekni>"} },
      "otoč":   { arity:1, call:(_,[a])=>a.reverse(), toString(){return"<šalát.otoč>"} },
      "seřaď":  { arity:null, call:(_,[a,cmp])=>a.sort(cmp? (x:any,y:any)=>Number(cmp(x,y)):undefined), toString(){return"<šalát.seřaď>"} },
      "mapuj":  { arity:2, call:(i,[a,f])=>a.map((x:any,idx:number)=>f.call(i,[x,idx,a])), toString(){return"<šalát.mapuj>"} },
      "filtruj":{ arity:2, call:(i,[a,f])=>a.filter((x:any,idx:number)=>!!f.call(i,[x,idx,a])), toString(){return"<šalát.filtruj>"} },
      "spočítej":{arity:3, call:(i,[a,f,init])=>a.reduce((acc:any,x:any,idx:number)=>f.call(i,[acc,x,idx,a]), init), toString(){return"<šalát.spočítej>"} },
      "placka": { arity:1, call:(_,[a])=>a.flat(1), toString(){return"<šalát.placka>"} },
      "dl":     { arity:1, call:(_,[a])=>a.length, toString(){return"<šalát.dl>"} },
    };
    this.globals.def("šalát", ns(salat));

    /* mapa.* */
    const mapa: Record<string, BrnFun> = {
      "vytvor": { arity:0, call:()=>({}), toString(){return"<mapa.vytvor>"} },
      "vem":    { arity:2, call:(_,[m,k])=>m?.[k], toString(){return"<mapa.vem>"} },
      "dej":    { arity:3, call:(_,[m,k,v])=>{ m[k]=v; return v; }, toString(){return"<mapa.dej>"} },
      "keys":   { arity:1, call:(_,[m])=>Object.keys(m??{}), toString(){return"<mapa.keys>"} },
      "values": { arity:1, call:(_,[m])=>Object.values(m??{}), toString(){return"<mapa.values>"} },
      "páry":   { arity:1, call:(_,[m])=>Object.entries(m??{}), toString(){return"<mapa.páry>"} },
      "spojit": { arity:2, call:(_,[a,b])=>Object.assign({}, a??{}, b??{}), toString(){return"<mapa.spojit>"} },
    };
    this.globals.def("mapa", ns(mapa));

    /* matyš.* */
    const matys: Record<string, BrnFun> = {
      "abs":{arity:1,call:(_,[x])=>Math.abs(Number(x)),toString(){return"<matyš.abs>"}},
      "kolo":{arity:1,call:(_,[x])=>Math.round(Number(x)),toString(){return"<matyš.kolo>"}},
      "pod":{arity:1,call:(_,[x])=>Math.floor(Number(x)),toString(){return"<matyš.pod>"}},
      "nad":{arity:1,call:(_,[x])=>Math.ceil(Number(x)),toString(){return"<matyš.nad>"}},
      "moc":{arity:2,call:(_,[a,b])=>Math.pow(Number(a),Number(b)),toString(){return"<matyš.moc>"}},
      "kořen":{arity:1,call:(_,[x])=>Math.sqrt(Number(x)),toString(){return"<matyš.kořen>"}},
      "sin":{arity:1,call:(_,[x])=>Math.sin(Number(x)),toString(){return"<matyš.sin>"}},
      "cos":{arity:1,call:(_,[x])=>Math.cos(Number(x)),toString(){return"<matyš.cos>"}},
      "tan":{arity:1,call:(_,[x])=>Math.tan(Number(x)),toString(){return"<matyš.tan>"}},
      "min":{arity:null,call:(_,[...xs])=>Math.min(...xs.map(Number)),toString(){return"<matyš.min>"}},
      "max":{arity:null,call:(_,[...xs])=>Math.max(...xs.map(Number)),toString(){return"<matyš.max>"}},
      "náhoda":{arity:0,call:()=>Math.random(),toString(){return"<matyš.náhoda>"}},
      "náhodaMezi":{arity:2,call:(_,[a,b])=>Math.floor(Math.random()*(Number(b)-Number(a)+1))+Number(a),toString(){return"<matyš.náhodaMezi>"}},
    };
    this.globals.def("matyš", ns(matys));

    /* čas.* */
    const cas: Record<string, BrnFun> = {
      "teď":   { arity:0, call:()=>Date.now(), toString(){return"<čas.teď>"} },
      "formát":{ arity:2, call:(_,[ms,mask])=>{
        const d=new Date(Number(ms));
        return String(mask)
          .replace(/YYYY/g, String(d.getFullYear()))
          .replace(/MM/g, String(d.getMonth()+1).padStart(2,"0"))
          .replace(/DD/g, String(d.getDate()).padStart(2,"0"))
          .replace(/hh/g, String(d.getHours()).padStart(2,"0"))
          .replace(/mm/g, String(d.getMinutes()).padStart(2,"0"))
          .replace(/ss/g, String(d.getSeconds()).padStart(2,"0"));
      }, toString(){return"<čas.formát>"} },
      "usni": { arity:1, call: async (_,[ms]) => await new Promise(r=>setTimeout(r, Number(ms))), toString(){return"<čas.usni>"} },
      "odměř":{ arity:1, call: async (i,[f]) => { const s=Date.now(); await f.call(i,[]); return Date.now()-s; }, toString(){return"<čas.odměř>"} },
    };
    this.globals.def("čas", ns(cas));

    /* regl.* */
    const regl: Record<string, BrnFun> = {
      "najdi": { arity:2, call:(_,[s,pat])=>new RegExp(String(pat)).exec(String(s))?.[0] ?? null, toString(){return"<regl.najdi>"} },
      "všeci": { arity:2, call:(_,[s,pat])=>Array.from(String(s).matchAll(new RegExp(String(pat),"g"))).map(m=>m[0]), toString(){return"<regl.všeci>"} },
      "nahrad":{ arity:3, call:(_,[s,pat,cim])=>String(s).replace(new RegExp(String(pat),"g"), String(cim)), toString(){return"<regl.nahrad>"} },
    };
    this.globals.def("regl", ns(regl));

    /* krypto.* */
    const krypto: Record<string, BrnFun> = {
      "uuid": { arity:0, call: async ()=>{
        if ((globalThis as any).crypto?.randomUUID) return (globalThis as any).crypto.randomUUID();
        const { randomBytes } = await import("node:crypto");
        const b = randomBytes(16);
        b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
        const hex = (buf: Buffer) => [...buf].map(x=>x.toString(16).padStart(2,"0")).join("");
        const s = hex(b);
        return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
      }, toString(){return"<krypto.uuid>"} },
      "base64":  { arity:1, call:(_,[s])=>Buffer.from(String(s),"utf8").toString("base64"), toString(){return"<krypto.base64>"} },
      "zbase64": { arity:1, call:(_,[s])=>Buffer.from(String(s),"base64").toString("utf8"), toString(){return"<krypto.zbase64>"} },
      "sha256":  { arity:1, call: async (_,[s])=>{
        const data = new TextEncoder().encode(String(s));
        const webc = (globalThis as any).crypto?.subtle;
        if (webc?.digest) {
          const digest = await webc.digest("SHA-256", data);
          const arr = Array.from(new Uint8Array(digest));
          return arr.map(b=>b.toString(16).padStart(2,"0")).join("");
        }
        const { createHash } = await import("node:crypto");
        return createHash("sha256").update(Buffer.from(data)).digest("hex");
      }, toString(){return"<krypto.sha256>"} }
    };
    this.globals.def("krypto", ns(krypto));

    /* šichta.* */
    const sachta: Record<string, BrnFun> = {
      "argv": { arity:0, call:()=>process.argv.slice(2), toString(){return"<šichta.argv>"} },
      "env":  { arity:1, call:(_,[k])=>process.env[String(k)] ?? null, toString(){return"<šichta.env>"} },
      "konec":{ arity:1, call:(_,[code])=>{ process.exit(Number(code) || 0); }, toString(){return"<šichta.konec>"} },
    };
    this.globals.def("šichta", ns(sachta));

    /* šufle.* (FS – default off) */
    const self = this;
    const sufle: Record<string, BrnFun> = {
      "je":   { arity:1, call: async (_,[p])=> self.caps.fsEnabled ? (await import("node:fs")).existsSync(String(p)) : denyFS(), toString(){return"<šufle.je>"} },
      "čti":  { arity:1, call: async (_,[p])=> {
        if (!self.caps.fsEnabled) return denyFS();
        const { readFile } = await import("node:fs/promises");
        return await readFile(String(p), "utf8");
      }, toString(){return"<šufle.čti>"} },
      "piš":  { arity:2, call: async (_,[p,d])=>{
        if (!self.caps.fsEnabled) return denyFS();
        const { writeFile } = await import("node:fs/promises");
        await writeFile(String(p), String(d));
        return true;
      }, toString(){return"<šufle.piš>"} },
      "seznam":{arity:1, call: async (_,[p])=>{
        if (!self.caps.fsEnabled) return denyFS();
        const { readdir } = await import("node:fs/promises");
        return await readdir(String(p));
      }, toString(){return"<šufle.seznam>"} },
      "info": { arity:1, call: async (_,[p])=>{
        if (!self.caps.fsEnabled) return denyFS();
        const { stat } = await import("node:fs/promises");
        const s = await stat(String(p));
        return {
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          size: s.size,
          dev: (s as any).dev,
          ino: (s as any).ino,
          mode: (s as any).mode,
          nlink: (s as any).nlink,
          uid: (s as any).uid,
          gid: (s as any).gid,
          rdev: (s as any).rdev,
          blksize: (s as any).blksize,
          blocks: (s as any).blocks,
          atimeMs: s.atimeMs,
          mtimeMs: s.mtimeMs,
          ctimeMs: s.ctimeMs,
          birthtimeMs: s.birthtimeMs,
          atime: s.atime.toISOString(),
          mtime: s.mtime.toISOString(),
          ctime: s.ctime.toISOString(),
          birthtime: s.birthtime.toISOString(),
        };
      }, toString(){return"<šufle.info>"} },
    };
    this.globals.def("šufle", ns(sufle));

    /* šmirgl.* (helper na typy) */
    const smirgl: Record<string, BrnFun> = {
      "typy": { arity: 1, call: (_,[o])=>{
        const out: Record<string,string> = {};
        if (o && typeof o === "object") {
          for (const k of Object.keys(o)) {
            const v = o[k];
            out[k] = Array.isArray(v) ? "pole"
              : v === null ? "null"
              : typeof v === "number" ? "číslo"
              : typeof v === "string" ? "řetězec"
              : typeof v === "boolean" ? (v ? "pravda" : "nepravda")
              : typeof v === "function" ? "funkce"
              : "mapa";
          }
        }
        return out;
      }, toString(){return"<šmirgl.typy>"} }
    };
    this.globals.def("šmirgl", ns(smirgl));

    function denyFS(){ throw new Error("FS je vypnutý (spusť s --unsafe-fs)."); }
  }
}
