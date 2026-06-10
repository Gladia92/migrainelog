# MigraineLog

Journal de migraines numérique. Sous-application du pack XYVEL Medical
(reste un projet 100 % indépendant : code, dépôt git et CI propres).

## Stack
- Vite + React 18 (entrée : `index.html` → `src/main.jsx` → `src/app.jsx`)
- Capacitor 7 pour Android (`android/`)
- Electron 28 pour desktop (`electron.js`, `preload.js`)
- Sync Google Drive : `gdrive.js` (desktop) / `src/gdrive-mobile.js` (mobile)

## Lancer
```bash
npm install
npm run dev            # web → http://localhost:5173
npm run electron:dev   # desktop
npm run electron:build # build desktop → out/
```
Android : `npx cap sync android` puis build via `android/` (voir `PLAY_STORE.md`).

## Identité
- appId : `com.migrainelog.app`
- Dépôt : https://github.com/Gladia92/migrainelog
- CI : GitHub Actions (déploie Pages + génère APK/AAB)

## Notes pour Claude Code
- Composant principal : `src/app.jsx` (gros fichier, ~58 Ko).
- Import sensible à la casse : `./app.jsx` (surtout PAS `./App`) — déjà corrigé une fois.
- Docs build/publication : `PLAY_STORE.md`, `docs/`.
