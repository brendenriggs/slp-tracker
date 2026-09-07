# Handoff — Carol Ann answered six questions; two one-liners shipped from them

**Written:** 2026-09-07 00:13 UTC · **Branch:** `main` · **HEAD:** `16ccac5` ·
**Previous handoff:** `2026-09-04-2016-slide-arrows-shipped.md`

---

## Start here

**Nothing is half-done.** Two commits shipped and pushed; `main` is clean and level with
`origin`. A fresh session picks its next task rather than resuming one.

This session was mostly an *interview*, not a build. Brenden talked to Carol Ann live and
relayed her answers. Six of the seven standing questions were answered, and the answers
reshape the attendance model rather than filling gaps in it. **Read
`docs/adr/0004-service-requirements-and-attempt-based-debt.md` before touching attendance
code** — it is the design that came out of it, and it is not re-derived anywhere else.

Read `docs/AUTONOMY.md` too, as always.

## What shipped

Reasoning is in the commit bodies and ADR 0004 — read those rather than re-deriving.

- **`862ad58`** — the interview, folded into ADR 0004 (new), `CONTEXT.md`,
  `docs/BACKLOG.md` and `docs/OPEN-QUESTIONS.md`.
- **`16ccac5`** — two one-line behaviour changes, `v1.8.0`. `attendancePct` counts sessions
  instead of minutes; `makeupBalance` credits a makeup the child skipped.

## The model changed shape — this is the thing to absorb

The app knew one cadence: a `Slot` recurs weekly, every projection of it is a session she is
accountable for, and the child's number is held ÷ offered. **Her caseload is not shaped that
way.** The IEP has a frequency dropdown of *weekly* or *monthly* with a session count beside
it, so a child can need two sessions a month while sitting on four weekly opportunities.
That child scored 50% for a month in which she delivered everything the IEP asked, and the
provisional italics never cleared however caught up she was.

ADR 0004 has the full design. The four things most likely to trip a fresh agent:

- **Low-cadence students stay on the weekly schedule.** She wants to see where she *could*
  catch them. The weekdays they do not need become **Opportunities**, drawn as unused
  chances — not to-dos, not absences.
- **An Attempt is the child appearing on a session they were not scheduled for.** Holding
  their own regular session repays nothing, however well it goes.
- **What repays a debt is the attempt, not the attendance.** It clears when the child misses
  it or when she holds it — *not* when she misses it herself. One attempt settles a weekly
  student, two settle a monthly one.
- **Three percentages, all oriented so 100% is good**, and one of them is hers, not the
  child's.

## Two findings worth more than the fixes

**The pin worked exactly as designed.** `attendance-derive.test.js` asserted 33% on purpose
— minutes, not sessions — precisely so that answering the question would be a located edit
rather than an audit. That is how it played out: the answer landed in that one test and
nowhere else. **Keep writing pins like this one.** It is the second session running where a
deliberately-wrong assertion paid for itself.

**A test that passes the moment you write it has proved nothing.** One of the three tests
written this session went green immediately — it duplicated an existing guard at
`attendance-derive.test.js:94`. It was deleted rather than kept. A test never watched failing
is a comment with a runtime cost.

## State, verified

`main` at `16ccac5`, tree clean, level with `origin` (confirmed after push). Suite
**411/411, 0 failed** — run twice, once after the logic and again after the version bump.
409 before, plus two net-new.

`main` is served live by GitHub Pages, so both commits are at
https://brendenriggs.github.io/slp-tracker/ now. **Promotion has not happened and is not
yours to do** — `tmp/note-for-her.md` stays unsent. See `docs/DELIVERY.md`.

**Worth knowing:** she still cannot see any of this. She works from an emailed `file://`
copy, and her IndexedDB does not cross to the hosted origin. Promotion is a five-step
migration, not a bookmark change, and the hosted app **will look empty** when she first opens
it. `docs/DELIVERY.md` has the steps.

## The version question is answered

**1.8.0.** It had been raised three times unanswered; Brenden settled it this session. The
pin at `tests/attendance-ui.test.js` now reads *"a new tab or a change to her headline number
is a minor bump"*. It covers the slide arrows, which never got a number, plus this.

## What could come next

Nothing here is assigned. Roughly in order of value:

- **The requirement model** — the big build, designed in ADR 0004 and not started. Scope it
  with Brenden first; he explicitly deferred it tonight in favour of small wins.
- **Slot times are three actions, not one** — unblocked this session and it is *her own*
  09-02 complaint, the one where she retypes notes. Fix a typo (retroactive), move the group
  permanently, move a single session. See `docs/BACKLOG.md`.
- **An ad-hoc session button on Today** — she asked for it directly. The domain already has
  **Ad-hoc session** and `deleteSlot` already routes through it, so the model supports this;
  the affordance is missing. Note it repays debt as a side effect, per ADR 0004, and that is
  intended.
- **`attendanceGrid` still computes over the unfiltered caseload** — parked across four
  handoffs now, untouched. The student detail page reads all 49 students to display one row;
  filtering `data.students` before the call fixes both sites.
- **Per-student column colour** — the surviving idea from her log photo, deferred not
  rejected. A conversation, not a ticket.
- **A residual, deliberately unfixed:** during a render the search field does not exist for
  ~2.4ms, so a keystroke landing inside that window is still lost. Not reachable by a human
  at 40ms or 100ms cadences. Do not "fix" it without evidence it bites.

**Blocked on her:** `docs/OPEN-QUESTIONS.md` has three, down from six. School-closed days
cannot ship without question 1; the missed-session placement should not be built to the guess
in question 3.

## Do not re-open

- **Transposing the grid** is rejected (Brenden, 2026-09-04). Recorded in `AUTONOMY.md`.
- **Today's collapse-by-default** is confirmed — she loves it. It was question 3 for months
  and is now settled, not merely untested.
- **`Owed` staying in minutes is deliberate for now.** It looks like a label change and is
  not: `makeupDuration` (`index.html:1226`) sizes a proposed makeup from that figure and two
  screens print `owes N min`. It belongs with the requirement model.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -4              # 16ccac5 on top
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 411 tests, 0 failed (~2 min)
```

Running the suite wipes the app database; restore from `tmp/slp-test-data.json` through the
backup UI. Settled — do not re-raise. **It was run this session, so the local database is
currently wiped.**

## Tools in `tmp/` worth reusing

`tmp/` is gitignored and local to this machine.

- **`tmp/run-probe.sh <page.html>`** — one standalone test page in headless Chrome, ~15s
  against the suite's ~2min. **`tmp/att-slide.html`** loads both attendance test files and
  was the whole red/green loop this session. Its TAP line prints a test count, which is the
  cheap freshness check against a stale browser.
- **`tmp/cdp-shot-arrows.js`** — CDP screenshot driver seeded at 49 students, and **the one
  to copy from**. Own port, `detached: true`, process-group kill, prints the page's student
  count.
- **`tmp/cdp-shot-glyphs.js` still has the stale-browser bug** and is still not fixed. Any
  caseload claim made through it is suspect.
- **`tmp/measure-cells.js`** — prints the grid's real geometry.

**`--screenshot` cannot be used here.** It fires at the page's `load` event, before IndexedDB
seeding and the render, and produces a blank PNG. Drive CDP and capture on a readiness marker.

## One operational note

Brenden is often reading from his phone, and was mid-conversation with Carol Ann for much of
this session — short, scannable answers earned their keep. **Never prefix a shell command
with `cd`** — it triggers a permission prompt he has to answer by hand. Every tool here takes
a path: use `git -C <repo>` or absolute paths. His global `CLAUDE.md` says this, but
dispatched subagents do not reliably inherit it — **restate it in every dispatch prompt.**
Quote paths containing `(`, `)`, `[`, `]`. Do not write files via shell redirection or
`sed -i`; use the Write/Edit tools.

## Suggested skills

- **`superpowers:brainstorming`** — the requirement model is a design conversation before it
  is a ticket, and Brenden said so explicitly.
- **`superpowers:test-driven-development`** — both fixes this session were built red-green,
  and the red run doubled as the mutation check because it ran against the unmodified
  functions. Cheap and worth repeating.
- **`superpowers:verification-before-completion`** — the standing lesson from two sessions
  ago still holds: a contrast floor could not see a dropped CSS rule, and a screenshot "at 49
  students" was actually at 147. Assert computed values and sizes, and print what the page
  thinks it is showing.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
https://brendenriggs.github.io/slp-tracker/. `tmp/` and `.superpowers/` are gitignored and
exist on this machine only.
