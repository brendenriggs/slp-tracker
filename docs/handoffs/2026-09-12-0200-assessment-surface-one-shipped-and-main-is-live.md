# Handoff — assessment surface one shipped, and `main` turned out to be production

**Written:** 2026-09-12 02:00 UTC · **Branch:** `main` · **HEAD:** `26a09b5` ·
**Previous handoff:** `2026-09-11-1646-assessment-timelines-requested.md`

---

## Start here, and read this before you believe any older handoff

Read `docs/AUTONOMY.md`. Its rules stand, and **one of them changed this session**.

**Promotion has happened. Carol Ann uses the live URL.** Brenden said so directly on
2026-09-11. Every handoff before this one says the opposite, and says `main` is a beta
nobody is looking at. That is wrong and it is now corrected in `docs/DELIVERY.md` and
`docs/AUTONOMY.md`, which are the current word.

What it costs you: **a push to `main` is a release to a working clinician**, live within
about ten minutes, with nothing for her to accept. Half-finished work goes on a branch.

## What shipped, pushed and live

Three commits worth knowing, all on `main` and pushed. The commit messages carry the
reasoning; do not re-derive it.

- **`6c9b112`** — assessment timelines, surface one, **v1.12.0**. The block on a student's
  page: order date in, due date 60 calendar days out, nine components each holding a date,
  and she closes the assessment herself.
- **`1e85c9c`** — the defect that release introduced, fixed. See below.
- **`26a09b5`** — the delivery and autonomy docs, corrected for the promotion fact.

Design and plan, both committed, both still accurate:

- `docs/superpowers/specs/2026-09-11-assessment-timelines-design.md`
- `docs/superpowers/plans/2026-09-11-assessment-timelines-surface-1.md`

## The mistake this session made, so the next one does not repeat it

I shipped 1.12.0 believing `main` was a beta. It raises `DB_VERSION` from 1 to 2, against
her real database.

**Her records were never at risk** — `tmp/cdp-upgrade-probe.js` confirms every store
survives 1.11.0 → 1.12.0 intact, note text included, and a backup written before the
upgrade still restores after it.

**But a tab she left open on 1.11.0 held the database at version 1 and blocked the upgrade,
and the tab she reloaded rendered a blank page.** No message. For someone whose records are
her job, blank looks exactly like having lost everything. `1e85c9c` fixes it three ways: an
open connection yields to a newer version, a refusal is a sentence she can act on, and boot
renders that sentence with a Reload button instead of rendering nothing.

**The suite is blind to this by construction.** Every test starts from a wiped database, so
no test has ever performed an upgrade. Two probes now exist and are the verification for any
future schema change:

- `tmp/cdp-upgrade-probe.js` — seeds the previous release, upgrades in place at one URL,
  checks every store.
- `tmp/cdp-twotab-probe.js` — an old tab against a new one, and what is actually drawn.

Both are gitignored and on this machine only. `docs/DELIVERY.md` names them under
"Changing the database shape, now that she is live".

**Still possible today:** a tab she has open on 1.11.0 right now will still block once,
because that version cannot carry the yielding handler. She then gets the message and
recovers by closing the old tab and reloading. Verified end to end.

## What is next: surfaces two and three

The design settles all three surfaces and Brenden asked for them **one at a time**. Surface
one is done. Neither of the others has a plan yet, and each needs its own.

- **Surface 2, the Assessments tab.** A fifth entry in `TABS`, open assessments only,
  soonest due first, overdue at the top because the sort puts it there. A row navigates to
  the student's page; the tab lists and sorts, it does not duplicate the editor. Its
  **Order an assessment** control needs a student picker, and students who already have an
  open assessment are absent from it rather than offered and refused.
- **Surface 3, the student list marker.** A due date beside the student in the caseload
  list. Nothing but a date and its urgency.

Both are specified in the design doc's "The three surfaces" section. Start at
`superpowers:brainstorming` only if the design's answer no longer fits; otherwise go
straight to `superpowers:writing-plans` against that section.

## What the code now has, so you need not go looking

All in `index.html`, one file.

- **Model** — `presetAssessmentComponents()` and the `assessment()` factory, beside
  `presetTrials`. The nine are **copied onto each record**, like `objective.fields`.
- **Store** — `assessments: ['studentId']` in `SCHEMA`; `DB_VERSION` is 2.
- **Derive** — `assessmentDue(assessment, today)` returns `{ dueOn, daysLeft, overdue, done,
  of }`. `today` is required, never defaulted. **60 appears in exactly one place**, so the
  open question about whether it varies is cheap to answer.
- **Repository** — `assessmentsForStudent`, `activeAssessment`, `orderAssessment`,
  `setComponentDate`, `finishAssessment` on `SLP.store`.
- **Backup** — `SCHEMA_VERSION` is 2, and `STORE_SINCE` versions the requirement: a file is
  checked against the stores that existed at the version **it** declares. Her version 1
  backup restores; a version 2 file missing a section is still refused by name.
- **UI** — `renderAssessment` in §ui.students, called unguarded by `renderDetail` as the
  first appended block. `SLP.ui.fatal(message)` in §ui.shell is the blank-page guard.
- **New token `--warn-ink` (#8a5a00, 5.93:1).** `--warn` is **3.64:1** and must never be
  used for text — the body font is 15px, so nothing here earns the large-text exemption.

## Two things noticed and deliberately not changed

- **The missed-chip colour disagreement is still open.** The attendance grid draws a miss in
  `--warn`; Today's chip for the same fact falls through to `--muted`. `--warn-ink` is the
  token they should converge to. Raised in the previous handoff, still not assigned.
- **A test hard-pins the app version.** `tests/attendance-ui.test.js:590` asserts
  `SLP.version` equals the current release, and has been hand-bumped on every release since
  1.7.0. Its name says Attendance, which it has had nothing to do with for five releases. I
  followed the convention rather than redesign it mid-release. Worth a decision.

## Still open, and hers to answer

`docs/OPEN-QUESTIONS.md` now holds four. Questions 1 and 2 are the old requirement-model
ones. Questions 3 and 4 are assessment questions and **neither blocks surfaces two or
three** — the design accommodates either answer and records what was assumed:

- Is 60 always 60, or does it vary by district, state or assessment type?
- Is the list of nine components fixed, or does she add to it?

Two other assessment questions were closed by Brenden this session and folded into the
design: the order always happens at the IEP meeting, so one date and one due date; and a
student may hold many assessments over time with exactly one active.

## State, verified this session

`main` at `26a09b5`, tree clean, level with `origin` (0/0). Suite **492/492, 0 failed**.

Verified beyond the suite, per `docs/AUTONOMY.md`: seeded at her real **49 students**, read
back from the page, on **mid-list** students, at 1280 and 760. Contact sheet with the one
uncertainty called out at the top is `tmp/assessment-contact-sheet.html`; shots are
`tmp/assess-*.png` and `tmp/twotab-blocked.png`.

The visual pass earned its keep: it found every date input sitting **475px** from the end of
its own label, which the green suite could not see. Fixed in `530e0a1`. The first version of
that assertion **passed against the bug** because it measured the label's box rather than
its text — the more useful half of the finding, and the reason the test now uses a range.

**The local app database is wiped** — the suite runs did it. Restore from
`tmp/slp-test-data.json` through the backup UI. Settled; do not re-raise.

Branch `assessment-timelines-student-block` is merged into `main` and can be deleted.
`attendance-stage-1` is older and was already there.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -3              # this handoff on top of 26a09b5
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 492 tests, 0 failed (~2 min)
```

Before shipping **any** change to `SCHEMA`, `DB_VERSION` or `SCHEMA_VERSION`, also run
`node tmp/cdp-upgrade-probe.js` against the previous release. The suite cannot answer that
question.

## Suggested skills

- **`superpowers:writing-plans`** — surfaces two and three each need their own plan against
  the design's "The three surfaces" section. Do not start at an implementation.
- **`superpowers:test-driven-development`** — the house style. Watch every test fail first;
  `throws()` alone proves nothing, so assert the message names what was rejected. And assert
  the computed thing, not a proxy for it: a class assertion passes against a rule that
  styles nothing, and a label's box passes against a label whose text is 475px away.
- **`superpowers:verification-before-completion`** — a green suite is blind to layout,
  scroll, timing, fixture size, and upgrades. Copy `tmp/cdp-shot-assessment.js` for the
  visual pass.

## One operational note

Brenden often reads from his phone — short, scannable answers earn their keep. **Never
prefix a shell command with `cd`**; every tool here takes a path (`git -C <repo>`, absolute
paths). Quote paths containing `(`, `)`, `[`, `]`. **Do not write files via shell
redirection, heredocs or `sed -i`** — use the Write/Edit tools; I slipped to `sed -i` once
this session and should not have. Dispatched subagents do not reliably inherit his global
`CLAUDE.md` — restate this in every dispatch prompt.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
https://brendenriggs.github.io/slp-tracker/ — **and she is reading it.** `tmp/` and
`.superpowers/` are gitignored and exist on this machine only.
