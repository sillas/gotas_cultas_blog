const counter = document.querySelector("[data-view-counter]");
if (counter instanceof HTMLElement) {
  const slug = counter.dataset.slug;
  const apiBase = counter.dataset.apiBase;
  if (slug && apiBase) {
    const key = `view-counted:${slug}`;
    let elapsed = 0;
    let visibleSince = null;
    let timer;
    let finished = false;
    const counted = () => { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } };
    const mark = () => { try { sessionStorage.setItem(key, "1"); } catch {} };
    const remove = () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", stop); };
    const record = () => {
      if (finished || counted()) return;
      finished = true;
      clearTimeout(timer);
      remove();
      mark();
      fetch(`${apiBase}/views/${encodeURIComponent(slug)}`, { method: "POST", keepalive: true }).catch(() => {});
    };
    const pause = () => { if (visibleSince !== null) { elapsed += performance.now() - visibleSince; visibleSince = null; } clearTimeout(timer); };
    const resume = () => {
      if (finished || visibleSince !== null || document.visibilityState !== "visible") return;
      visibleSince = performance.now();
      timer = window.setTimeout(record, Math.max(0, 8_000 - elapsed));
    };
    function visibility() { if (document.visibilityState === "visible") resume(); else pause(); }
    function stop() { pause(); remove(); }
    const start = () => { if (!counted()) { document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", stop, { once: true }); resume(); } };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
  }
}
