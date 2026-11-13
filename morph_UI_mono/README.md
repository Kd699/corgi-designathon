# Shape Lab Mono

A monochrome take on the Shape Lab text editor. The page is a body of ink on a grey field. Font-size and line-spacing controls move freely. As one comes close, the ink stretches toward it and merges; as it leaves, the ink separates. Nothing docks, and nothing snaps into a slot.

React, TypeScript, and Vite. No backend, no API keys. Positions, slider values, and writing live in component state and clear on reload.

This folder is independent of `morph_UI/` and the rest of the repository.

## Run

```sh
cd morph_UI_mono
npm ci
npm run dev
```

Open http://localhost:5480. A small Layout link opens `#/editor`, a second page for moving and resizing the pieces inside each gadget and each main body. Those edits are stored in this browser and used when you return to the demo. The body switch on the canvas changes the black surface between text, a button, a card, an image, a music player, a form, and a chart. Nearby gadgets still reach it.

`npm run build` writes `dist/`.

`npm run build` typechecks and writes `dist/`. The Vite `base` is `/`, so the build is meant to be hosted at a domain root. `npm run preview` serves that build on port 5481.

## How the interaction works

The field starts with only the text surface, set in a resting face (21px, 1.50 line spacing).

**Add a control.** Drag Font size or Line spacing out of the library, or focus one and press Enter or Space. A new font-size control starts at 36px. A new line-spacing control starts at 2.20. Those values are intentionally far from the resting face so the change is easy to see.

**Move it.** Drag the card itself. The slider is the only part of the card that does not move it. The control follows the pointer and stays at the coordinates where you release it. There are no edges to dock to and no grid to snap to. The text surface can be dragged by anything except the writing. If a release would leave an object hanging off the field, it is kept fully inside so it cannot be lost. A release in the interior is not adjusted.

**Watch the ink.** A control is a black body as soon as it leaves the library. Each one has a reach of about 156 pixels, measured as the gap between it and the surface. Inside that reach, pull rises on a smooth curve from 0 to 1, and a soft bridge welds the two black bodies together. Farther away, the bridge thins and disappears. The labels stay light on the black body.

**Read the type.** Font size listens only to horizontal controls. Line spacing listens only to vertical ones. Weight, tracking, and slant listen to their own instruments the same way: until nearby pull adds up to full strength, the resting face keeps the remaining share. The writing face is Roboto Flex, so weight and slant move smoothly.

The other instruments are spatial:

- **Weight** is a dial. Its angle runs from thin to black, and the ink bridge gets thicker as the weight does.
- **Tracking** is two linked dots. Pull them apart to open letter-spacing, push them together to tighten it.
- **Slant** is a lever. Its angle leans the letters toward oblique.
- **Gravity** pulls nearby words toward the blob.
- **Contrast** keeps words near the puck sharp and fades farther words toward grey.
- **Case** switches ABC, abc, or small caps when it is dropped on the text. The button on the card cycles the same three.
- **Wave** is a string. Pull the handle and the baseline ripples.
- **Eraser** fades words it passes over. Shake it back and forth, or press Restore, to bring them back.

Every card is labeled. Arrow keys still move a focused Move handle. A dial, pinch, lever, or string has its own slider keys, so those arrows change the value instead of the position.

## Keyboard

- Tab reaches the library, every Move handle, the sliders, Remove, and the nudge pad.
- Enter or Space on a library instrument places a control and moves focus to its handle.
- Arrow keys on a Move handle step 8px. Shift plus an arrow steps 32px.
- Delete or Backspace on a control’s Move handle removes it.
- The pad on the right nudges whatever is selected, in 16 steps, without a pointer.
- Sliders are native range inputs.

`prefers-reduced-motion: reduce` turns off transitions. Dragging is already 1:1 with the pointer, not an animation.

## Limits

- Reload clears the session. Nothing is stored.
- The ink is a filter, not a fluid simulation. Several overlapping controls become one heavy mass, and the neck between bodies is soft rather than a calculated curve.
- A control that sits on the writing covers those words. Cards stay above the text so they can still be grabbed.
- Keyboard movement is stepped. The pointer is continuous, and a pointer drop is not rounded onto those steps.
- The edge of the field is a wall. It is not a dock.
