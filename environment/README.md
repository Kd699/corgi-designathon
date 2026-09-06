# The daily open

Four directions for how loud a stateful environment should be about the read it has already
made, judged against the same four moments. Corgi Designathon.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5300 — the board is the landing page.

Node 18+ and nothing else. No API keys, no backend, no accounts.

## What you are looking at

**All screens** is the board: rows are moments, columns are the four directions, so every
direction is judged under identical signals. Wednesday is the row that matters — the ordinary
case is where restraint either works or reads as nothing.

**Full screen** is the live viewer. The frames there are real: rate a mood, answer the mascot,
switch objective, and `derive()` re-runs and the screen changes underneath you. Board frames are
deliberately inert so a grid frame can never drift off the scenario it is labelled with.

**Components** shows each real component on its own, against every scenario palette.

The URL carries the frame — `#m=<direction>&s=<moment>&p=mobile&v=artboard` — so a link you paste
into Slack opens on exactly the frame you meant. `#/app` is the escape hatch to the bare
environment shell: the same components with no board around them.

## Where things live

```
src/engine/derive.ts        the only place that decides what the environment looks like
src/engine/signals.ts       everything the environment is allowed to react to
src/ui/                     the real components (mascot, mood rater, breath, timer, prompts, Root)
src/pages/DailyOpenLab.tsx  the board — pure data, no rendering logic
src/pages/daily-open/       the four directions: config, scenarios, one shared renderer
src/components/v3artboard/  the board runtime (vendored, see below)
```

Adding a direction is one entry in `CONCEPT_CONFIG`. Adding a moment is one entry in
`SCENARIOS`. Neither touches the board file, and no renderer branches on a concept id.

## About the vendored runtime

`src/components/v3artboard/` and `src/components/dev-mode/` are copied from the project that
maintains them, so treat them as a dependency: change the lab, not the runtime. Three edits were
made to the copy, all noted in the files themselves — the chevron icon is inlined instead of
pulled from `@mui/icons-material`, the runtime's own self-test harness (`LossTest`) is left out,
and one unused type import was dropped so the stricter tsconfig here passes.

The board chrome renders in Work Sans. The source project uses Perkbox's licensed brand font,
with Work Sans as its declared fallback; the fallback is what ships here.
