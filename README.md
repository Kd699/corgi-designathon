# Corgi Designathon

Two things live here. Clone once, get both.

```
budget/        the Budget Management app  (the product)
environment/   the stateful-environment prototype  (the concept)
docs/          the brief, open questions, screenshots
```

## Run them

```
cd budget && npm install && npm run dev          # http://localhost:5173
cd environment && npm install && npm run dev     # http://localhost:5300
```

Both are React + TypeScript + Vite. No keys, no backend, no accounts.

## budget/ - the product

Decentralised budget management. People and departments hold points, budget flows
down a hierarchy, managers request and reclaim, and automation rules top people up
on a schedule.

- `src/App.tsx` is the orchestrator (it is large, ~2.8k lines).
- `src/store/budget.ts` is the zustand store: people, departments, allocation, automation rules, exceptions.
- `src/components/PrototypingOverlay.tsx` is the useful bit for a designathon. Buttons at the
  bottom of the screen switch you between Mhlengi (admin) and Morgan Freeman (manager),
  and between centralised and decentralised models, with no login.
- shadcn/radix primitives in `src/components/ui/`.

Carried over at the latest commit of the original repo, `e46a7f78c`. Two unreferenced
and syntactically broken files (`App.clean.tsx`, `App.new.tsx`) were moved to
`budget/attic/` so `npm run build` passes; see the note in there.

## environment/ - the concept

> Not a chat app with themes. An environment whose state changes as **your** state,
> context and objective change.

A normal adaptive UI says "you selected X, so I show X". This one says "given what is
happening right now, this is the environment you are in". Five mechanisms:

| Mechanism | What it does |
|---|---|
| Mood | You rate 1-5; background, texture, type and headline shift |
| Passive inputs | Heart rate (simulated watch), motion (cursor / DeviceMotion), time of day, idle. Nothing to fill in |
| Mascot | A persistent character that reacts: calm, curious, alert, frazzled, asleep |
| Objective | Settle / Focus / Wander / Root decide which components exist at all |
| Course correction | "Did the environment get it right?" nudges future reads, capped so it cannot override a fresh rating |

One rule holds the codebase together:

```
signals  ->  derive()  ->  EnvSpec  ->  render
```

`derive(signals)` in `environment/src/engine/derive.ts` is the only place that decides
what the environment looks like. Pure, no DOM, no clock. It returns a spec where every
visual axis is an explicit field. Renderers read fields and never branch on raw signals.

- New visual reaction? Add a field to `EnvSpec`, compute it in `derive`, read it in a renderer.
- New input? Add it to `Signals`, write a source hook, use it in `derive`.
- Tuning the feel? Edit numbers in `derive.ts`. The Signals panel prints the reason for every decision.

`npm test` in `environment/` pins the behaviours that matter (passive input alone changes
the environment, objective decides components, feedback is capped).

## Where they meet

That is the designathon question. The budget app is where money stress actually lives:
someone asking for budget, someone being told no, someone watching a number they do not
control. The environment layer is a way to make an interface respond to the state a
person is in while they do that, instead of presenting the same flat surface to everyone.

Open questions are in `docs/BRIEF.md`. The big one: which real-world signals should be
allowed to change the environment without the user saying anything, and where is the
line between responsive and creepy?

## The concept lab

```
cd environment && npm run dev
open http://localhost:5300/#/artboard
```

A V3Artboard lab for **the daily open** - the screen you land on when the environment already
knows you. Rows are scenarios, columns are four directions spread along one axis:
*how loud is the environment's read?*

| | |
|---|---|
| A · Weather | Never states the read. Atmosphere, mascot posture and which components exist are the whole message. |
| B · The read, stated | Leads with the guess and its evidence, correction directly underneath. |
| C · Mascot as narrator | The mascot carries the read and asks rather than asserts. |
| D · Quiet read | B's spine with C's manners. |

```
pages/DailyOpenLab.tsx        the spec: brand, sidebar, artboard rows, context cards
pages/daily-open/
  mode-config.ts              every cross-concept literal - labels, thesis, risk, correction wording
  scenarios.ts                the four daily-open Signals snapshots
  renderer.tsx                shared chrome written once + one layout per concept
  modes.tsx                   four ScreenModes generated from the config
components/v3artboard/        the shared runtime, ported in - do not edit per-lab
```

Bird's-eye is the grid; Viewer is one screen at full size and **live** - rate a mood, answer the
mascot, switch objective, and `derive()` re-runs. Artboard frames are deliberately inert so a grid
cell cannot drift off the scenario it is labelled with.

Every frame runs the real `derive()` and the real components, so the board cannot show something
the product would not do. Adding a direction is one entry in `mode-config.ts` plus one layout;
adding a scenario is one entry in `scenarios.ts`. Neither touches the shared chrome.

Two fields exist on `EnvSpec` for this board: `read` (the guess with its evidence named, so a wrong
read is arguable rather than mysterious) and `ask` (the correction phrased as a question). Both are
computed in `derive()`, because a concept that decided its own wording would stop being a projection.

Known limits of the ported runtime: no `componentFocus` widget isolation, no `SidebarItem.subgroup`
(the sidebar nests via one section per concept instead), no localStorage/URL-hash persistence, and
the Dev Mode toggle renders a placeholder rather than a wired inspector.

## Screenshots

In `docs/`: the budget app, the environment in three states (steady, low mood, high heart rate on
Focus), and `shot-artboard-daily-open.png` - the whole daily-open board.
