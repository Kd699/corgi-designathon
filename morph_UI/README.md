# Morph UI

Standalone Shape Lab text editor experiment. React + TypeScript + Vite; SVG surfaces morph as controls attach and detach. No backend or API keys.

## Run

```sh
cd morph_UI
npm ci
npm run dev
```

Open http://localhost:5400. `npm run build` checks TypeScript and creates `dist/`.

Drag horizontal or vertical sliders from the library to the editor. Horizontal controls change font size; vertical controls change line spacing. Docking adds space, Release detaches a control, and Remove deletes it. Two controls fit on each edge; the most recently added attached slider on each axis controls typography. Keyboard users can focus a library control and press Enter or Space to add it, then use Attach.

Writing and layout are session-only and reset on reload. The application is independent of the other folders in this repository.
