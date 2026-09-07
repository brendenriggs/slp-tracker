# Handoff — four things shipped, and she can now read what changed

**Written:** 2026-09-07 01:18 UTC · **Branch:** `main` · **HEAD:** `6c32329` ·
**Previous handoff:** `2026-09-07-0013-carol-ann-interview-and-two-fixes.md`

---

## Start here

**Nothing is half-done.** Four commits shipped and pushed; `main` is clean and level with
`origin`, suite **444/444**. A fresh session picks its next task rather than resuming one.

Brenden picked three items off the previous handoff's "what could come next" list — the two
small builds and the parked cleanup — and asked mid-session for a fourth thing that was not
on any list: a changelog she can read. All four are done.

Read `docs/AUTONOMY.md`, as always. **One of its constraints changed this session** — see
"A rule was rewritten" below.

## What shipped

Reasoning is in the commit bodies. Read those rather than re-deriving.

- **`c55cc16`** — `attendanceGrid` derives only the rows on screen. The item parked across
  four handoffs.
- **`4b23869`** — the ad-hoc session button on Today, `v1.9.0`.
- **`4ce36fa`** — the changelog behind the footer version stamp.
- **`6c32329`** — a slot's time as three edits, `v1.10.0`.

`docs/BACKLOG.md` carries the design notes for each; three of its entries moved to **done**.

## The one thing to absorb

**Editing a slot can now rewrite history, through exactly one door.** The old rule was
absolute — "the template is not history" — and two of the three new acts still obey it. The
third, **Fix a typo**, is her own answer of 2026-09-06: the group was always at 09:30 and she
typed 09:00, so the sessions written under that time were never held then either.

What keeps the three from fighting each other: **a correction only touches sessions still
carrying the slot's old time.** A session she moved on its own holds a time she chose, and is
not a copy of the typo. Without that rule, Fix a typo would silently undo Move… with nothing
on screen to say so. It has its own test.

`docs/AUTONOMY.md` and `CONTEXT.md` both say this now. **Do not widen it and do not add a
second path that reaches back.**

## Three findings worth more than the fixes

**Look at the screenshot, not just the suite — again.** Two of this session's tests exist
because a capture showed what nine green tests could not: `Add session` and `Cancel` abutted
at 0px and read as one run-on control. Measured with `getBoundingClientRect`, per
`AUTONOMY.md`. The same pass caught the slot-time form's explanation pushing the rest of
Monday off the screen at her real caseload.

**A test that passes the moment you write it still proves nothing.** The eight changelog
tests went green on the first run, because the implementation was already in the file. They
were written first, but never *watched* failing — so the implementation was stashed
(`git stash push -- index.html`), the probe re-run, and eight distinct failures observed
before it came back. Cheap, and the only way that run means anything.

**Read the probe's summary line, not its head.** The changelog probe was declared green off
the first twelve lines; the full suite then failed on `shell.test.js`, which pinned the
version stamp's exact text. `tail -2` on a probe run costs nothing.

## The version numbering is deliberate

**1.9.0** (ad-hoc button + changelog) and **1.10.0** (the three time edits) are two releases
in one evening on purpose: the changelog names one shipment per version, and a release that
bundled unrelated work would read to her as one change she cannot find.

`tests/changelog.test.js` now enforces the pairing — **the top changelog entry must equal
`SLP.version`**, so a bump with nothing written for her fails the suite. The old pin in
`tests/attendance-ui.test.js` still forces the bump to be a deliberate act.

## State, verified

`main` at `6c32329`, tree clean, level with `origin` (confirmed after push). Suite
**444/444, 0 failed** — run twice at the end, once for failures and once for the summary.
431 before this session's last commit, 413 before it began.

`main` is served live by GitHub Pages, so all four commits are at
https://brendenriggs.github.io/slp-tracker/ now. **Promotion has not happened and is not
yours to do** — `tmp/note-for-her.md` stays unsent. See `docs/DELIVERY.md`, which gained a
paragraph this session: nothing announces a release to her, so an update worth knowing about
still has to be mentioned by Brenden.

Running the suite wipes the app database; restore from `tmp/slp-test-data.json` through the
backup UI. Settled — do not re-raise. **It was run repeatedly this session, so the local
database is currently wiped.**

## What could come next

Nothing here is assigned.

- **The requirement model** — still the big build, designed in
  `docs/adr/0004-service-requirements-and-attempt-based-debt.md` and not started. Brenden
  deferred it twice now, both times in favour of small wins. Scope it with him first; it is
  a design conversation before it is a ticket.
- **Per-student column colour** — the surviving idea from her log photo, deferred not
  rejected. A conversation, not a ticket.
- **A residual, deliberately unfixed:** during a render the search field does not exist for
  ~2.4ms, so a keystroke landing inside that window is still lost. Not reachable by a human.
  Do not "fix" it without evidence it bites.

**Blocked on her:** `docs/OPEN-QUESTIONS.md` still has three. School-closed days cannot ship
without question 1; the missed-session placement should not be built to the guess in
question 3.

## Do not re-open

- **Transposing the grid** is rejected (Brenden, 2026-09-04). Recorded in `AUTONOMY.md`.
- **Today's collapse-by-default** is confirmed — she loves it.
- **`Owed` staying in minutes is deliberate for now.** It belongs with the requirement model,
  not with a label change. See ADR 0004.
- **The changelog is not a notification.** No banner, no badge, no dialog, nothing on load.
  That was the brief, word for word, and it is pinned.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -5              # 6c32329 on top
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 444 tests, 0 failed (~2 min)
```

## Tools in `tmp/` worth reusing

`tmp/` is gitignored and local to this machine.

- **`tmp/run-probe.sh <page.html>`** — one standalone test page in headless Chrome, ~20s
  against the suite's ~2min. Three probe pages exist now, each loading only the test files a
  feature touches: **`tmp/att-slide.html`** (attendance), **`tmp/adhoc-probe.html`** (today +
  schedule + slot-time), **`tmp/changelog-probe.html`** (changelog + shell). **Read the last
  line, not the first ten** — see the findings above.
- **CDP screenshot drivers, all built from `cdp-shot-arrows.js` and all correct**: own port,
  `detached: true`, process-group kill, and the page's own count printed so a claim about her
  caseload can be checked. **`cdp-shot-adhoc.js`**, **`cdp-shot-changelog.js`**,
  **`cdp-shot-slottime.js`** (49 students, 20 slots, a written-up session). Copy whichever is
  closest and change the port.
- **`tmp/cdp-shot-glyphs.js` still has the stale-browser bug** and is still not fixed. Any
  caseload claim made through it is suspect.

**`--screenshot` cannot be used here.** It fires at the page's `load` event, before IndexedDB
seeding and the render, and produces a blank PNG. Drive CDP and capture on a readiness marker.

## One operational note

Brenden is often reading from his phone — short, scannable answers earn their keep. **Never
prefix a shell command with `cd`**: the harness blocks `cd … && git …` outright as a security
risk, and other `cd` chains trigger a permission prompt he has to answer by hand. Every tool
here takes a path: use `git -C <repo>` or absolute paths. His global `CLAUDE.md` says this,
but dispatched subagents do not reliably inherit it — **restate it in every dispatch prompt.**
Quote paths containing `(`, `)`, `[`, `]`. Do not write files via shell redirection or
`sed -i`; use the Write/Edit tools.

## Suggested skills

- **`superpowers:test-driven-development`** — all four commits were built red-green, and it
  is what caught the two layout defects and the `planForDate` sort bug. The stash trick above
  is how to recover a red when the implementation is already written.
- **`superpowers:verification-before-completion`** — the standing lesson held twice more this
  session. Assert computed values and sizes, and read the summary line of every run.
- **`superpowers:brainstorming`** — only if the requirement model is next. Brenden said it is
  a conversation first.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
https://brendenriggs.github.io/slp-tracker/. `tmp/` and `.superpowers/` are gitignored and
exist on this machine only.
