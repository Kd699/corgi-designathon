# Spacetime - a stateful environment

Designathon repo. The idea in one line:

> Spacetime is not a chat app with themes. It is an environment whose state changes as **your** state, context and objective change.

A normal adaptive UI says "you selected X, so I show X". This one says "given what is happening right now, this is the environment you are in". And if the environment responds meaningfully to what you do, interacting with it becomes rewarding in itself.

## Run it

```
npm install
npm run dev        # http://localhost:5300
npm test           # rules tests
```

No keys, no backend. Open it on your phone on the same wifi and DeviceMotion feeds in for real.

## The five mechanisms

| Mechanism | What it does | Where in code |
|---|---|---|
| Mood | You rate 1-5; background, texture, type and headline shift | `MoodRater`, `deriveValence` |
| Passive inputs | Heart rate (simulated watch), motion (cursor / DeviceMotion), time of day, idle. Nothing to fill in | `src/engine/sources.ts` |
| Mascot | A persistent character whose state and motion react (calm, curious, alert, frazzled, asleep) | `src/ui/Mascot.tsx` |
| Objective | Settle / Focus / Wander / Root decide which components exist at all | `componentsFor` in `derive.ts` |
| Course correction | "Did the environment get it right?" yes/no nudges future reads, capped so it cannot override a fresh rating | `feedback` in `deriveValence` |

Root (press-R recursive questioning from the earlier CBT prototype) is included as one objective, with an offline mock question source.

## The one rule of the codebase

```
signals  ->  derive()  ->  EnvSpec  ->  render
```

`derive(signals)` in `src/engine/derive.ts` is the only place that decides what the environment looks like. It is pure (no DOM, no clock) and returns a spec with every visual axis as an explicit field: palette, texture, type, mascot, components, headline. Renderers read fields. They never look at raw signals and never branch on them.

So:
- Want a new visual reaction? Add a field to `EnvSpec`, compute it in `derive`, read it in a renderer.
- Want a new input? Add it to `Signals`, write a source hook, use it in `derive`.
- Want to tune the feel? Edit numbers in `derive.ts` and watch the Signals panel, which prints the reasons for every decision.

Tests in `derive.test.ts` pin the behaviours we care about (passive input alone changes the environment, objective decides components, feedback is capped).

## Open questions for the team

See `docs/BRIEF.md`. The big one: **which real-world signals should be allowed to change the environment without the user saying anything, and where is the line between "responsive" and "creepy"?**
