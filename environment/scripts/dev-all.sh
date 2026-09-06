#!/usr/bin/env bash
# One command: the annotation bridge on :4747, then the board on :5300.
#
# The bridge starts in the background and is killed when you stop the app (Ctrl-C).
# An existing bridge on :4747 is reused rather than duplicated.
#
# Board only, no annotation loop: `npm run dev:app`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_PID=""

cleanup() {
  if [ -n "$BRIDGE_PID" ]; then
    echo "[dev] stopping agentation bridge (pid $BRIDGE_PID)"
    kill "$BRIDGE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Re-apply the popup→bridge patch. Idempotent, and a reinstall silently drops it.
node "$ROOT/scripts/apply-agentation-patch.mjs" || true

if lsof -ti tcp:4747 >/dev/null 2>&1; then
  echo "[dev] agentation bridge already on :4747 — reusing it"
elif ! command -v claude >/dev/null 2>&1; then
  echo "[dev] 'claude' CLI not on PATH — starting the board WITHOUT the annotation loop."
  echo "[dev] You can still annotate and Save; nothing will act on it until you install"
  echo "[dev] Claude Code (https://claude.com/claude-code), run 'claude', /login, restart."
else
  echo "[dev] starting agentation bridge on :4747 (cwd=$ROOT)"
  AGENTATION_CWD="$ROOT" CLAUDE_BIN="$(command -v claude)" \
    bash "$ROOT/tools/agentation-bridge/start.sh" \
      >"$ROOT/tools/agentation-bridge/.dev-bridge.log" 2>&1 &
  BRIDGE_PID=$!
  echo "[dev] bridge pid=$BRIDGE_PID — logs: tools/agentation-bridge/.dev-bridge.log"
fi

echo "[dev] starting the board on :5300"
exec npx vite --port 5300
