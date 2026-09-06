#!/usr/bin/env node
// agentation-bridge v4 — STATELESS ONE-SHOT (V-28 fix).
//
// Forked from server.mjs (v2). v2 was already one-shot-per-annotation (child
// exits on completion, no persistent REPL) — v4 hardens it into the
// production answer to V-28 "persistent-worker rot":
//
//   + Concurrency cap (semaphore + queue): N children at once, the rest queue.
//     Different files edit in parallel; same-file races are caught by the
//     edit-lock PreToolUse hook (engaged via AGENTATION_WORKER below).
//   + Each child is tagged AGENTATION_WORKER so the edit-lock/unlock hooks
//     apply (per-file shasum lock, owner = worker+pid). CLAUDECODE is stripped
//     from the child env so `claude -p` never hits the nested-OAuth lock.
//   + Per-turn metrics line (/tmp/agentation-bridge/v4-metrics.jsonl):
//     {threadId, turn, startMs, endMs, durationMs, exit, logBytes, model}
//     — this is what the reliability/latency test reads.
//   + No tmux, no pool, no persistence between annotations. A finished child
//     is a dead process: cannot balloon, cannot hang, nothing to reap.
//
// "Interact further" is opt-in per thread: a follow-up POST with the same
// threadId fires ONE `--resume <threadId>` turn, then exits again. Default
// (new threadId) = fresh bounded context.
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, existsSync, appendFileSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const INBOX_DIR = join(homedir(), '.claude')
const INBOX_FILE = join(INBOX_DIR, 'agentation-inbox.jsonl')
if (!existsSync(INBOX_DIR)) mkdirSync(INBOX_DIR, { recursive: true })

const PORT = Number(process.env.PORT || 4747)
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const DEFAULT_MODEL = process.env.AGENTATION_DEFAULT_MODEL || 'claude-sonnet-5'
const PROJECT_CWD = process.env.AGENTATION_CWD || process.cwd()
const CONCURRENCY = Number(process.env.AGENTATION_CONCURRENCY || 3)
// /save de-dupe window. BOTH senders mirror every annotation to the inbox --
// the head guard (apps/main/index.html -> public/agentation-send-guard.js) and
// AgentationDevtoolsV2_2 -- so one click wrote two identical rows, halving the
// effective window of the 12-slot history digest. (/annotate is NOT double-fired;
// verified 2026-07-28 by one turn1 log per distinct comment.)
const SAVE_DEDUPE_MS = Number(process.env.AGENTATION_SAVE_DEDUPE_MS || 10000)
const RECENT_SAVES = new Map()
// Build gate (V-28-adjacent: headless children can't run the post-ui-verify
// screenshot, so comprehensive edits can ship a runtime-breaking dangling ref).
// When on, after an edit turn we typecheck the project; if a FILE THE CHILD
// TOUCHED has errors, we fire ONE self-correct resume turn feeding the errors.
// Off by default (adds ~tsc time); the kit turns it on.
const BUILD_GATE = process.env.AGENTATION_BUILD_GATE === '1'
// Registry-free: invoke the workspace's local tsc binary directly. `npx tsc`
// hits the npm registry to resolve the bin and E401'd on an expired token,
// crashing the gate into a silent false-pass (2026-07-23). The local .bin is
// already installed, so no auth/network is touched.
const TYPECHECK_CMD = process.env.AGENTATION_TYPECHECK_CMD ||
  'apps/main/node_modules/.bin/tsc --noEmit -p apps/main/tsconfig.json'
const LOG_DIR = '/tmp/agentation-bridge'
const METRICS_FILE = join(LOG_DIR, 'v4-metrics.jsonl')
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

const THREADS = new Map()

// ── concurrency gate ─────────────────────────────────────────────────────
let active = 0
let completed = 0
const queue = []
function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift()
    active++
    job()
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

// ── Annotation history digest ────────────────────────────────────────────────
// Each v4 dispatch is a fresh one-shot claude with zero session memory. This
// injects the inbox's recent related annotations into the prompt so a dispatch
// can "see the session so far" (user ask, 2026-07-21). Related = shares a
// non-generic <Component> token with the current element (the new bridge posts
// url:"/", so page identity lives in the element field — match by element, not
// url). Falls back to the most recent records when nothing matches.
const GENERIC_TOKENS = new Set(['App', 'V3Artboard', 'ArtboardSectionBlock', 'ArtboardStepBlock', 'ArtboardClickFrame', 'FrameTray', 'DesktopFrame', 'NativeFrame', 'IOSStatusBar'])
const elementTokens = (el) => (el || '').match(/<([A-Za-z][A-Za-z0-9]*)>/g)?.map((t) => t.slice(1, -1)).filter((t) => !GENERIC_TOKENS.has(t)) ?? []
function historyDigest(element) {
  try {
    if (!existsSync(INBOX_FILE)) return null
    const recs = []
    for (const l of readFileSync(INBOX_FILE, 'utf8').trim().split('\n').slice(-400)) {
      try { recs.push(JSON.parse(l)) } catch {}
    }
    const recent = recs.filter((r) => r.ts >= Date.now() - 48 * 3600e3)
    const toks = new Set(elementTokens(element))
    const related = toks.size ? recent.filter((r) => elementTokens(r.element).some((t) => toks.has(t))) : []
    // Read-time de-dupe: rows written before the /save dedupe landed are still
    // duplicated on disk. Collapse them here (non-destructive -- the log is left
    // intact) so the 12-slot window carries 12 DISTINCT annotations.
    const seen = new Set()
    const distinct = (related.length ? related : recent).filter((r) => {
      const k = `${r.element} :: ${r.comment}`
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    const pick = distinct.slice(-12)
    if (!pick.length) return null
    const fmt = (r) => {
      const d = new Date(r.ts)
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      return `- ${hm} ${r.savedOnly ? '[saved]' : '[sent]'} ${(r.element || '(no element)').slice(0, 90)} :: ${(r.comment || '').replace(/\s+/g, ' ').slice(0, 220)}`
    }
    return { matched: related.length > 0, lines: pick.map(fmt).join('\n') }
  } catch { return null }
}

function parseCcPrefix(comment) {
  const m = /^cc:\s*([^\n]+)\n([\s\S]*)$/.exec(comment ?? '')
  if (!m) return { prompt: (comment ?? '').trim(), ccModel: null }
  return { prompt: m[2].trim(), ccModel: m[1].trim() }
}

// HISTORY IS OPT-IN (2026-08-03). The 07-21 digest injected up to 12 prior
// annotations, matched by component token, into EVERY dispatch and told the child
// they were its session context. It had no off switch. Deleting a marker in the UI
// clears localStorage but never the append-only inbox, so a deleted conversation
// reappeared on the next annotation to the same component (user report 2026-08-03).
// Worse: superseded instructions were presented as current, a plausible source of
// the V-26 scope-creep. Opt in per annotation with a `ctx:` prefix.
function parseCtxPrefix(comment) {
  const m = /^ctx:\s*([\s\S]*)$/.exec(comment ?? '')
  if (!m) return { prompt: (comment ?? '').trim(), wantHistory: false }
  return { prompt: m[1].trim(), wantHistory: true }
}

function getOrCreateThread(threadId) {
  let t = THREADS.get(threadId)
  if (!t) {
    // sessionUuid: claude-code now requires --session-id/--resume to be a valid
    // UUID. Client threadIds (e.g. head-guard 'guard_<ts>_<rand>') are not UUIDs,
    // so map each thread to a stable UUID for the child; keep threadId for routing.
    t = { id: threadId, sessionUuid: randomUUID(), turns: 0, history: [], currentChild: null, sseClients: [] }
    THREADS.set(threadId, t)
  }
  return t
}

function broadcast(thread, eventName, dataObj) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(dataObj)}\n\n`
  thread.history.push({ event: eventName, data: dataObj, ts: Date.now() })
  for (const res of thread.sseClients) { try { res.write(payload) } catch {} }
}

function parseLine(line) {
  if (!line.trim()) return null
  try { return JSON.parse(line) } catch { return null }
}

function projectEvent(thread, evt) {
  if (!evt || typeof evt !== 'object') return
  if (thread.cancelledByUser) return
  if (evt.type === 'system' && evt.subtype === 'init') {
    broadcast(thread, 'status', { phase: 'thinking', sessionId: evt.session_id, model: evt.model }); return
  }
  if (evt.type === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'tool_use') {
        broadcast(thread, 'tool', { name: block.name, input: block.input })
        if (['Edit', 'Write', 'MultiEdit'].includes(block.name) && block.input?.file_path) {
          (thread.editedFiles ||= new Set()).add(block.input.file_path)
        }
      } else if (block.type === 'thinking' && block.thinking) broadcast(thread, 'thinking', { text: block.thinking })
    }
    return
  }
  if (evt.type === 'stream_event' && evt.event) {
    const e = evt.event
    if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta?.text)
      broadcast(thread, 'delta', { text: e.delta.text })
    if (e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta')
      broadcast(thread, 'tool_delta', { partial: e.delta?.partial_json })
    return
  }
  if (evt.type === 'user' && evt.message?.content) {
    for (const block of evt.message.content)
      if (block.type === 'tool_result')
        broadcast(thread, 'tool_result', { content: typeof block.content === 'string' ? block.content.slice(0, 400) : '[structured]' })
    return
  }
  if (evt.type === 'result') {
    broadcast(thread, 'status', { phase: evt.is_error ? 'error' : 'done', durationMs: evt.duration_ms, cost: evt.total_cost_usd, usage: evt.usage })
    return
  }
}

function spawnTurn({ threadId, prompt, model, isFirstTurn }) {
  const thread = getOrCreateThread(threadId)
  thread.turns += 1
  const turnNo = thread.turns
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode', 'bypassPermissions',
  ]
  if (isFirstTurn) args.push('--session-id', thread.sessionUuid)
  else args.push('--resume', thread.sessionUuid)
  if (model) args.push('--model', model)

  const logPath = join(LOG_DIR, `v4-${threadId}-turn${turnNo}.log`)
  const out = createWriteStream(logPath, { flags: 'a' })
  const startMs = Date.now()
  out.write(`[${new Date(startMs).toISOString()}] turn=${turnNo} model=${model || 'default'} firstTurn=${isFirstTurn}\nPROMPT: ${prompt}\n---\n`)

  // Strip CLAUDECODE so the child `claude -p` is never treated as nested.
  const childEnv = { ...process.env, AGENTATION_WORKER: `agentation-v4-${threadId.slice(0, 8)}` }
  delete childEnv.CLAUDECODE
  delete childEnv.CLAUDE_CODE_SESSION_ID

  const child = spawn(CLAUDE_BIN, args, { cwd: PROJECT_CWD, stdio: ['ignore', 'pipe', 'pipe'], detached: false, env: childEnv })
  thread.currentChild = child
  broadcast(thread, 'status', { phase: 'spawning', turn: turnNo, pid: child.pid })

  let buf = ''
  child.stdout.on('data', (chunk) => {
    out.write(chunk)
    buf += chunk.toString()
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
      const evt = parseLine(line); if (evt) projectEvent(thread, evt)
    }
  })
  child.stderr.on('data', (chunk) => out.write(chunk))
  // A spawn failure (e.g. non-executable binary -> EACCES) emits 'error'; without
  // this handler Node crashes the whole bridge process (launchd then crash-loops).
  child.on('error', (err) => {
    out.write(`\n[spawn error] ${err.code || ''} ${err.message}\n`)
    broadcast(thread, 'status', { phase: 'error', error: err.message })
    if (thread.currentChild === child) thread.currentChild = null
    completed++; active--; pump()
  })
  child.on('exit', (code) => {
    const endMs = Date.now()
    out.write(`\n[${new Date(endMs).toISOString()}] exit=${code}\n`)
    out.end()
    if (thread.currentChild === child) thread.currentChild = null
    let logBytes = 0; try { logBytes = statSync(logPath).size } catch {}
    try {
      appendFileSync(METRICS_FILE, JSON.stringify({
        threadId, turn: turnNo, model: model || 'default',
        startMs, endMs, durationMs: endMs - startMs, exit: code, logBytes,
      }) + '\n')
    } catch {}
    completed++
    active--          // free the concurrency slot
    pump()
    if (thread.cancelledByUser) { thread.cancelledByUser = false; return }
    broadcast(thread, 'status', { phase: code === 0 ? 'done' : 'error', exit: code })
    // V-28 build gate: a headless child can't screenshot-verify, so typecheck
    // the touched files and fire ONE self-correct turn if the edit broke them.
    if (BUILD_GATE && code === 0 && thread.editedFiles?.size && !thread._gateRetried) runBuildGate(thread)
  })
  return { pid: child.pid, logPath }
}

// Post-edit typecheck gate. Filters tsc output to files the child TOUCHED (so
// pre-existing project errors don't false-trigger); on a real regression it
// enqueues one --resume turn feeding the errors back. Slot is already freed,
// so the ~tsc time doesn't block concurrency.
function runBuildGate(thread) {
  thread._gateRetried = true
  const basenames = [...(thread.editedFiles || [])].map((f) => f.split('/').pop())
  broadcast(thread, 'build-gate', { phase: 'checking', files: basenames })
  const tsc = spawn(TYPECHECK_CMD, { cwd: PROJECT_CWD, shell: true })
  let out = ''
  tsc.stdout.on('data', (d) => (out += d))
  tsc.stderr.on('data', (d) => (out += d))
  tsc.on('exit', (code) => {
    // FAIL-CLOSED: if the typecheck command itself failed to run (non-zero exit
    // with NO "error TS" lines -- e.g. npm E401 registry auth, tsc not found,
    // bad -p path), do NOT report "pass". A crashed typecheck was silently
    // greenlighting every edit (2026-07-23: `npx --no-install tsc` E401'd before
    // tsc ran, so broken imports reached the browser). Surface it instead.
    const produced = /error TS/.test(out) || /\bFound \d+ error/.test(out) || out.includes('Compilation complete')
    if (code !== 0 && !produced) {
      broadcast(thread, 'build-gate', { phase: 'error', reason: 'typecheck did not run (registry/binary/path?)', detail: out.split('\n').filter(Boolean).slice(0, 4) })
      return
    }
    const errLines = out.split('\n').filter((l) => /error TS/.test(l) && basenames.some((b) => l.includes(b)))
    if (!errLines.length) { broadcast(thread, 'build-gate', { phase: 'pass' }); return }
    broadcast(thread, 'build-gate', { phase: 'fail', errors: errLines.slice(0, 20) })
    const fixPrompt = `The edit you just made introduced TypeScript errors in files you touched. Fix ONLY what you broke — do not redo the whole task:\n\n${errLines.slice(0, 30).join('\n')}`
    enqueueTurn({ threadId: thread.id, prompt: fixPrompt, model: DEFAULT_MODEL, isFirstTurn: false })
  })
}

// Enqueue a spawn behind the concurrency gate. Fire-and-forget: the HTTP
// response returns immediately (below) with the threadId; the real pid is
// broadcast on the SSE `spawning` event once the slot frees. (v4 fix: do NOT
// await the slot in the request handler — under load that blocked the POST
// past the client timeout while the work ran fine server-side.)
function enqueueTurn(opts) {
  queue.push(() => spawnTurn(opts))
  pump()
}

const server = http.createServer(async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'POST' && req.url === '/save') {
    const chunks = []; for await (const c of req) chunks.push(c)
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch {}
    const record = { ts: Date.now(), url: body.url || '', element: body.element || '', comment: body.comment || '', savedOnly: !!body.savedOnly, threadId: body.threadId || null }
    const dedupeKey = `${record.element} :: ${record.comment}`
    const prevSave = RECENT_SAVES.get(dedupeKey)
    if (prevSave && record.ts - prevSave < SAVE_DEDUPE_MS) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, deduped: true })); return
    }
    RECENT_SAVES.set(dedupeKey, record.ts)
    for (const [k, t] of RECENT_SAVES) if (record.ts - t > SAVE_DEDUPE_MS) RECENT_SAVES.delete(k)
    try { appendFileSync(INBOX_FILE, JSON.stringify(record) + '\n') }
    catch (e) { res.writeHead(500); res.end('inbox write failed: ' + e.message); return }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, inbox: INBOX_FILE })); return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, variant: 'v4-oneshot', port: PORT, cwd: PROJECT_CWD, claudeBin: CLAUDE_BIN, concurrency: CONCURRENCY, active, queued: queue.length, completed, threads: THREADS.size }))
    return
  }

  const sseMatch = req.method === 'GET' && /^\/stream\/([^/?#]+)/.exec(req.url || '')
  if (sseMatch) {
    const threadId = sseMatch[1]
    // ?live=1 subscribes to future events only (no history replay). The patched
    // popup persists past turns to localStorage itself, and replaying old deltas
    // into a new turn's stream would concatenate old+new replies. Default keeps
    // the replay for any consumer that reconstructs from the stream alone.
    const liveOnly = /[?&]live=1/.test(req.url || '')
    const thread = getOrCreateThread(threadId)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'connection': 'keep-alive' })
    if (!liveOnly) for (const h of thread.history) res.write(`event: ${h.event}\ndata: ${JSON.stringify(h.data)}\n\n`)
    thread.sseClients.push(res)
    req.on('close', () => { thread.sseClients = thread.sseClients.filter((c) => c !== res) })
    return
  }

  const cancelMatch = req.method === 'POST' && /^\/cancel\/([^/?#]+)/.exec(req.url || '')
  if (cancelMatch) {
    const threadId = cancelMatch[1]
    const thread = THREADS.get(threadId)
    if (thread?.currentChild) {
      thread.cancelledByUser = true
      try { thread.currentChild.kill('SIGKILL') } catch {}
      broadcast(thread, 'status', { phase: 'cancelled' })
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, cancelled: !!thread?.currentChild })); return
  }

  if (req.method === 'POST' && (req.url === '/annotate' || req.url === '/')) {
    const chunks = []; for await (const c of req) chunks.push(c)
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch {}
    const annotations = Array.isArray(body.annotations) ? body.annotations : []
    const rawComment = body.comment || annotations.map((a) => a?.comment || '').filter(Boolean).join('\n---\n') || ''
    const { prompt: ccStripped, ccModel: parsedCc } = parseCcPrefix(rawComment)
    const { prompt: parsedPrompt, wantHistory } = parseCtxPrefix(ccStripped)
    const ccModel = body.ccModel || parsedCc
    const pageUrl = (body.pageUrl || body.url || req.headers.referer || '').trim()
    // Rich per-annotation block (2026-07-28). The one-line form carried only the
    // component chain, which cannot distinguish sibling nodes -- the user hit this
    // asking to remove one of three <li> value points and the agent had to decline
    // rather than guess. elementText + siblingIndex/siblingTexts come from the head
    // guard's clicked-target capture and ARE the disambiguator; keep them first in
    // the block so they are read before the component chain.
    const fmtTarget = (a, t) => [
      `- ${a.element || '?'} @ ${a.elementPath || a.cssClasses || '?'}${a.boundingBox ? ` (${Math.round(a.boundingBox.width)}x${Math.round(a.boundingBox.height)})` : ''}`,
      t?.elementText ? `  text: "${String(t.elementText).slice(0, 400)}"` : null,
      t?.siblingIndex && t?.siblingCount > 1
        ? `  position: ${t.elementTag || 'node'} ${t.siblingIndex} of ${t.siblingCount} siblings`
        : null,
      Array.isArray(t?.siblingTexts) && t.siblingTexts.length > 1
        ? `  siblings:\n${t.siblingTexts.map((s, i) => `    ${i + 1}.${i + 1 === t.siblingIndex ? ' <-- CLICKED -->' : ''} ${s}`).join('\n')}`
        : null,
      t?.ariaLabel ? `  aria-label: ${t.ariaLabel}` : null,
      t?.domChain ? `  dom: ${t.domChain}` : null,
      t?.outerHTML ? `  markup:\n    ${String(t.outerHTML).slice(0, 600).replace(/\n/g, '\n    ')}` : null,
    ].filter(Boolean).join('\n')
    const elementLines = annotations
      .map((a) => fmtTarget(a, a && (a.elementText || a.domChain) ? a : body.target))
      .join('\n')
    const fullOutput = typeof body.output === 'string' ? body.output.trim() : ''
    const history = wantHistory ? historyDigest(annotations[0]?.element || body.element || '') : null
    // WEAK-ELEMENT GUARD (2026-07-28). Sometimes agentation cannot resolve the
    // clicked node to a React component and the element identifier degrades to a
    // bare className (observed: "border border"). The child is then left with the
    // URL as its only locator -- and in the artboard view (v=artboard) the hash
    // names the last-visited SINGLE frame, not the frame the user clicked, so it
    // confidently identifies the wrong screen. Detect the degraded case and say so.
    const primaryElement = annotations[0]?.element || body.element || ''
    const weakElement = !elementTokens(primaryElement).length
    const artboardView = /[?#&]v=artboard/.test(pageUrl)
    const sections = [
      'You are running as /agentation-cc -- the user clicked an element in their running dev app and routed the comment through the agentation-bridge. Act on the user comment using the page + annotation context below.',
      pageUrl ? `Page: ${pageUrl}` : null,
      elementLines ? `Annotation:\n${elementLines}` : null,
      weakElement
        ? `WEAK ELEMENT IDENTITY: agentation could not resolve the clicked node to a React component -- the identifier above ("${primaryElement.slice(0, 60)}") is just a class/tag string and does NOT tell you which screen or component was clicked.${artboardView ? ' The page is in ARTBOARD view (v=artboard), where the URL hash (m=/s=) names the last-visited SINGLE frame, NOT the frame the user clicked -- do NOT use it to identify the target.' : ''} Do not guess a component from the URL. Ground yourself in the ANNOTATION HISTORY below and the words of the user comment (they usually name the thing, e.g. "the see more layout"); grep the lab directory for the named screen. If you still cannot pin the target to one file with confidence, ASK a single clarifying question and make NO edits -- a confident wrong guess costs more than one round-trip.`
        : null,
      fullOutput ? `[agentation full output]\n${fullOutput}` : null,
      // Hard rule against the recurring "state defined but not shown in the artboard"
      // miss: an artboard state lives in TWO places -- the mode file (states[] +
      // render map) AND the artboard row config (a separate file, e.g.
      // PerkboxTrsLab.tsx, where each row lists `frames: [{ stateId, ... }]`).
      // Defining a state does NOT make it appear in the artboard. If the user asks
      // for a new screen/state/variant to be visible in the artboard, you MUST add
      // its stateId to a row's frames[] too, then VERIFY it renders in the artboard
      // view (v=artboard / "All screens"), not just at the direct #s=<id> viewer URL.
      'ARTBOARD COMPLETENESS RULE: If your change adds or modifies a screen/state/variant that should appear in the artboard, fix BOTH paths -- (1) the mode file (states[] + render map) and (2) the artboard row config (frames[] in the lab file). A state that is defined but not placed in a row renders nowhere in the artboard. Before claiming done, confirm the new frame is visible in the v=artboard view, not only the #s=<id> single-frame viewer.',
      // Complexity routing: a fresh one-shot dispatch tends to under-invest on hard
      // asks (new component, multi-file refactor, several new states, ambiguous spec).
      // Tell the agent to escalate itself to the everyday build router in those cases.
      'COMPLEXITY ROUTING: If this task looks hard -- a new component or screen, a multi-file change, several new states/variants, an ambiguous or underspecified brief, or anything you cannot confidently one-shot -- invoke /errday and let it route you to the right build skill (cr2 / loop-zero / etc.) with the proper harden-and-verify loop. For small local edits (copy, colour, padding, a single prop), just do it directly.',
      history ? `ANNOTATION HISTORY (${history.matched ? 'same-component' : 'recent, no component match'}, oldest first). You run fresh per annotation -- this digest IS your session context. If the user says "earlier", "the session", "still", or references a prior change, ground yourself here (and in git log --oneline checkpoints) instead of replying that you have no history:\n${history.lines}\n\nFull log: ~/.claude/agentation-inbox.jsonl (JSONL, one record per line) -- read it directly for deeper history.` : null,
      `User: ${parsedPrompt || '(no comment provided)'}`,
    ].filter(Boolean)
    const fullPrompt = sections.join('\n\n')

    const threadId = (body.threadId || randomUUID()).toLowerCase()
    getOrCreateThread(threadId)
    const isNewThread = THREADS.get(threadId).turns === 0
    // Fire-and-forget enqueue; respond immediately so the POST never blocks on
    // a busy concurrency gate. Client follows progress via the SSE stream.
    enqueueTurn({ threadId, prompt: fullPrompt, model: ccModel || DEFAULT_MODEL, isFirstTurn: isNewThread })

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ threadId, accepted: true, model: ccModel || DEFAULT_MODEL, queued: queue.length, active, sseUrl: `/stream/${threadId}` }))
    return
  }

  res.writeHead(404); res.end('not found')
})

server.listen(PORT, () => {
  console.log(`[agentation-bridge v4-oneshot] listening on :${PORT}, cwd=${PROJECT_CWD}, concurrency=${CONCURRENCY}, claudeBin=${CLAUDE_BIN}`)
})
