---
name: qa-app
description: Check a weird app against this repo's rules before it goes up for review - loads it in a headless browser at phone and desktop size under the /weird-apps/ subpath, and reports console errors, broken or external requests, horizontal scroll, missing alt text and names, keyboard focus, and blocked-storage crashes. Use after building or changing an app, or when asked to test or QA one.
---

# QA an app

Run from the repo root. `<folder>` is the app folder (e.g. `03-the-button-that-remembers`),
or `.` for the root launcher.

## 1. Browser checks

```bash
node .claude/skills/qa-app/qa.cjs <folder> --out <scratchpad>/qa
```

The script serves the repo under `/weird-apps/` (exactly like GitHub Pages, so
absolute paths break here too), then for a desktop and a phone viewport:

| Check | Result |
| --- | --- |
| Uncaught errors or `console.error` | FAIL |
| Failed requests (network error or HTTP 4xx/5xx) | FAIL |
| Requests to other hosts | WARN: must match the approved external resources |
| Horizontal scroll | FAIL |
| `<img>` without `alt` | FAIL |
| Buttons, links or fields without an accessible name | WARN |
| First Tab doesn't reach a control, or it has no visible focus style | WARN |
| Page errors when localStorage is blocked | FAIL |

It saves screenshots under `--out` (default: a temp folder; use the scratchpad so
the user can open them, never the repo) and exits non-zero if anything fails.
Needs Node and Playwright with Chromium. Look at the screenshots: the script can't
judge whether the joke lands.

The script only sees the first screen. For anything behind an interaction (a
result after typing, a second view), write a short extra Playwright step and repeat
the relevant checks there.

## 2. Code checks

Read through the app's files for:
- **Absolute paths:** `src="/…"`, `href="/…"`, `fetch("/…")`, `url(/…)`. Use relative paths.
- **External URLs:** every `http(s)://` must be an external resource from the
  approved pitch (or a plain outbound link the user clicks).
- **Frameworks or build steps** that weren't approved in the pitch.
- **Secrets:** API keys, tokens or passwords in frontend code.
- **Storage:** every `localStorage` access wrapped in `try/catch`, with sensible
  defaults when it's empty.
- **Reduced motion:** big or constant animation respects `prefers-reduced-motion`.

## 3. Report

Give a short list: what passed, each WARN/FAIL with the fix (or why it stays), and
the screenshot paths.
