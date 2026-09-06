# Motif + Signal Simulation

A standalone experiment: three animated characters driven by simulated signals.
Independent of the ShapeLab experiment in `environment/`.

## Run

```sh
cd motif+signal_simulation
npm ci
npm run dev
```

Open http://127.0.0.1:5301/.

Choose a scenario or adjust heart rate, mood, movement, time, idle, objective and
feedback. Shape, facial expression, motion and sound are derived together.
The four energy/pleasantness presets yield excited, tense, content and weary
expressions; extended idle closes their eyes. Each face blinks and glances at
its own pace. Press a character to wink. Enable sound to hear its current tone.
Reduced-motion preferences disable animation. Simulation inputs reset on reload.

`src/engine/buttonSpec.ts` defines the motif rules. `src/ui/CharacterFace.tsx`
renders expressions; `src/ui/ButtonCanvas.tsx` handles interaction and audio.
This app has its own dependencies, entry point and styles; it imports nothing
from ShapeLab or the budget app.

## Check

```sh
npm run typecheck
npm test
npm run build
```
