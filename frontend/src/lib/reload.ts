// Cache-busting reload utilities shared by the footer version button and the
// stale-chunk auto-recovery handler.
//
// Why cache-busting: GitHub Pages serves index.html with a ~10-minute max-age
// and each deploy deletes the previous content-hashed chunks. So a browser
// holding a stale index.html references chunk hashes that now 404. A unique
// query param forces a fresh index.html (and therefore fresh chunk URLs).

export const RELOAD_PARAM = "hardreload";
const GUARD_KEY = "cloud-katas-chunk-reload-at";
// Long enough to cover a reload + re-render before we'd consider trying again,
// so a genuinely broken build surfaces its error instead of reloading forever.
const GUARD_COOLDOWN_MS = 20_000;

function readNow(): number {
  // Date.now() is fine in the browser; kept in a helper for a single call site.
  return Date.now();
}

// Reload the current URL while bypassing the HTTP cache.
export function hardReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(readNow()));
  window.location.replace(url.toString());
}

// Called once the app has successfully mounted: strip the cache-bust param from
// the address bar. The loop guard is intentionally left in place and expires on
// its own — clearing it here would let a lazy chunk that keeps failing after
// mount (a real bug, not staleness) reload forever.
export function onAppMounted(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has(RELOAD_PARAM)) {
    url.searchParams.delete(RELOAD_PARAM);
    window.history.replaceState(null, "", url.toString());
  }
}

// Reload to recover from a stale chunk, but at most once per cooldown window so
// a persistent (non-staleness) failure can't loop forever.
function reloadForStaleChunk(): void {
  const now = readNow();
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(GUARD_KEY)) || 0;
  } catch {
    /* ignore */
  }
  if (now - last < GUARD_COOLDOWN_MS) return;
  try {
    window.sessionStorage.setItem(GUARD_KEY, String(now));
  } catch {
    /* ignore */
  }
  hardReload();
}

function looksLikeChunkError(reason: unknown): boolean {
  if (!reason) return false;
  const err = reason as { name?: string; message?: string };
  const name = err.name ?? "";
  const message = typeof reason === "string" ? reason : err.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk \S+ failed/i.test(message) ||
    /loading css chunk/i.test(message)
  );
}

// Install listeners that auto-recover from a stale index.html referencing
// deleted chunks. Call once, before rendering.
export function installChunkReloadHandler(): void {
  // Vite's own signal when a dynamic-import preload fails.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });

  // A failed dynamic import() surfaces as an unhandled promise rejection.
  window.addEventListener("unhandledrejection", (event) => {
    if (looksLikeChunkError(event.reason)) reloadForStaleChunk();
  });

  // A failed <script>/<link> resource load. Resource errors don't bubble, so
  // listen in the capture phase; ignore runtime errors (target is not an element).
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as (HTMLElement & { tagName?: string }) | null;
      const tag = target?.tagName;
      if (tag === "SCRIPT" || tag === "LINK") reloadForStaleChunk();
    },
    true,
  );
}
