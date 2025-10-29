import { compileSource } from "./compile.js";
import { Interpreter } from "./runtime.js";

/** Exponujeme compile do globálu pro 'vokno' (runtime Import to očekává) */
(function setCompileHookOnce() {
  const g: any = globalThis as any;
  if (!g.__brno_compile) g.__brno_compile = (src: string) => compileSource(src);
})();

/**
 * Spuštění .brno kódu v prohlížeči.
 * baseUrl slouží jako základ pro relativní importy (vokno "modul.brno").
 */
export async function runSource(source: string, baseUrl?: string) {
  // Loader pro 'vokno' – používá fetch + URL resolving
  const fetchLoader = async (path: string, base?: string) => {
    const url = new URL(
      path,
      base ?? baseUrl ?? (typeof document !== "undefined" ? document.baseURI : location.href)
    ).href;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} při načítání ${url}`);
    return await resp.text(); // Interpreter čeká jen zdroj
  };

  const interp = new Interpreter(fetchLoader, { fsEnabled: false }); // FS off v browseru
  const ast = compileSource(source);
  await interp.run(ast);
}

export { compileSource, Interpreter };

/* ====================== AUTO LOADER ====================== */
/**
 * - Spustí všechny <script type="text/brnoscript"> (inline i src)
 * - A navíc <script src="*.brno"> i bez type (auto detekce dle přípony)
 * - Defaultně zachovává pořadí (sekvenčně jako klasický <script>).
 *   Pokud má tag atribut 'async', spustí se paralelně.
 */
if (typeof document !== "undefined") {
  const g: any = globalThis as any;
  if (!g.__brno_autoloader_installed) {
    g.__brno_autoloader_installed = true;

    const kick = () => processScripts().catch(e => console.error("[BrnoSkript] Loader fail:", e));
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", kick, { once: true });
    } else {
      // už načteno
      kick();
    }
  }
}

async function processScripts() {
  // vybereme skripty v pořadí jak jsou v DOM
  const all = Array.from(document.getElementsByTagName("script"));

  // rozdělíme na async a sync (bez async)
  const syncQueue: HTMLScriptElement[] = [];
  const asyncOnes: HTMLScriptElement[] = [];

  for (const el of all) {
    const type = (el.getAttribute("type") || "").trim().toLowerCase();
    const src = el.getAttribute("src") || "";
    const isBrnoType = type === "text/brnoscript";
    const isBrnoByExt = !type && /\.brno($|\?)/i.test(src);

    if (!isBrnoType && !isBrnoByExt) continue;

    if (el.hasAttribute("async")) asyncOnes.push(el);
    else syncQueue.push(el);
  }

  // 1) zpracuj sync v pořadí (await, zachová pořadí jako <script>)
  for (const el of syncQueue) {
    await executeScriptTag(el);
  }

  // 2) async paralelně (neblokuje)
  await Promise.all(asyncOnes.map(executeScriptTag));
}

async function executeScriptTag(el: HTMLScriptElement) {
  const src = el.getAttribute("src");
  try {
    if (src && src.length) {
      // externí .brno
      const abs = new URL(src, document.baseURI).href;
      const resp = await fetch(abs);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} při načítání ${abs}`);
      const code = await resp.text();
      await runSource(code, abs);
    } else {
      // inline .brno
      const code = el.textContent || "";
      if (code.trim().length === 0) return;
      await runSource(code, document.baseURI);
    }
  } catch (err) {
    console.error("[BrnoSkript] Chyba při provedení skriptu:", err);
  }
}