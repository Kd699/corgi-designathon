# Brief (from Mhlengi's notes, 2026-09-06)

## Raw idea, lightly tidied

The emotional aspect has a few dimensions:

1. As you rate a mood, the background changes. The text changes. It becomes more interesting.
2. It is passive. It uses real-world inputs instead of you needing to stuff information into it. You just do stuff.
3. A mascot that changes its state.
4. UI components that change based on what your particular objective is in that moment.

These converge: Spacetime is not just a spatial chat. It is an environment whose state changes as your state, context and objective change.

Mechanisms:
- Mood -> changes the visual and emotional atmosphere.
- Real-world inputs -> the system changes without you explicitly feeding it information.
- Mascot -> a persistent character/state that reacts to what is happening.
- Objective -> determines which UI components appear and what the environment prioritises.
- Space -> the persistent structure tying everything together.

Then reinforcement: if the environment responds meaningfully to what you do, interacting with it can itself become rewarding.

Keep exploring this as a **stateful environment**, not prematurely a productivity app, journal, chat app or visualiser.

It needs to **course correct based on what it receives.**

Inputs named so far: passive smartwatch, ratings, scoring, textures, motion.

## Questions to answer this designathon

1. Which passive signals are allowed in, and which are off limits? (heart rate, motion, location, calendar, typing speed, screen time, ambient sound...)
2. What does "course correct" look like from the user's side? Right now it is a yes/no. Is that enough, or should the environment ask?
3. What is the mascot for? Companion, mirror, or narrator of the environment's state?
4. How does "space" persist? What survives between sessions and what resets?
5. What is rewarding here that is not a streak or a badge?
6. Where does a wrong read (the environment thinks you are fine and you are not) do harm, and how does the design fail safe?

## What the prototype does today

- Simulated watch (drag the slider), cursor/DeviceMotion, clock and idle feed in passively.
- Mood 1-5 rating.
- derive() turns those into palette, texture, type, mascot state, headline and which components exist.
- Four objectives: Settle, Focus, Wander, Root.
- Yes/no feedback nudges future reads (capped).
- Signals panel shows every number and the reasons for every decision, so tuning is a conversation, not a guess.

Screenshots: `shot-settle.png`, `shot-low-mood.png`, `shot-focus-high-hr.png`.
