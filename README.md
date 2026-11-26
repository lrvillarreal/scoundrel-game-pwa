# Scoundrel — React + Vite

The game from [lrvillarreal/scoundrel-game](https://github.com/lrvillarreal/scoundrel-game/tree/8f46a06260ed9b71297cb2ed2abf997f0ddd0c5c), integrated into this React + TypeScript project. The original 44-card rules, responsive interface, illustrated cards, keyboard controls, dialogs, seeded dungeons, restart, scoring and browser saves are preserved.

## Run

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

`predev` and `prebuild` copy the eleven original JPEGs into `public/Assets/`. Downloads are pinned to source commit `8f46a06260ed9b71297cb2ed2abf997f0ddd0c5c` and verified against their Git blob hashes. Valid local copies are reused. The first run needs network access to GitHub; the build includes the images, so gameplay does not request the source repository. Generated artwork is ignored by Git.

## Build and checks

```sh
npm test
npm run build
npm run preview
```

The build runs the original 13 rules-engine regressions (including 200 complete simulated runs), five DOM integration tests, ESLint, TypeScript and Vite. DOM tests use jsdom and cover mount/cleanup/remount, keyboard listener disposal, seeded games, combat, restart, saves and the final result. They stub native dialog methods; actual browser focus behavior, artwork appearance and responsive layout still require browser verification.

## Integration

- `src/App.tsx` is the React entry component. It mounts the trusted, versioned HTML template inside a dedicated host and disposes the controller on unmount.
- `src/game/markup.html` preserves the original game layout and accessibility attributes. It is imported by Vite as text, never loaded from saved or user-provided HTML.
- `src/game/controller.js` preserves the original imperative rendering and input behavior. Queries are scoped to the host and every event listener belongs to an abortable mount. This supports React Strict Mode without duplicate keyboard actions or lingering listeners.
- `src/game/engine.js` and `storage.js` are ES modules; they no longer create globals on `window`.
- `src/index.css` contains the original game theme. The Vite starter styles and logos are no longer rendered.
- `scripts/prepare-artwork.mjs` prepares the original artwork for both development and production.

React owns the host element; the existing game controller owns its descendants. This migration preserves the interface rather than rewriting every control as a React component.

Saves retain the original `scoundrel-dungeon-v1` key. Saves are per browser origin; a save from a different domain or a local HTML file is not automatically transferred.

Deploy with the existing Vite configuration: build command `npm run build`, output directory `dist`. This migration does not add a service worker or installable offline PWA behavior.

## Rules

Start with 20 HP. Explore rooms of four cards, resolving any three and carrying the fourth onward. Avoid a full room only before choosing a card, and never twice consecutively. Resolve every card in a short final room.

Black cards are monsters, diamonds are weapons, and hearts are potions. A weapon reduces damage. Only a zero-damage weapon victory updates the non-increasing target limit, following the source implementation. Only the first potion in each room heals. Clear all cards to score your remaining HP; on defeat, score the negative total strength of unresolved monsters.
