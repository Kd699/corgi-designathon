#!/usr/bin/env node
// Voice smoke test for /clouds: proves the mic pipeline works in a real
// Chrome with NO human at the keyboard.
//
//   npm run smoke:voice            (dev server on :5300 must be running)
//   BASE=http://localhost:5301 npm run smoke:voice
//
// Chrome is launched with its fake media stack pointed at a WAV of
// synthesised speech (macOS `say` → `afconvert`; a modulated tone if those
// are missing), so getUserMedia yields real audio without a permission
// prompt. The script clicks the motif, watches --cm-level and the five
// band vars climb, stops the session, and waits for the read to land —
// failing on any console error or page error along the way.

import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:5300";
const LINE =
  process.env.LINE ??
  "I slept badly and I'm feeling pretty anxious about the deadline, but the run this morning helped my recovery.";

function makeWav() {
  const dir = mkdtempSync(join(tmpdir(), "clouds-voice-"));
  const aiff = join(dir, "line.aiff");
  const wav = join(dir, "line.wav");
  try {
    execFileSync("say", ["-o", aiff, LINE]);
    // Chrome's fake capture wants 16-bit PCM WAV; 48k mono keeps it simple.
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", aiff, wav]);
    return wav;
  } catch {
    // No `say` (not macOS): 4s of a 180Hz tone with syllable-rate tremolo.
    const rate = 48000, seconds = 4, n = rate * seconds;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
    buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
      const s = (Math.sin(2 * Math.PI * 180 * t) * 0.6 + Math.sin(2 * Math.PI * 720 * t) * 0.3) * env * 0.6;
      buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
    }
    writeFileSync(wav, buf);
    return wav;
  }
}

const wav = makeWav();
if (!existsSync(wav)) throw new Error(`no wav at ${wav}`);
console.log(`[smoke] fake mic audio: ${wav}`);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
// Name the resource behind any "Failed to load resource" line, so a 404
// is actionable rather than a mystery count.
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
});

try {
  await page.goto(`${BASE}/clouds`, { waitUntil: "load" });
  const motif = page.locator('[role="button"][aria-label="Start voice"]');
  await motif.waitFor({ timeout: 20_000 });
  const before = await page.locator(".cm-mood-label").innerText();
  console.log(`[smoke] label before: ${JSON.stringify(before.trim())}`);

  await motif.click();
  await page.locator('[role="button"][aria-label="Stop listening"]').waitFor({ timeout: 5_000 });

  // Sample the level vars for ~4s; the WAV loops, so speech is always on.
  const peaks = { level: 0, bands: [0, 0, 0, 0, 0] };
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const s = await page.evaluate(() => {
      const el = document.querySelector(".cm-wrap");
      if (!el) return null;
      const cs = getComputedStyle(el);
      const read = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
      return { level: read("--cm-level"), bands: [0, 1, 2, 3, 4].map((i) => read(`--cm-b${i}`)) };
    });
    if (s) {
      peaks.level = Math.max(peaks.level, s.level);
      s.bands.forEach((b, i) => (peaks.bands[i] = Math.max(peaks.bands[i], b)));
    }
    await page.waitForTimeout(80);
  }
  console.log(`[smoke] peak --cm-level=${peaks.level.toFixed(3)} bands=[${peaks.bands.map((b) => b.toFixed(2)).join(", ")}]`);
  if (peaks.level < 0.08) problems.push(`sound not detected: peak --cm-level ${peaks.level.toFixed(3)} < 0.08`);
  if (peaks.bands.every((b) => b < 0.05)) problems.push("no frequency band moved — band vars are not being written");

  const during = await page.locator(".cm-mood-label").innerText();
  console.log(`[smoke] label while listening: ${JSON.stringify(during.trim())}`);
  if (!/listening/i.test(during)) problems.push(`label did not switch to Listening (got ${JSON.stringify(during)})`);

  // Stop, then the read must land — from the model or the local fallback.
  await page.locator('[role="button"][aria-label="Stop listening"]').click();
  await page.waitForFunction(
    () => !/listening|thinking/i.test(document.querySelector(".cm-mood-label")?.textContent ?? ""),
    null,
    { timeout: 20_000 }
  );
  const after = await page.locator(".cm-mood-label").innerText();
  const read = await page.locator(".cm-read").first().innerText().catch(() => "");
  const source = await page.locator("[data-read-source]").first().getAttribute("data-read-source").catch(() => null);
  console.log(`[smoke] label after: ${JSON.stringify(after.trim())} (source: ${source ?? "n/a"})`);
  console.log(`[smoke] read: ${JSON.stringify(read.trim().slice(0, 200))}`);

  // The page scrolls into the history: the motif stage is a full viewport
  // that fades as you go, the sky canvas stays fixed, the read is listed.
  const layout = await page.evaluate(async () => {
    const stage = document.querySelector(".cm-stage");
    const before = { stageH: stage?.getBoundingClientRect().height, docH: document.documentElement.scrollHeight };
    window.scrollTo(0, Math.round(innerHeight * 0.6));
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.querySelector("canvas");
    return {
      ...before,
      vh: innerHeight,
      scrollY,
      fade: stage ? getComputedStyle(stage).opacity : null,
      canvasTop: canvas?.getBoundingClientRect().top,
      history: document.querySelectorAll(".ch-card").length,
    };
  });
  console.log(`[smoke] layout: ${JSON.stringify(layout)}`);
  if (!layout.stageH || Math.abs(layout.stageH - layout.vh) > 2) problems.push(`motif stage is not one viewport tall (${layout.stageH} vs ${layout.vh})`);
  if (layout.docH <= layout.vh) problems.push("page does not scroll — no history below the motif");
  // The fade is 1 → 0 over the first 45% of a viewport; a short history may
  // not let the page scroll that far, so compare against what that scroll
  // position should give rather than demanding zero.
  const expectedFade = Math.max(0, 1 - layout.scrollY / (layout.vh * 0.45));
  if (layout.scrollY <= 0) problems.push("page did not scroll");
  else if (layout.fade == null || Math.abs(parseFloat(layout.fade) - expectedFade) > 0.06)
    problems.push(`motif fade off: opacity ${layout.fade} at scrollY ${layout.scrollY}, expected ~${expectedFade.toFixed(2)}`);
  if (layout.canvasTop !== 0) problems.push(`sky canvas scrolled with the page (top ${layout.canvasTop})`);
  if (layout.history < 1) problems.push("the session read did not join the history");
} catch (e) {
  problems.push(`script: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n[smoke] FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\n[smoke] OK — sound detected, no console errors, read landed.");
