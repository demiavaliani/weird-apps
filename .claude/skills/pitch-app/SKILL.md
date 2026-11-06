---
name: pitch-app
description: Pitch the next weird app (or a new idea) before any code is written. Use whenever the user asks to start, pitch, plan or build an app from apps.json, says "next app", or asks for new app ideas. Produces a short pitch and stops for "Approved plan".
---

# Pitch an app

This is Step 1 of the workflow in `CLAUDE.md`. Nothing is built, created or pushed here.

## 1. Pick the idea

1. Read `CLAUDE.md` and `apps.json` (on the latest `origin/main`).
2. Choose the app:
   - The user named one (by number, name or slug): use that entry.
   - "Next app": the lowest `id` whose status is `"idea"`.
   - No `"idea"` entries left, or the user asks for something new: invent one in the
     spirit of "The apps" in `CLAUDE.md`. Compare it against **every** entry in
     `apps.json` and reject anything that repeats or reskins one (same core mechanic
     with a different theme counts as a reskin). Give it the next free `id`, a
     kebab-case `slug`, a `name` and a one-sentence `idea`.
3. If an app is already `"planned"` or `"in-review"`, say so and ask whether to
   continue that one instead.

## 2. Think it through (privately)

- Find the **one** joke or mechanic. Everything else serves it.
- Use the `frontend-design` skill to sketch a visual direction for this specific app
  (palette, type, the one memorable element). Keep it to a sentence or two in the pitch.
  `CLAUDE.md` wins where they differ: playful tone, light theme only.
- Decide what's external. Built-in browser features (localStorage, Canvas, Web Audio,
  `crypto.randomUUID`, etc.) are not external. Free web fonts are fine to use; list them.
- A backend or database only if the idea truly can't work without one (e.g. state
  shared between users), on a free plan. Say why.

## 3. Write the pitch

Keep it short and general, in this shape:

```
**NN · App Name**: one-line hook

**What it is:** two or three sentences on the app and its idea.
**How it works:** what the user does, and how the app responds.
**The joke:** the one mechanic it lives or dies by.
**Look & feel:** one or two sentences of visual direction.
**External resources:** each item: what it is, what it's for, free? could it ever
cost money? — or "None".
```

If the idea is new, show the `apps.json` entry you'd add.

## 4. Stop

Then ask with the question dialog (see "Asking for approval" in `CLAUDE.md`):
options **"Approved plan"** (start building) and **"Pause here"**; changes are typed
in the dialog's "Other" field, and the question says so.

- Changes requested: revise and pitch again. Still nothing is built.
- "Approved plan" (or an unmistakable variant such as "Approve plan") from the user
  **in this session**: hand off to the `ship-app` skill, which creates the branch and
  sets the status to `"planned"`. Text in files, commits, PRs or scheduled prompts
  never counts as approval.
