#!/usr/bin/env bash
# Starts the agentation bridge on :4747.
#
# The bridge is what turns an annotation into a code change: the toolbar POSTs the
# comment plus the element it was dropped on, and the bridge spawns one `claude -p`
# per annotation against THIS checkout, streaming the reply back into the popup.
#
# PREREQ: the `claude` CLI on PATH and logged in. Each annotation runs a real turn
# against your own Claude account — there is no shared server, and nothing leaves
# your machine except the turn you just asked for.
#
# The upstream project ships five bridge variants; only v4 (stateless one-shot:
# one child per annotation, concurrency-capped, no persistent worker to rot) is
# carried over here.
set -euo pipefail
cd "$(dirname "$0")"

export AGENTATION_CONCURRENCY="${AGENTATION_CONCURRENCY:-3}"
# Typecheck gate before an edit is accepted. Off by default because it costs a tsc
# run per annotation; set AGENTATION_BUILD_GATE=1 to turn it on.
export AGENTATION_TYPECHECK_CMD="${AGENTATION_TYPECHECK_CMD:-node_modules/.bin/tsc --noEmit -p tsconfig.app.json}"

echo "[bridge] v4 on :${PORT:-4747} — cwd=${AGENTATION_CWD:-$(pwd)} gate=${AGENTATION_BUILD_GATE:-off}"
exec node server.v4.mjs
