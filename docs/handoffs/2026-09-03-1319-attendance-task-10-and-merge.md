# Handoff — one task left, then the final review and the merge

**Written:** 2026-09-03 13:19 UTC · **Branch:** `attendance-stage-1` · **HEAD:** `ef7667a` ·
**Previous handoff:** `2026-09-03-0229-execute-attendance-unattended.md`

---

## Start here

**Read `docs/AUTONOMY.md` first** — the standing charter for running without Brenden
watching. It still applies unchanged. Everything below is already decided; do not re-open it.

Working tree clean, suite **359/359**, branch is 14 commits ahead of `main`, nothing pushed
yet (see "Push" below).

Tasks 1–9 of `docs/superpowers/plans/2026-08-26-attendance-and-makeup-debt.md` are done and
reviewed. **Task 10 is the only implementation work left**, then a final whole-branch review,
then the merge to `main`.

The full decision trail — every ruling, every deferred minor, why each was decided — is in
the SDD ledger at
`.superpowers/sdd/2026-08-26-attendance-and-makeup-debt/progress.md`. **Read it before
touching anything**; it is gitignored and local to this machine, so it will not survive a
fresh clone. Per-task briefs and implementer reports sit beside it.

## What is left

### 1. Task 10 — the same number on the student detail page

Brief: `.superpowers/sdd/2026-08-26-attendance-and-makeup-debt/task-10-brief.md`
(the plan's own text, extracted). It adds `SLP.ui.students.renderAttendance(container,
student)` inside the `ui.attendance` IIFE, and a call to it from `renderDetail`.

Two things the brief gets wrong or leaves stale:

- **Its line numbers are dead.** Everything moved. Locate by name with `grep -n`.
  `SLP.ui.students.renderAggregation` is the shape to match; `window.SLP = { version: ... }`
  is the version bump site.
- **Its Step 7 was rewritten** by the plan patch (`49235cb`) into a self-verification step —
  drive the loop yourself, screenshot it, judge it, and collect the shots into one contact
  sheet. It is **not** a hand-off to Brenden. Do not revert it to a manual checklist.

`pctText` and `pctProvisional` are lexically in scope — `renderAttendance` lives inside the
same IIFE. Do not re-export them; the dead `SLP.ui.attendance` export was deliberately
removed.

### 2. Final whole-branch review

`scripts/review-package <plan> $(git merge-base main HEAD) HEAD`, then dispatch
`superpowers:requesting-code-review`'s reviewer on the most capable model available. Point it
at the ledger's `minor (deferred)` and `Ruling:` lines so it can triage what must be fixed
before merge. ONE fix wave, one scoped re-review, then adjudicate residuals.

### 3. Merge to `main`

Only when Task 10 is done and the suite is green. `main` is served live by GitHub Pages.
**Do not promote** — giving Carol Ann the URL is Brenden's act alone, and
`tmp/note-for-her.md` stays unsent.

## Two things that will bite you

**Subagent dispatch is rate-limited.** The Task 9 review agent died on a monthly spend limit
(HTTP 429); the session limit resets 02:20 America/New_York. If dispatch still fails, do the
work inline rather than stalling — that is what I did for the Task 9 review, and the ledger
records exactly which checks I ran so the coverage is auditable.

**Fixture size is a blind spot, and it is not in `AUTONOMY.md`.** Twice now a feature passed
a green suite *and* a screenshot while being unusable at her real caseload. The marking
popover and then the booking form each rendered outside the grid; with a six-student fixture
they sat ~175px from the clicked row and looked fine, but at 49 students they land ~1200px
away — off-screen. She clicks and nothing appears to happen.

Both are fixed (row-anchored `<tr>` insertion, adjacency pinned by test). The rule that
should have prevented the second one: **controls in the attendance view anchor to the row
they act on**, and **screenshots must be taken at a realistic caseload, at the scroll
position she would actually be at.** A capture at scroll 0 cannot answer the question.

## Three things to fold back into `docs/AUTONOMY.md` before the merge

These are real corrections to the charter, learned this session. They belong in the durable
doc, not only here:

1. **The screenshot recipe is incomplete.** `--screenshot` fires at the page's `load` event,
   which precedes IndexedDB seeding and the render, so a cold capture can come out blank even
   without `--virtual-time-budget`. The working method is to drive Chrome over CDP and
   capture only after a readiness marker is set — see `tmp/screenshot-attendance.html` and
   `tmp/cdp-shot-task9.js`, plus the Task 7/8/9 reports.
2. **Fixture size belongs beside layout, scroll position and async timing** as a fourth blind
   spot a green suite cannot see.
3. **`throws()` catches any throw, including a `TypeError` from a missing function.** A test
   asserting only "it threw" proves nothing. The house convention is
   `tests/backup.test.js:152-168`; the attendance status tests now assert the message *names
   the bad status*, which is stronger.

## Open questions — still hers, do not answer them

`docs/OPEN-QUESTIONS.md`. One correction landed this session (`e8c107c`): question 1's
divisor was described as untestable, and that was wrong. The plan's own test *minutes, not
session count, decide the percentage* seeds a 30-minute held and a 60-minute missed session —
50% by count, 33% by minutes — and asserts 33. The assumption is pinned, so if she says
"sessions" the answer lands on that one test plus `attendancePct`'s arithmetic. The question
itself is untouched.

Question 4 (makeup default time) is implemented as the student's own usual slot time, falling
back to `11:00`. Recorded there as an assumption, not an answer.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --short HEAD   # ef7667a
git -C /home/brenden/dev/slp-tracker status --short           # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline main..HEAD # expect 14 commits
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh         # 359 tests, 0 failed (~2 min)
ls /home/brenden/dev/slp-tracker/.superpowers/sdd/2026-08-26-attendance-and-makeup-debt/
```

Running the suite wipes the app database; restore from `tmp/slp-test-data.json`. Settled —
do not re-raise it.

## Push

The branch has **not** been pushed. `main` was pushed earlier this session at `0b5789e`
(the plan patch plus the three standalone fixes). Push `attendance-stage-1` when you pick up,
so the work survives this machine.

## Suggested skills

- **`superpowers:subagent-driven-development`** — the ledger, briefs and reports are all in
  its layout; resume at Task 10 rather than starting a new workspace.
- **`superpowers:test-driven-development`** — every remaining test is written red-first, and
  proving a test red *for the right reason* has caught three real defects this session.
- **`superpowers:verification-before-completion`** — two features passed a green suite while
  being unusable. Evidence, not assertions, and look at the picture yourself.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `attendance-stage-1`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
the root. `tmp/` and `.superpowers/` are gitignored and exist on this machine only.
