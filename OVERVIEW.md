# Marathon — Project Overview

A technical and functional description of the application, intended as reference material for a presentation. Figures are taken from the source code as of this document's writing. Known gaps and limitations are listed in [Section 13](#13-known-limitations-and-gaps) rather than omitted.

---

## Table of contents

1. [What the application is](#1-what-the-application-is)
2. [Status and scope](#2-status-and-scope)
3. [Architecture](#3-architecture)
4. [Technology stack](#4-technology-stack)
5. [Game mechanics](#5-game-mechanics)
6. [The AI companion](#6-the-ai-companion)
7. [The bond system](#7-the-bond-system)
8. [Data persistence and save files](#8-data-persistence-and-save-files)
9. [Notifications](#9-notifications)
10. [User interface](#10-user-interface)
11. [Deployment and operations](#11-deployment-and-operations)
12. [Privacy and data flow](#12-privacy-and-data-flow)
13. [Known limitations and gaps](#13-known-limitations-and-gaps)
14. [Project metrics](#14-project-metrics)

---

## 1. What the application is

Marathon is a habit and task tracker built on role-playing game mechanics, in the same category as Habitica. Completing real-world tasks awards experience points and gold; neglecting them costs health. The character levels up, earns ranks, and unlocks cosmetic items.

The distinguishing feature is that task entry is conversational. Rather than filling in forms, the user talks to an AI companion called Leela, who creates and edits tasks on the user's behalf through function calling. The companion also initiates conversations on a schedule, asking what has been completed and what needs adding.

A second design decision is that the application has no user accounts and no application server. It is a static site. All data lives on the user's device, optionally in a save file that the user places wherever they like, which allows syncing through any existing file-sync service.

Two intended use characteristics follow from this:

- The user supplies their own AI API key, and pays for their own usage directly.
- There is no database of users, so there is nothing to breach and no hosting cost beyond static file serving.

---

## 2. Status and scope

This is a single-developer personal project, not a commercial product. It has one known user. There is no test suite, no error monitoring, no analytics, and no formal release process. The build type-checks and compiles; correctness beyond that has been verified by manual use.

The application is functional and in daily use. It is not hardened for a general audience: setup requires obtaining a Mistral API key and, for reliable notifications, deploying a Cloudflare Worker from the command line. Both steps are documented but neither is trivial for a non-technical user.

---

## 3. Architecture

The system has three deployable parts, only one of which is required.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (the entire application)                           │
│                                                             │
│  React UI ── Zustand store ── scoring / cron logic          │
│       │                              │                      │
│       │                              ├── IndexedDB backup   │
│       │                              ├── .rpgsave file      │
│       │                              └── localStorage       │
│       │                                   (settings)        │
│       │                                                     │
│       └── Agent layer ── tool dispatch ──> mutates store    │
│                    │                                        │
└────────────────────┼────────────────────────────────────────┘
                     │  HTTPS, user's own API key
                     ▼
            ┌──────────────────┐
            │  Mistral API     │   (required for the companion)
            └──────────────────┘

            ┌──────────────────┐
            │ Cloudflare Worker│   (optional; notifications only)
            │  + KV namespace  │
            └──────────────────┘
                     │  Web Push
                     ▼
            Browser push service (Google/Mozilla/etc.)
```

**Client.** A React single-page application served as static files from GitHub Pages. It contains all game logic, all persistence, and the agent's tool implementations.

**Mistral API.** Called directly from the browser with the user's key. Required for any companion functionality. The application works as a manual task tracker without it.

**Cloudflare Worker.** Roughly 340 lines of TypeScript, optional. Its only job is to hold Web Push subscriptions and send a notification at scheduled times so that check-ins arrive when the app is closed. It never sees task text, only a one-word board tag used to pick the notification copy. Without it, notifications only work while the app is open or recently backgrounded.

A significant architectural consequence: because the AI conversation runs in the browser, a push notification cannot deliver an AI-generated message. The notification is a fixed string; tapping it opens the app, which then calls Mistral and begins the conversation.

---

## 4. Technology stack

| Layer | Choice | Version |
|---|---|---|
| UI framework | React | 18.3 |
| Language | TypeScript | 5.6 |
| Build tool | Vite | 5.4 |
| State management | Zustand | 4.5 |
| PWA / service worker | vite-plugin-pwa (Workbox) | 0.21 |
| Markdown rendering | marked + DOMPurify | 18.0 / 3.4 |
| IndexedDB wrapper | idb-keyval | 6.2 |
| Icon rasterisation (build-time) | sharp | 0.35 |
| Push backend | Cloudflare Workers + KV | — |
| Web Push cryptography | webpush-webcrypto | — |
| Hosting | GitHub Pages via GitHub Actions | — |

There is no CSS framework and no component library. All styling is hand-written CSS in a single stylesheet. All iconography is inline SVG or Unicode glyphs, apart from the companion's face images.

---

## 5. Game mechanics

### 5.1 Task types

| Type | Behaviour | Distinguishing fields |
|---|---|---|
| **Habit** | Scored any number of times per day, up or down | `positive`, `negative`, `countUp`, `countDown` |
| **Daily** | Recurs on chosen weekdays; penalised if missed at rollover | `repeatDays`, `streak`, `checklist` |
| **To-do** | One-off, optional due date | `dueDate`, `checklist`, `completedAt` |
| **Reward** | Purchased with earned gold | `cost` |

All four share a title, notes, difficulty, tags, and an optional reminder time.

### 5.2 Difficulty

Difficulty is a single multiplier applied to experience, gold, and damage alike.

| Difficulty | Multiplier | XP per completion | Gold per completion | HP lost on failure |
|---|---|---|---|---|
| Trivial | 0.5 | 4–6 | 1.5–3.5 | 3.0–4.5 |
| Easy | 1.0 | 8–12 | 3.0–7.0 | 6.0–9.0 |
| Medium | 1.5 | 12–18 | 4.5–10.5 | 9.0–13.5 |
| Hard | 2.0 | 16–24 | 6.0–14.0 | 12.0–18.0 |

Rewards are randomised within these ranges. The formulas are:

```
xp   = round((8 + random×4) × difficultyMultiplier × xpBuff)
gold = round((3 + random×4) × difficultyMultiplier × 10) / 10
hp   = round((6 + random×3) × difficultyMultiplier × 10) / 10
```

There are no streak bonuses to experience or gold, and no diminishing returns on repeated habit scoring.

### 5.3 Levelling

Experience required to advance from level *L* is `round(25L + 2.5L²)`. Maximum health is `50 + (L−1)×5`. Levelling up restores health to full. There is no level cap.

| Level | XP to next level | Max HP |
|---|---|---|
| 1 | 28 | 50 |
| 5 | 188 | 70 |
| 10 | 500 | 95 |
| 20 | 1,500 | 145 |

### 5.4 Falling (reaching zero health)

Health reaching zero triggers a penalty rather than a game over. The character loses one level (minimum level 1), loses 20 percent of their gold, has experience progress reset to zero, and is restored to full health. The global day-streak also resets.

This can be triggered by scoring a negative habit or by accumulated overnight damage from missed dailies.

### 5.5 Daily rollover

A cron routine runs on app boot and whenever the tab becomes visible, skipping if it has already run for the current local date. For each daily that was scheduled yesterday and not completed, it applies damage and resets that daily's streak to zero. All dailies are then reset to incomplete for the new day.

The global day-streak increments only if every daily scheduled yesterday was completed. If any were missed and the user owns a Streak Shield, the shield is consumed and the streak is preserved, though the health damage still applies.

All dates use the browser's local timezone. There is no user-configurable timezone.

### 5.6 Ranks

Ranks are derived from level and drive the badge insignia shown in the character bar and as the user's chat avatar.

| Rank | Minimum level | Rank | Minimum level |
|---|---|---|---|
| Recruit | 1 | Warden | 15 |
| Operative | 3 | Centurion | 21 |
| Sentinel | 6 | Sovereign | 28 |
| Vanguard | 10 | Ascendant | 36 |

### 5.7 Economy: consumables and cosmetics

| Item | Cost | Effect |
|---|---|---|
| HP Potion | 25 gold | Restores 40 percent of maximum health |
| XP Charm | 40 gold | 1.5× experience until local midnight |
| Streak Shield | 60 gold | Consumed automatically to protect the day-streak once |

Cosmetics are purely visual: six accent colours (0 to 260 gold), three companion orb skins (0 to 240 gold), and three rank badge frames (0 to 220 gold). Purchasing an accent colour rewrites the application's CSS custom properties at runtime.

A daily gift can be claimed once per calendar day, either by the user or by the companion on their behalf. It yields an HP Potion 20 percent of the time, an XP Charm 12 percent of the time, and otherwise gold scaled by login streak (`5 + min(20, loginStreak × 2)`).

### 5.8 Achievements

Ten achievements are computed at display time from current statistics rather than stored.

| Achievement | Requirement |
|---|---|
| First Steps | Complete 1 mission |
| Getting Traction | Complete 10 missions |
| Centurion | Complete 100 missions |
| Consistent | Reach a 7-day streak |
| Unbreakable | Reach a 30-day streak |
| Enlisted | Reach level 5 |
| Seasoned | Reach level 15 |
| Force of Habit | Score habits 50 times |
| Veteran | Earn 5,000 total XP |
| Regular | Open the app 7 days running |

---

## 6. The AI companion

### 6.1 Model and integration

The companion calls `https://api.mistral.ai/v1/chat/completions` directly from the browser using the key stored in the user's `localStorage`. Three models are selectable: `mistral-small-latest` (default), `mistral-medium-latest`, and `mistral-large-latest`. Temperature is fixed at 0.6. Responses are not streamed.

Mistral has at times blocked direct browser calls via CORS. To handle this, Settings accepts an optional proxy URL in either prefix form (`https://corsproxy.io/?url=`) or template form (`https://proxy.example/?target={url}`).

### 6.2 Tool calling

The companion mutates game state through 30 declared tools. Each conversational turn runs a loop of up to six model round-trips, executing any requested tools and feeding the results back.

| Group | Count | Tools |
|---|---|---|
| Task creation | 4 | `add_habit`, `add_daily`, `add_todo`, `add_reward` |
| Reading state | 2 | `list_tasks`, `get_character` |
| Editing and completion | 9 | `update_task`, `uncomplete_task`, `set_reminder`, `edit_checklist`, `delete_task`, `complete_daily`, `complete_todo`, `score_habit`, `rename_adventurer` |
| Memory | 4 | `remember`, `update_memory`, `forget_memory`, `list_memories` |
| Follow-ups | 3 | `schedule_followup`, `list_followups`, `complete_followup` |
| Shared vocabulary | 5 | `set_codeword`, `set_energy_word`, `set_task_nickname`, `add_bit`, `list_signature` |
| Rituals and gifts | 3 | `claim_daily_gift`, `add_keepsake`, `write_sunday_letter` |

The editing group is what allows the companion to correct her own earlier work. If a task she created is wrong, she can revise it in place rather than deleting and re-adding.

### 6.3 Context injection

Every request prepends two system messages: the static persona prompt, and a runtime context block containing the character's stats, the local time of day, the current bond stage and its tone guidance, the shared vocabulary, the most recent mood if logged within two days, and up to 40 stored memories ranked by importance. If the user has not spoken to her in two or more days, that gap is stated explicitly so she can acknowledge it.

### 6.4 Persona constraints

The system prompt defines the character as capable and dry-witted rather than nurturing, and explicitly rules out therapist and girlfriend registers at the outset. A substantial portion of the prompt is negative constraint aimed at suppressing recognisable LLM writing patterns:

- No em dashes, in any form, and no double-hyphen substitute.
- No asterisk stage directions.
- No "it's not X, it's Y" reframes, no rhetorical self-questioning, no "here's the thing".
- No stacked three-part lists as a rhetorical device.
- Banned openers ("Certainly", "Absolutely", "I'd be happy to help") and banned closers ("I hope this helps", "feel free to").
- No emoji unless the user uses them first.
- Never references being an AI, a model, or having a knowledge cutoff.

Whether these constraints hold is a function of the model, and the smaller models follow them less reliably than the large one.

### 6.5 Emotion and quick replies

Each message begins with a hidden tag such as `[[happy]]`, drawn from seven emotions: neutral, happy, excited, thinking, surprised, sad, focused. The tag is stripped before display and used to swap the companion's portrait, which plays a brief glitch animation on change. Ten WebP portraits ship with the app; some emotions have two variants selected at random.

A message may also end with `[[chips: Yes | Not today | Remind me later]]`, which renders as up to four tappable quick replies beneath the latest message. This exists to reduce the typing burden during check-ins.

### 6.6 Proactive conversations

Four kinds of conversation are initiated by the application rather than the user.

| Type | Trigger | Shape |
|---|---|---|
| Scheduled check-in | User-configured times (default 09:00 and 20:00) | 3 to 5 short messages covering additions, completions, habits, and open items |
| Spontaneous check-in | 1 to 6 random times within a configured window | Single opening message |
| Nightly debrief | Manual button, available after 20:00 | 2 to 3 messages reviewing the day |
| Weekly review | Sundays after 10:00, if enabled | 3 to 4 messages summarising the week, plus a written letter |

Each is driven by a synthetic instruction that is sent to the model but never shown in the transcript. Multi-message replies are produced by having the model separate parts with `---`, which the client splits and displays with a 700 ms delay between messages.

Check-ins carry a three-hour late window: if the app was closed at the scheduled time, the check-in still runs when the app is next opened within that window.

### 6.7 Soft predictions

Before each check-in, the client scans the board for eight patterns and passes at most three to the model as suggestions to raise, framed as offers rather than instructions.

| Pattern | Condition |
|---|---|
| Overloaded board | 8 or more dailies active today |
| Broken streak | 1 to 3 active dailies with streak 0 and not done |
| Many broken streaks | More than 3 such dailies |
| Declining habit | A habit where negative scores exceed positive and are at least 3 |
| Single overdue to-do | Exactly 1 overdue open to-do |
| Multiple overdue to-dos | More than 1 |
| Weekday mismatch | A daily scheduled on 2 or fewer weekdays that keeps slipping |
| Empty board | Zero tasks after at least 2 conversations |

The intent is that suggestions come from deterministic analysis of real data rather than from the model inventing patterns.

### 6.8 Memory

The companion can store arbitrary facts about the user, categorised as person, preference, goal, wellbeing, milestone, joke, or other, with an importance from 1 to 3. Memories are saved into the game state, so they travel with the save file. Duplicate text is rejected case-insensitively. The user can view and delete every memory in Settings.

---

## 7. The bond system

Relationship progression is a deliberate, slow-moving mechanic rather than a chat-history side effect. A single score determines which of seven stages the companion is in, and the stage supplies tone guidance into her context on every request.

```
bondScore = daysKnown × 4 + min(totalInteractions, (daysKnown + 1) × 8)
```

The interaction term is capped at roughly eight conversations' worth of credit per day known. This is the mechanism that prevents a single long session from fast-tracking intimacy: talking twenty times in one day earns the same credit as talking eight times.

| Stage | Score | Tone |
|---|---|---|
| 0. New acquaintance | 0 | Friendly and capable, professional distance, no nicknames |
| 1. Warming up | 24 | Looser, teases more, still composed |
| 2. Familiar | 60 | Easy banter, in-jokes, occasional casual nickname |
| 3. Fond | 130 | Openly playful, affection visible but not romantic |
| 4. Affectionate | 240 | Tender, soft nickname, gentle romantic undertone |
| 5. Falling | 400 | Romantic, uses an endearment naturally |
| 6. Devoted | 600 | Partner-like, endearments throughout |

Because the maximum rate is 12 points per day and that requires eight conversations daily, the practical timeline is:

| Usage pattern | Points/day | Time to stage 4 | Time to stage 6 |
|---|---|---|---|
| Heavy (8+ conversations daily) | 12 | 20 days | 50 days |
| Moderate (3 conversations daily) | 7 | ~34 days | ~86 days |
| Light (1 conversation daily) | 5 | 48 days | 120 days |

Reaching a new stage triggers a milestone overlay and permanently files a short letter from the companion into the Service Record, giving the progression a visible artifact.

Alongside the bond, a separate "signature" layer accumulates shared vocabulary: a codeword, a shorthand word for low-energy days, per-task nicknames, and up to 30 saved in-jokes. These are injected into context but do not affect bond scoring.

---

## 8. Data persistence and save files

### 8.1 The `.rpgsave` format

A save file is a text file with a fixed header line, followed by base64-encoded JSON:

```
RPGTASK-SAVE/1
eyJtYWdpYyI6IlJQR1RBU0siLCJ2ZXJzaW9uIjoxLCJzYXZlZEF0Ijoi...
```

The decoded payload is:

```json
{ "magic": "RPGTASK", "version": 1, "savedAt": "2026-07-25T...", "state": { } }
```

The loader also accepts plain JSON, either as the same envelope or as a bare game state object, so files can be hand-edited. The base64 is encoding, not encryption; the file is not protected in any way.

### 8.2 Where data lives

| Data | Location |
|---|---|
| Game state (canonical backup) | IndexedDB, `rpgtask:state-backup` |
| Rolling backups | IndexedDB, `rpgtask:backups` |
| Save file handle | IndexedDB, `rpgtask:file-handle` |
| Push configuration for the service worker | IndexedDB |
| Settings, including the API key | localStorage, `rpgtask:settings` |
| Check-in bookkeeping | localStorage |
| Chat transcript | Memory only, lost on refresh |

Settings deliberately do not travel with the save file, so the API key stays on one device.

### 8.3 Save file handling

On Chromium browsers, including Android Chrome, the File System Access API lets the user choose where the save file lives. The handle is stored in IndexedDB and reused on later visits. Placing the file in a Drive, Dropbox, or Syncthing folder gives cross-device sync with no server involved.

Autosave is debounced at 700 ms after any state change and skips writes when the serialised state is unchanged. Browsers without the File System Access API, notably iOS Safari, get manual export and import instead.

Permission handling was a specific problem on installed Android PWAs, which repeatedly re-prompted for file write access. The resolution was to separate the silent check from the prompting one: boot and background autosave use `queryPermission` only and never prompt, while `requestPermission` is deferred to a one-shot handler attached to the next user tap. If permission is missing, the app keeps saving to the IndexedDB backup and reports a `needs-permission` status rather than failing silently.

### 8.4 Backups and conflict resolution

Up to ten rolling backups are kept in IndexedDB, taken at most once every ten minutes, each a complete encoded save. They are listed in Settings and individually restorable.

Because a file-sync service can modify the save file while the app also holds state, conflicts are detected by comparing the file's `updatedAt`, the IndexedDB backup's `updatedAt`, and a stored marker recording the last successful write. If both the file and the local backup have changed since that marker, the newer of the two wins and the user is told a conflict was resolved. This is last-writer-wins by timestamp, not a merge.

---

## 9. Notifications

### 9.1 Two delivery tiers

**Local, no backend.** Works when the app is open, and uses OS-level scheduled notification triggers where the browser supports them. A 30-second poll plus a visibility-change handler catches up on anything missed. This tier is unreliable when the app is fully closed, which is precisely when it is most needed.

**Web Push via the Cloudflare Worker.** Notifications arrive with the app closed. This requires the user to deploy the Worker, generate VAPID keys, and paste the Worker URL into Settings.

### 9.2 Local event pings

Five in-app events fire an OS notification, but only when the tab is hidden, since the toast system already covers the foreground case.

| Event | Condition |
|---|---|
| Level up | Character level increases |
| Streak milestone | Day-streak crosses a multiple of 7 |
| Low health | Health crosses below 20 percent |
| Reward affordable | A reward becomes purchasable that was not before |
| Dailies still open | Checked every 5 minutes after 20:00, once per day |

### 9.3 The Worker

Roughly 340 lines with six endpoints: `/vapidPublicKey`, `/register`, `/unregister`, `/test`, `/health`, and a cron handler. It stores only the push subscription, the check-in times converted to UTC, the spontaneous window configuration, a coarse board tag used to select notification copy, and firing bookkeeping to prevent duplicates. No task titles, no game state, no API key.

The cron runs every minute so that check-in times fire on the exact minute configured.

### 9.4 A quota problem worth mentioning

The original cron handler began each run with a KV `list()` call to enumerate subscriptions. Cloudflare's free plan allows 1,000 list operations per day, and a per-minute cron performs 1,440. The quota was exhausted around 16:40 UTC daily, after which the handler threw and all check-ins stopped until the quota reset at midnight. The symptom presented as notifications working in the morning and silently failing in the evening.

The fix was to keep the set of endpoints in a single index key and read that instead. Reads have a 100,000 per day budget on the same plan.

| Operation | Before | After | Free-plan limit |
|---|---|---|---|
| `list()` | 1,440 | 0 (one seeding call on first deploy) | 1,000 |
| `get()` | 1,440 | 2,880 | 100,000 |
| `put()` | 5–10 | 5–10 | 1,000 |

This is a reasonable illustration of a general point: the binding constraint on a free serverless tier is often not the one you expect, and exhausting it can fail silently rather than loudly.

### 9.5 Service worker

A custom script is imported into the Workbox-generated service worker. It handles push events, routes notification taps (a check-in tap focuses an existing window and posts a message that starts the conversation, or opens the app at `#checkin`), and handles `pushsubscriptionchange` by re-subscribing and re-registering with the Worker using configuration read from IndexedDB.

---

## 10. User interface

### 10.1 Layout

A single-column phone-first layout capped at 560 pixels, with no router. The shell consists of a title bar with three icon buttons, a character bar, a tab bar, the active board, and a floating button that opens the chat. Everything else is a bottom sheet or a full-screen overlay.

Four tabs cover Dailies, Habits, To-Dos, and Rewards. Eight sheets cover chat, settings, the Service Record, supplies, wardrobe, mood logging, task add/edit, and the first-run welcome.

### 10.2 Visual design

The aesthetic is AMOLED black with neon cyan, described in the stylesheet as a Tron-influenced glass skeuomorphism. Roughly 1,700 lines of hand-written CSS, about 47 KB. Recurring motifs are hexagons via `clip-path` and inline SVG, glass panels with inset highlights and HUD corner brackets, and glow through layered shadows.

Two performance decisions are worth noting, both made after the app proved slow on a mid-range phone:

- The animated background grid uses `transform: translate3d` rather than animating `background-position`, keeping it on the compositor.
- Glass panels use opaque gradients rather than `backdrop-filter`, which was expensive to composite over an animated background.

A `prefers-reduced-motion` block disables all animation and hides the scanline overlay.

### 10.3 Feedback

Toasts in four variants with undo on destructive actions, a level-up overlay, a "fallen" overlay when health hits zero, and a bond milestone overlay that displays the letter for the new stage. Agent messages carry a footer listing the tools that ran, so the user can see what was changed on their board.

### 10.4 Assets

Ten WebP companion portraits, generated externally and converted with a helper script. Application icons are SVG; the two notification icons are PNG, rasterised from the SVG by a build script because Android's notification shade ignores SVG. Face images are excluded from the service worker precache and served through a CacheFirst runtime rule capped at 80 entries for 30 days, since precaching them exceeded Workbox's size limit.

---

## 11. Deployment and operations

A GitHub Actions workflow builds on every push to `main` and publishes `dist/` to GitHub Pages. Vite's `base` is set to `./`, so the build works at a domain root or a project subpath without modification.

The workflow does not deploy the Cloudflare Worker. That is a separate manual step (`cd worker && npm run deploy`), as are the KV namespace creation and the VAPID secret. Changes to the Worker will not go live from a `git push`.

Running costs are the Mistral API usage, billed to the user's own key, plus free-tier Cloudflare Workers and free GitHub Pages hosting.

---

## 12. Privacy and data flow

**Stays on the device:** task data, statistics, memories, bond state, keepsakes, settings, the API key, and the chat transcript.

**Sent to Mistral on each conversational turn:** the API key as a bearer token, the persona prompt, the runtime context block (character stats, bond stage, memories, shared vocabulary, recent mood), and the conversation history. In practice this means the companion's context, including stored personal memories, does leave the device whenever the user talks to her. This is inherent to using a hosted model and is worth stating plainly rather than glossing.

**Sent to the Cloudflare Worker:** the push subscription endpoint and its encryption keys, the check-in times in UTC, the spontaneous window configuration, and a single coarse board tag. Nothing else.

The board tag is one word from a fixed set (`overdue`, `quiet`, `streak-risk`, `all-clear`, `comeback`, `missed-checkin`) and exists so notification copy can be about the right situation instead of a generic rotation. It carries no task titles, counts, or dates, but it is worth stating plainly that it is a non-zero amount of information about the user's behaviour, where previously the Worker held none. It is refreshed only when the client syncs, so it can lag the real board.

**Sent to the browser's push service:** the encrypted notification payload, which is a fixed string.

If the user places the save file in a synced folder, the file contents go wherever that service sends them.

---

## 13. Known limitations and gaps

### Functional

- **Chat history is not persisted.** Refreshing the page clears the transcript. Game state and memories survive; the conversation does not.
- **No conversation history truncation.** All messages in a session are sent on every turn, so a long session can exceed the model's context window with no client-side guard.
- **No cost controls.** No token counting, no spend cap, no `max_tokens` on requests.
- **Multi-day absences are under-penalised.** The rollover evaluates yesterday only. Returning after a week applies one day of missed-daily damage, not seven.
- **Uncompleting a task does not refund.** Marking a completed daily or to-do as incomplete decrements the completion count but does not reverse the experience, gold, or any level gained.
- **The nightly debrief is marked done before the API call.** A failed debrief still consumes the day.
- **Push can stay registered when notifications are OS-blocked.** If the user enables check-ins and then denies permission at the OS level, the server-side subscription is not removed.

### Platform

- **iOS is substantially degraded.** No File System Access API, so save files are export/import only, and Web Push support is limited. Check-ins effectively work only while the app is open.
- **Scheduled local notification triggers are Chromium-oriented.** Where absent, the app falls back to polling and catch-up.
- **The AI cannot generate the notification text.** Since the model runs in the browser, push notifications carry fixed strings from a small rotation.

### Accessibility

- Tabs use `role="tab"` but lack `aria-controls` and matching `role="tabpanel"`, so they are not correctly wired for screen readers.
- Checklist rows are clickable `<div>` elements with no keyboard handler or button role.
- No `focus-visible` styling outside form inputs, no skip link, and no live region for toasts or incoming chat messages.
- The companion's emotional state is conveyed only through an image marked `aria-hidden`.

### Code quality

- No automated tests of any kind.
- Some dead state: `Habit.value` is written but never read, `Daily.lastCompletedOn` is written but never read, and `Bond.lastTalkedAt` is used for context but not scoring.
- A minor inconsistency in mood recency checks, which read `createdAt` in one module and `date` in another.
- Three asset slots (`hero.png`, `agent-portrait.png`, `agent-avatar.png`) are registered but never rendered.
- The PWA manifest declares a `#checkin` shortcut that the hash router does not handle.
- No layout above 560 pixels; on desktop the app is a narrow centred column.
- The README still describes the earlier skeuomorphic design direction and an earlier name for the companion's persona, and is out of date in those respects.

---

## 14. Project metrics

| Measure | Value |
|---|---|
| TypeScript / TSX source | ~8,100 lines across 50 files |
| Stylesheet | ~1,715 lines, 47 KB, single file |
| Build and asset scripts | ~200 lines |
| Cloudflare Worker | ~340 lines |
| Runtime dependencies | 6 |
| Agent tools | 30 |
| Bond stages | 7 |
| Achievements | 10 |
| Ranks | 8 |
| Companion emotions | 7, across 10 image variants |

---

## Summary for presentation

The parts of this project that are genuinely worth discussing are:

1. **Conversational task entry as a friction reducer.** The premise is that the reason habit trackers get abandoned is the setup work, and that delegating it to a conversation removes that barrier. Thirty tools give the companion full read and write access to the board, including the ability to correct her own earlier entries.

2. **Local-first with no backend.** No accounts, no database, no hosting cost, and a save file the user physically controls. Sync is delegated to whatever file-sync service they already use. The trade-off is last-writer-wins conflict handling and a setup process that is harder than signing up for an account.

3. **A relationship mechanic gated on elapsed time rather than usage.** The score is dominated by days known, with conversation credit capped per day, specifically so that intimacy cannot be rushed. This was a direct response to an earlier version that became romantic within a single session, which read as false.

4. **Prompt engineering as negative constraint.** A large portion of the persona prompt exists to suppress recognisable LLM writing patterns rather than to describe the character. Its effectiveness varies by model.

5. **Notification delivery as the hardest problem in the project.** Getting a reminder to a closed PWA on Android required a service worker, a Web Push backend, VAPID keys, rasterised icons, subscription-rotation handling, and, ultimately, restructuring the storage access pattern to fit inside a free-tier quota that failed silently once exceeded.
