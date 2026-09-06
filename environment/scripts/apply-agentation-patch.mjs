#!/usr/bin/env node
// apply-agentation-patch.mjs — re-apply the agentation popup bridge patch.
//
// WHY THIS EXISTS: the entire annotate→AI loop's front half lives as a patch to
// the `agentation` package's dist (popup handleSubmit → POST :4747/annotate →
// stream the reply into a thread above the textarea). It was originally
// hand-edited into node_modules and got silently obliterated by a dependency
// reinstall on 2026-07-20 — killing the whole UX with no git trace. This script
// makes the patch durable: run on postinstall + from scripts/dev-all.sh.
// Idempotent (checks the __CC_PATCH__ marker). `pnpm patch` was not usable at
// the time (CodeArtifact 401); migrate to patchedDependencies when auth works.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const candidates = []
const pnpmDir = path.join(root, 'node_modules', '.pnpm')
if (fs.existsSync(pnpmDir)) {
  for (const d of fs.readdirSync(pnpmDir)) {
    if (d.startsWith('agentation@')) {
      candidates.push(path.join(pnpmDir, d, 'node_modules', 'agentation', 'dist', 'index.mjs'))
    }
  }
}
candidates.push(path.join(root, 'node_modules', 'agentation', 'dist', 'index.mjs'))

const PRISTINE_SUBMIT = `    const handleSubmit = useCallback(() => {
      if (!text.trim()) return;
      onSubmit(text.trim());
    }, [text, onSubmit]);`

const PATCHED_SUBMIT = `    // __CC_PATCH__ v7 (2026-07-23, reload removed -- HMR applies edits live): dispatch to the agentation-bridge and stream the
    // reply into a thread above the textarea. Persistence lives in localStorage, NOT
    // React state, so a fresh Add can commit the annotation + CLOSE the popup while
    // the reply keeps streaming into storage; reopening the marker rehydrates the full
    // conversation. One EventSource per send with ?live=1 (no history replay -> no
    // old+new concatenation). Applied by scripts/apply-agentation-patch.mjs.
    const CC_STORE = "__cc_thread_store__";
    const ccKey = (el) => (window.location.pathname + window.location.hash + "|" + el);
    const ccLoad = (el) => { try { return (JSON.parse(window.localStorage.getItem(CC_STORE) || "{}"))[ccKey(el)] || []; } catch (e) { return []; } };
    const ccPersist = (el, upd) => { try { const s = JSON.parse(window.localStorage.getItem(CC_STORE) || "{}"); s[ccKey(el)] = upd(s[ccKey(el)] || []); window.localStorage.setItem(CC_STORE, JSON.stringify(s)); window.dispatchEvent(new CustomEvent("cc-thread")); } catch (e) {} };
    const [ccThread, setCcThread] = useState(() => ccLoad(element));
    const ccBoxRef = useRef(null);
    if (typeof document !== "undefined" && !document.getElementById("__cc_kf__")) {
      const st = document.createElement("style"); st.id = "__cc_kf__";
      st.textContent = "@keyframes ccPulse{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}";
      document.head.appendChild(st);
    }
    useEffect(() => { const h = () => setCcThread(ccLoad(element)); window.addEventListener("cc-thread", h); return () => window.removeEventListener("cc-thread", h); }, [element]);
    useEffect(() => { setCcThread(ccLoad(element)); }, [element]);
    useEffect(() => { const bx = ccBoxRef.current; if (bx) bx.scrollTop = bx.scrollHeight; }, [ccThread]);
    const handleSubmit = useCallback(() => {
      if (!text.trim()) return;
      const msg = text.trim();
      const BRIDGE = (typeof window !== "undefined" && window.__AGENTATION_BRIDGE__) || "http://localhost:4747";
      const el = element;
      const g = typeof window !== "undefined" ? window : {};
      g.__ccThreads = g.__ccThreads || {};
      ccPersist(el, (arr) => arr.concat([{ role: "human", content: msg }, { role: "agent", content: "…" }]));
      setText("");
      const body = { comment: msg, url: window.location.href, annotations: [{ comment: msg, element: el, elementPath: el }] };
      if (g.__ccThreads[ccKey(el)]) body.threadId = g.__ccThreads[ccKey(el)];
      let buf = "";
      try {
        window.fetch(BRIDGE + "/annotate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).then((j) => {
          if (!j || !j.threadId) return;
          g.__ccThreads[ccKey(el)] = j.threadId;
          try { window.fetch(BRIDGE + "/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: window.location.href, element: el, comment: msg, savedOnly: false, threadId: j.threadId }) }).catch(() => {}); } catch (e) {}
          const es = new EventSource(BRIDGE + "/stream/" + j.threadId + "?live=1");
          es.addEventListener("delta", (ev) => { try { buf += JSON.parse(ev.data).text || ""; } catch (e) {} ccPersist(el, (arr) => { const c = arr.slice(); if (c.length && c[c.length - 1].role === "agent") c[c.length - 1] = { role: "agent", content: buf }; return c; }); });
          es.addEventListener("status", (ev) => { let ph = ""; try { ph = JSON.parse(ev.data).phase || ""; } catch (e) {} if (ph === "done" || ph === "error" || ph === "cancelled") { es.close(); if (!buf) ccPersist(el, (arr) => { const c = arr.slice(); if (c.length && c[c.length - 1].role === "agent") c[c.length - 1] = { role: "agent", content: "(" + ph + ")" }; return c; }); } });
          es.onerror = () => {};
        }).catch(() => {});
      } catch (e) {}
      if (!initialValue) onSubmit(msg);
    }, [text, element, initialValue, onSubmit]);`

const TA_ANCHOR = `          /* @__PURE__ */ jsx2(
            "textarea",
            {
              ref: textareaRef,`

const THREAD_BLOCK = `          ccThread.length > 0 && /* @__PURE__ */ jsx2("div", { ref: ccBoxRef, style: { maxHeight: 180, overflowY: "auto", margin: "6px 0", padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.28)", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#E9E9F2", scrollBehavior: "smooth" }, children: ccThread.map((m, i) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 6 }, children: [
            /* @__PURE__ */ jsx2("span", { style: { fontWeight: 700, color: m.role === "agent" ? "#B6ADFF" : "#8b8b96" }, children: m.role === "agent" ? "CC  " : "you  " }),
            m.role === "agent" && m.content === "\u2026" ? /* @__PURE__ */ jsx2("span", { children: [0, 1, 2].map((k) => /* @__PURE__ */ jsx2("span", { style: { display: "inline-block", width: 5, height: 5, borderRadius: 5, background: "#B6ADFF", marginRight: 4, animation: "ccPulse 1.1s ease-in-out " + k * 0.18 + "s infinite" } }, k)) }) : m.content
          ] }, i)) }),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              ref: textareaRef,`

let done = 0
for (const f of candidates) {
  if (!fs.existsSync(f)) continue
  let s = fs.readFileSync(f, 'utf8')
  if (s.includes('__CC_PATCH__')) { console.log(`[agentation-patch] already applied: ${f}`); done++; continue }
  const okA = s.split(PRISTINE_SUBMIT).length === 2
  const okB = s.split(TA_ANCHOR).length === 2
  if (!okA || !okB) {
    console.warn(`[agentation-patch] ANCHORS NOT FOUND in ${f} (submit:${okA} textarea:${okB}) — package version changed? Patch NOT applied; the annotate loop will fall back to the head-guard (no in-popup streaming).`)
    continue
  }
  s = s.replace(PRISTINE_SUBMIT, PATCHED_SUBMIT).replace(TA_ANCHOR, THREAD_BLOCK)
  fs.writeFileSync(f, s)
  console.log(`[agentation-patch] applied: ${f}`)
  done++
  // Invalidate the Vite dep-optimizer cache so the patched dist actually loads.
  for (const viteCache of [path.join(root, 'apps', 'main', 'node_modules', '.vite'), path.join(root, 'node_modules', '.vite')]) {
    if (fs.existsSync(viteCache)) { fs.rmSync(viteCache, { recursive: true, force: true }); console.log(`[agentation-patch] cleared vite cache: ${viteCache}`) }
  }
}
if (!done) console.warn('[agentation-patch] no agentation dist found/patched')
