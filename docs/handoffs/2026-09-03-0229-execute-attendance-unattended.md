# Handoff — everything is decided; execute without asking

**Written:** 2026-09-03 02:29 UTC · **Branch:** `main` · **HEAD:** `aed6b2a` ·
**Previous handoff:** `2026-09-03-0152-hosted-beta-and-plan-refresh.md`

---

## Start here

**Read `docs/AUTONOMY.md` first.** It is the standing charter for running here without
Brenden watching, and it replaces the practice of burying those rules in handoff prose.

**Brenden has explicitly asked that you start working with no further input from him.** Do
not ask clarifying questions, do not stop for approval between tasks, do not stop to report
progress. Every decision that was blocking unattended work was settled in the session that
wrote this handoff — nine of them, captured in `docs/adr/0001`–`0003`, `CONTEXT.md`,
`docs/AUTONOMY.md` and `docs/OPEN-QUESTIONS.md`. Do not re-open them.

Working tree clean, suite **256/256**, app **v1.6.0**, everything pushed.

## The work, in order

### 1. Patch the plan before executing it

`docs/superpowers/plans/2026-08-26-attendance-and-makeup-debt.md` has **not** been updated
for the decisions below. A subagent handed it as-is will build the wrong thing and will
halt at step zero. Fix the plan first, in one commit.

**Halts an agent immediately:**

- `plan:2514-2519` — the baseline gate expects `74db3e7` and **254 tests**. Reality is
  `aed6b2a` and **256**, and the plan says "if it is not 254/0, reconcile that first." Set
  it to the real numbers.
- **The clock.** Tasks 7 and 10 hardcode October 2026 dates (`plan:1288-1298`, `1311-1320`,
  `2296-2316`) while `attendancePct` drops `date > today`, so every one of those rows
  vanishes and the assertions die. **Pin the clock, do not rewrite the dates** —
  `w.SLP.ui.todayStr = () => '2026-10-31'` works because `todayStr` is a namespace export
  called per render. Rewriting dates into the past would silently destroy the
  future-exclusion coverage those tests exist to provide.
- `plan:1571-1589` (Task 7 Step 8) and `plan:2444-2453` (Task 10 Step 7) are written as
  human-in-the-loop gates. Replace them with the self-verification standard in
  `docs/AUTONOMY.md`: seed, measure, screenshot, **judge it yourself**, and collect the
  shots into one contact sheet for review.

**Correctness the plan gets wrong:**

- **Task 1 Step 5** patches only the early-return of `deriveAttendance` and never its delete
  branch (`index.html:521-523`), which destroys a booked makeup when she clears the note.
  Implement ADR 0002 and test it.
- **Task 9** makes slotless sessions routine, but `findSession` matches the first slotless
  session on a date, so two makeups on one day collide — and the task's own test seeds
  through that path (`plan:1962-1966`). Implement ADR 0001.
- `plan:1969-1972` asserts `deleteMakeup` cleans up, but only checks `sessions` and
  `attendance`; the `notes`/`datapoints` loop at `plan:2117-2121` is untested.
- `plan:807` guards at 400 days and never checks `from <= to`. Validate and toast.

**Product choices the plan left open or got wrong:**

- **Month band above the day row.** `plan:1455`/`1494-1495` render day-of-month only, so a
  quarter shows "1" three times. Brenden chose a second header row grouping by month.
- **Provisional styling** for a flagged percentage (`spec:174-175`) was dropped; `pctText`
  (`plan:1457-1464`) appends plain text and the CSS block (`plan:1396-1428`) has no style
  for it. Restore it.
- **Glyphs follow the spec** (`spec:215`): `Ⓜ` held makeup, `▫ᴹ` booked-unmarked. The plan
  uses a uniform superscript `M` (`plan:1477`).
- **Booking default** (`plan:2153`) hardcodes `11:00`. Use the student's own slot time,
  falling back to `11:00`. Flagged to her as question 4.
- **Error copy** at `plan:2174` must match the app's existing wording at `index.html:1302`:
  "The end time must be after the start."

**Known rough edges — handle, don't be surprised by:**
`plan:1690-1693` ships a deliberately non-functional ternary to replace by hand (noted at
`:1707`); `plan:1211-1216` fires an un-awaited render and will flake; `plan:1414` sets
`att-pct` to `min-width: 150px` against content like `78% · 7 of 9 · 3 uncharted`, so expect
overflow and catch it in the screenshot pass; `plan:1562` exports `SLP.ui.attendance` that
nothing consumes.

### 2. Three standalone fixes, straight to `main`

Each is complete and green on its own, so each lands on `main` as its own commit before the
branch opens.

- **The `deleteSlot` orphan** — `docs/BACKLOG.md` has the detail. `planForDate` rescues only
  `!s.slotId` (`index.html:613`); a session whose slot was deleted keeps a dangling `slotId`
  and disappears from Today while the toast promises it is untouched. Regression test
  required.
- **The chart ceiling** — ADR 0003. `index.html:2156` and the tick label at `:2169`, plus a
  dashed 100% criterion line. Note that `tests/aggregation.test.js:73-133` asserts only
  counts and `data-` attributes, never geometry, so **the suite is green on this bug today**
  and would stay green on a wrong fix. Add a `>100%` geometry test.
- **Scroll and collapse regressions** — two untested cases: `place` excludes `route.date`
  (`index.html:1123`), so paging to another day preserves the scroll offset; and content
  shrinking below the saved offset clamps her somewhere she was not looking. Write the tests
  first and let them tell you whether current behaviour is wrong. Also fix
  `tmp/measure-collapse.html:22` and the spec's stale `slp-tracker.html` references
  (`spec:69, 78-80, 112` → `index.html:453, 665, 503`).

### 3. Execute the plan on a branch

`git checkout -b attendance-stage-1`. Merge to `main` only when Task 10 is done and the
suite is green — `main` is served live, and keeping it coherent is what stops "is promotion
urgent?" from being a judgment you have to make. Use subagents for bounded task
implementation to protect context; hold plan state and review their work yourself.

## What you must not do

- **Do not promote.** Sending her the URL is Brenden's act alone. `tmp/note-for-her.md`
  stays unsent.
- **Do not answer `docs/OPEN-QUESTIONS.md` by inventing a default.** Commit `38fe57b`
  reverted an agent that over-reached exactly there. Where work had to proceed anyway, the
  assumption is already recorded in that file.
- **Do not design the slot-time edit.** It is gated on her answer to question 2.

## Two things worth knowing

**The attendance percentage rests on an unconfirmed definition, and the suite cannot detect
it.** Every fixture slot is 30 minutes, so minutes and session-count produce identical
numbers — the plan's seven tests "around minutes" prove nothing about the divisor. Question
1 in `docs/OPEN-QUESTIONS.md`.

**Headless screenshots work.** The failure earlier sessions blamed on headless was
`--virtual-time-budget`, which expires before IndexedDB callbacks run. The working command
is in `docs/AUTONOMY.md`. Layout, scroll position and async timing are this app's three
blind spots and a green suite is blind to all of them.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --short HEAD   # aed6b2a
git -C /home/brenden/dev/slp-tracker status --short           # expect clean
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh         # 256 tests, 0 failed (~2 min)
curl -sS -o /dev/null -w '%{http_code}\n' https://brendenriggs.github.io/slp-tracker/  # 200
ls /home/brenden/dev/slp-tracker/tmp/   # slp-test-data.json, gen-seed.js,
                                        # measure-collapse.html, note-for-her.md
```

Running the suite wipes the app database; restore from `tmp/slp-test-data.json`. Settled —
do not re-raise it.

## Suggested skills

- **`superpowers:subagent-driven-development`** — the plan names it, and Brenden asked for
  subagents specifically to protect context.
- **`superpowers:test-driven-development`** — every task is written red-first and insists
  each test is proven able to fail before being kept. That practice has caught a real bug in
  five consecutive sessions.
- **`superpowers:verification-before-completion`** — evidence, not assertions, and see the
  three blind spots above.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
the root. `tmp/` is gitignored and exists on this machine only.
