# Scoundrel — React + Vite

The game from [lrvillarreal/scoundrel-game](https://github.com/lrvillarreal/scoundrel-game/tree/8f46a06260ed9b71297cb2ed2abf997f0ddd0c5c), integrated into this React + TypeScript project. The original 44-card rules, responsive interface, illustrated cards, keyboard controls, dialogs, seeded dungeons, restart, scoring and browser saves are preserved.

## Run

Requires Node.js 20.19+, 22.13+, or 24+. Use a maintained Node.js LTS release.

```sh
npm install
npm run dev
```

Scoundrel uses `http://localhost:5178` for development and `http://localhost:4178` for production preview. These fixed ports avoid service workers left by other Vite apps on ports 5173/4173. A busy port stops startup instead of silently switching origins.

For reproducible installations from the lockfile, use `npm ci`. Vite is kept on
the supported 7.3 patch line, and jsdom 27.4 replaces the deprecated
`whatwg-encoding` dependency used by earlier jsdom releases. The React plugin
requires version 4.7 or newer in the 4.x line for Vite 7 compatibility.
ESLint 10 and React Hooks plugin 7 replace the unsupported ESLint 9 toolchain.
The npm install-script policy approves only the reviewed `esbuild@0.28.2`
installer; review the installer again when updating that version.

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

Deploy with build command `npm run build`, output directory `dist`, over HTTPS (localhost also works for testing).

## Install and play offline

Open the production app online once and wait for **Ready to play offline.** The entire app and all eleven artwork files are now cached, including cards you have not encountered. Gameplay, help, seeded runs, restarting, and saved progress work without a connection, including after closing and reopening the app.

Use your browser's **Install app** option on desktop or Android. On iPhone/iPad, use Safari's **Share → Add to Home Screen**. Installation is optional for offline play. Browser saves and offline files belong to this device and browser; clearing site data removes them. Browsers may reclaim stored data under storage pressure.

`public/manifest.webmanifest` provides standalone installation and regular, maskable, and Apple touch icons. `scripts/offline-plugin.mjs` generates `dist/sw.js` from the complete build, with a version derived from every file's contents. All required files must cache successfully before installation completes. Updates download in the background and wait until all game windows close; reopening then activates the new version. Cache cleanup is limited to this app's scope and leaves game saves intact. This follows the [service worker install/update lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Offline caching is enabled only in production builds, so `npm run dev` stays easy to edit. To test locally, run `npm run build` then `npm run preview`, open the localhost address, wait for the ready message, enable Offline in browser developer tools, and reload. You can then close and reopen the tab at the same address while offline. Your first visit needs an internet connection (or a locally running preview server); the app cannot download itself onto a device that has never loaded it.

`npm test` includes service worker regressions for complete precaching, failed installations, scope isolation, and offline navigation. `npm run test:offline` builds and runs a real-browser test for offline reload, decoding all eleven images, help, gameplay, saved progress, and reopening the app. On Windows it uses installed Microsoft Edge; elsewhere install the test browser once with `npx playwright install chromium`.

If another app's name or old `/assets/` bundle URLs appear, check the address and use the Scoundrel preview at `http://localhost:4178`. Service workers are shared by origin and scope, so reusing a port can display a previous project's cached HTML. `localhost` and `127.0.0.1` also have separate browser storage; use the same address every time.

For missing or outdated offline files, reconnect, open `/recover.html`, and click **Repair offline files**. The independent recovery page replaces an older worker and redownloads all required files, preserving saved games and unrelated caches. If an old worker intercepts even the recovery page, load it online with **Ctrl+Shift+R** first. Recovery activates an update explicitly; normal background updates still wait until the game windows close. The ready indicator now checks the actual worker identity and the complete cache before reporting success. A missing cached file gets a controlled 503 response instead of an unhandled fetch rejection.

## Rules

Start with 20 HP. Explore rooms of four cards, resolving any three and carrying the fourth onward. Avoid a full room only before choosing a card, and never twice consecutively. Resolve every card in a short final room.

Black cards are monsters, diamonds are weapons, and hearts are potions. A weapon reduces damage. Only a zero-damage weapon victory updates the non-increasing target limit, following the source implementation. Only the first potion in each room heals. Clear all cards to score your remaining HP; on defeat, score the negative total strength of unresolved monsters.
