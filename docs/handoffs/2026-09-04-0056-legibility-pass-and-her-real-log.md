# Handoff — Three legibility fixes shipped; her own log is now the reference

**Written:** 2026-09-04 00:56 UTC · **Branch:** `main` · **HEAD:** `dbc2116` ·
**Previous handoff:** `2026-09-03-2233-attendance-shipped-whats-next.md`

---

## Start here

**Nothing is half-done.** Three commits shipped and pushed; `main` is clean and level with
`origin`. A fresh session picks its next task rather than resuming one.

Read `docs/AUTONOMY.md` first. It gained four rules this session, all earned by defects
found here rather than reasoned about: focus restoration across a render, contrast floors
for deliberately quiet marks, one glyph never carrying two meanings, and CSS specificity
against the zebra rule.

The previous handoff's menu is now partly spent. Its six rulings and parked findings still
stand — do not re-derive or re-open them.

## What shipped

Three commits, each with its reasoning in the commit body — read those rather than
re-deriving:

- **`faae2bf`** — focus and caret survive a render. `doRender` tore `#app` down and restored
  `window.scrollY` but nothing restored focus, so she typed one letter into the caseload
  search and every letter after it was dropped (measured: 12 of 12).
- **`b7594a6`** — the two quietest marks were below the threshold of vision. The
  not-scheduled dot sat at 1.4:1. Fixing the unmarked square meant splitting it first:
  `attendanceGrid` emits `unmarked` for a past unrecorded session *and* a future scheduled
  one, and drawing both louder would have made every forward month a wall of false debts.
- **`dbc2116`** — cells sized to match her own log, checkbox vocabulary, hover/focus
  crosshair.

## The thing that changed how this work should be judged

**Brenden sent a photo of her actual attendance log** (a Google Sheet, one tab per month).
It is the best available specification and it settled several questions at once:

- Her cells are ~44x25 and full of mark. Ours were 16.3x25.8 — the sizing fix came from
  measuring hers, not from taste.
- Her vocabulary is **checkboxes**: an empty box she ticks. That is why `held` is now `☑`
  and `not recorded yet` is `☐`, and why the exceptions stayed non-box shapes — in her
  sheet the unusual days are a different *shape*, which is what makes them findable.
- **She has no "not scheduled" state at all.** Every cell in her grid gets a box. Ours
  draws `·` there. Not acted on, but worth knowing before designing anything in that area.
- Her grid is **transposed** (days down, students across) and **colours every student
  column**. Brenden explicitly deferred both. They are the two largest open ideas here.

If a future question is about how the grid should read, ask for the photo again rather than
guessing — `docs/AUTONOMY.md` says the clinician decides how her practice works, and this
photo is the closest thing to her answering.

## State, verified

`main` at `dbc2116`, tree clean, level with `origin` (confirmed after push). Suite
**392/392, 0 failed**. App version **1.7.0** — deliberately not bumped; `attendance-ui.test.js`
pins it as the minor bump that recorded Attendance shipping, and whether a patch bump is
worth relaxing that test is Brenden's call, raised and left with him.

`main` is served live by GitHub Pages, so all three commits are at the URL now.
**Promotion has not happened and is not yours to do** — `tmp/note-for-her.md` stays unsent.
See `docs/DELIVERY.md`.

## What could come next

Nothing here is assigned.

- **The transpose and the per-student colour** are the two ideas her photo raises and
  Brenden deferred, not rejected. Both are conversations, not tickets.
- **`attendanceGrid` still computes over the unfiltered caseload** — the parked minor from
  the previous handoff, untouched. The student detail page reads all 49 students to display
  one row; filtering `data.students` before the call fixes both sites.
- **Stage 2 (service targets, forward projection) is still blocked** on the clinician's IEP
  answer.
- **`docs/OPEN-QUESTIONS.md` has six**, question 6 being the freshest.
- **A residual, deliberately unfixed:** during a render the search field does not exist for
  ~2.4ms (worst 6ms measured), so a keystroke landing inside that window is still lost. At
  40ms and 100ms cadences zero were dropped — not reachable by a human. Do not "fix" it
  without evidence it bites.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -4              # dbc2116 on top
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 392 tests, 0 failed (~2 min)
```

Running the suite wipes the app database; restore from `tmp/slp-test-data.json` through the
backup UI. Settled — do not re-raise. That fixture seeds 1,123 attendance rows across all
four statuses plus null, and 30 makeups, so it does exercise the Owed column and the makeup
flow. Its `appVersion` field reads `1.2.0` and is stale, but it is write-only — restore
gates on `schemaVersion`, so ignore it.

## Tools left in `tmp/` that are worth reusing

`tmp/` is gitignored and local to this machine.

- **`tmp/run-probe.sh <page.html>`** — runs one standalone test page in headless Chrome,
  ~15s against the suite's ~2min. `tmp/att-only.html` and `tmp/focus-only.html` are
  single-file harnesses built on it. This is the fastest red/green loop in this repo.
- **`tmp/cdp-shot-glyphs.js`** — CDP screenshot driver seeded at 49 students, straddling the
  pinned clock so past and future render in one frame. Takes `W=`/`H=` for viewport
  (checked at 1400 and her 1280), dispatches a real mouse event for the crosshair, and
  dumps computed colours alongside the capture.
- **`tmp/measure-cells.js`** — prints the grid's real geometry. This is what turned "cells
  feel small" into "16.3px in a 1400px window with 500px spare".

**`--screenshot` cannot be used here.** It fires at the page's `load` event, before
IndexedDB seeding and the render, and produces a blank PNG — that happened again this
session despite the warning already being in `AUTONOMY.md`. Drive CDP and capture on a
readiness marker.

## One operational note

Brenden is often reading from his phone. **Never prefix a shell command with `cd`** — it
triggers a permission prompt he has to answer by hand. Every tool here takes a path: use
`git -C <repo>`, absolute paths, or `R=<repo>; cmd $R/file`. His global `CLAUDE.md` says
this, but dispatched subagents do not reliably inherit it — **restate it in every dispatch
prompt.** Quote paths containing `(`, `)`, `[`, `]`. Do not write files via shell
redirection or `sed -i`; use the Write/Edit tools.

## Suggested skills

- **`superpowers:brainstorming`** — the two live ideas (transpose, per-student colour) are
  design conversations, and its bounded path (short design in chat, then stop for approval)
  is what worked well this session.
- **`superpowers:systematic-debugging`** — both defects this session were found by
  reproducing and measuring first. The focus bug looked like a one-line CSS problem and was
  not.
- **`superpowers:verification-before-completion`** — three separate times this session a
  test passed against a broken implementation: the vacuous scroll guard, the redundant
  `preventScroll` pair, and the crosshair class assertion that survived the specificity
  bug. Assert computed values, and mutate the fix to prove the test can fail.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
the root. `tmp/` and `.superpowers/` are gitignored and exist on this machine only.
