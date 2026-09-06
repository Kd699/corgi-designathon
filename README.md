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

## Screenshots

In `docs/`: the budget app, and the environment in three states (steady, low mood,
high heart rate on Focus).
