# RPGtask

A cozy, installable **habit & task RPG** in the spirit of Habitica, with one big twist: you don't have to invent your own quests. An AI companion (powered by your own Mistral key, with a warm Cortana-ish personality) talks to you, pulls tasks/habits/dailies/rewards out of you, and sets them up for you.

- Static site, no backend. Runs entirely in your browser.
- Installable as a **PWA** (add to home screen on Android).
- All progress lives in **local storage** and, optionally, a **save file you choose** (`.rpgsave`) so you can sync across devices with any file-sync service.
- Warm, early-2000s **skeuomorphic** look, built almost entirely from CSS/SVG.

---

## Quick start (local)

Requires Node 18+.

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

Open the printed local URL. On first run you'll get a short welcome; from there you can add tasks yourself or open the companion.

## Connecting the AI companion (Mistral)

1. Get an API key from the Mistral console.
2. In the app, open **Settings** (gear, top-right) and paste the key into **Mistral API key**.
3. Pick a model (default `mistral-small-latest`; `mistral-large-latest` is smarter).
4. Tap the glowing round button (bottom-right) to chat. Tell it a goal ("help me build a morning routine") and it will create quests for you.

Your key is stored **only in this browser** (localStorage) on this device and is sent directly to Mistral when you chat.

### CORS note

Mistral's API has at times blocked direct browser calls (CORS). If chatting fails with a network/CORS error, add a **CORS proxy URL** in Settings. Two supported forms:

- A prefix ending in `=`, e.g. `https://corsproxy.io/?url=` (the request URL is appended, encoded).
- A template containing `{url}`, e.g. `https://my-proxy.example/?target={url}`.

If neither is set, the app calls `https://api.mistral.ai/v1/chat/completions` directly.

## Save files & syncing

RPGtask always keeps a local backup in your browser (IndexedDB). To make progress portable:

- On Chromium browsers (desktop, **Android Chrome**), Settings shows **New save file** / **Load save file**. These use the File System Access API to let you pick where your `hero.rpgsave` lives. The app then **auto-saves** to that file and reopens it next time.
- Put that file in a folder synced by Google Drive / Dropbox / Syncthing, and load the same file on another device to sync — just like copying an RPG save.
- On browsers without File System Access (e.g. iOS Safari), Settings shows **Export / Import .rpgsave** instead.

### The `.rpgsave` format

It's a small custom envelope: a header line `RPGTASK-SAVE/1` followed by base64 of a JSON payload:

```json
{ "magic": "RPGTASK", "version": 1, "savedAt": "…", "state": { /* character + tasks */ } }
```

Plain JSON is also accepted on load, so you can hand-edit if you like.

## Installing as a PWA (Android)

1. Deploy (below) or serve the build over HTTPS.
2. Open the site in Chrome on your phone.
3. Menu → **Add to Home screen / Install app**.

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy.yml`.

1. Push to a GitHub repo (branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow builds and publishes `dist/` on every push to `main`.

The Vite `base` is `./` (relative), so it works whether the site is at a domain root or a project subpath like `https://<user>.github.io/<repo>/`.

## Supplying your own art (placeholders)

Anywhere the app needs a real image, it shows a labeled placeholder until you provide a file. Drop files into `public/assets/` with these exact names:

| Slot            | File                          | Suggested size |
| --------------- | ----------------------------- | -------------- |
| Companion (big) | `public/assets/agent-portrait.png` | ~512×512   |
| Companion (fab) | `public/assets/agent-avatar.png`   | ~256×256   |
| Hero portrait   | `public/assets/hero.png`           | ~256×256   |

No code changes needed — rebuild and they'll appear. (Slots are defined in `src/assets/placeholders.ts` if you want to add more.)

## How the RPG loop works

- **Habits**: tap `+` (good) or `−` (bad) any number of times a day. Good gives XP + gold; bad costs HP.
- **Dailies**: recurring on chosen weekdays. Complete before the day ends or take damage at the next day's reset.
- **To-Dos**: one-off quests, optional due date and checklist.
- **Rewards**: things you buy with earned gold.
- Earning enough XP **levels you up**, which fully heals you and raises max HP. Difficulty (trivial→hard) scales rewards and damage.

## Project layout

```
src/
  state/     game types, Zustand store, scoring, daily cron
  save/      .rpgsave codec, File System Access, persistence wiring
  agent/     Mistral client, tool schemas, system prompt, chat UI
  components/ character bar, tabs, board, cards, sheets, toasts
  assets/    image placeholder registry
  styles/    the skeuomorphic stylesheet
```

## License

Personal project scaffold — do what you like with it.
