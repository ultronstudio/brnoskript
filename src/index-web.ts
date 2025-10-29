// src/index-web.ts
import { compileSource } from "./compile.js";
import { Interpreter } from "./runtime.js";

/**
 * Spuštění .brno kódu v prohlížeči.
 * baseUrl slouží jako základ pro relativní importy (vokno "modul.brno").
 */
export async function runSource(source: string, baseUrl?: string) {
  // Loader pro 'vokno' – používá fetch + URL resolving
  const fetchLoader = async (path: string, base?: string) => {
    const url = new URL(path, base ?? baseUrl ?? (typeof document !== "undefined" ? document.baseURI : location.href)).href;
    const txt = await (await fetch(url)).text();
    return txt;
  };

  const interp = new Interpreter(fetchLoader, { fsEnabled: false }); // FS off v browseru
  const ast = compileSource(source);
  await interp.run(ast);
}

// užitečné re-exporty (pokud je budeš chtít někde použít)
export { compileSource, Interpreter };

/**
 * Auto-loader: Automaticky spustí všechny inline <script type="text/brnoscript"> při načtení stránky
 */
if (typeof document !== "undefined") {
  // Čekáme na DOMContentLoaded, abychom měli jistotu, že všechny scripty jsou v DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInlineScripts);
  } else {
    // Už je načteno, spusť hned
    runInlineScripts();
  }
}

async function runInlineScripts() {
  const scripts = document.querySelectorAll('script[type="text/brnoscript"]');
  for (const script of Array.from(scripts)) {
    const code = script.textContent || "";
    if (code.trim()) {
      try {
        await runSource(code, document.baseURI);
      } catch (err) {
        console.error("Chyba při spuštění inline BrnoScriptu:", err);
      }
    }
  }
}
