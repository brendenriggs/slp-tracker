# Handoff — Attendance is live on `main`; nothing is in flight

**Written:** 2026-09-03 22:33 UTC · **Branch:** `main` · **HEAD:** `cd35b65` ·
**Previous handoff:** `2026-09-03-1425-attendance-merged-and-rulings.md`

---

## Start here

**Nothing is half-done.** Attendance Stage 1 shipped, `main` is clean, and there is no work
parked mid-flight. A fresh session picks its next task rather than resuming one.

Read `docs/AUTONOMY.md` first — the standing charter for running without Brenden watching. It
gained real corrections this session (fixture size as a fourth blind spot, how screenshots
actually work, controls anchoring to their row, fix-the-pattern-not-the-instance).

**The previous handoff is the substantive one.** `2026-09-03-1425-attendance-merged-and-rulings.md`
carries the six rulings taken on Brenden's behalf with what each costs if wrong, and the
findings deliberately parked. Do not re-derive any of it; do not re-open it.

## State, verified

`main` at `cd35b65`, tree clean, `main` and `attendance-stage-1` both level with `origin`
(0 ahead / 0 behind, confirmed after a fetch). The branch is merged into `main` and kept —
delete it whenever. Suite **375/375, 0 failed** on the merged tree. App version `1.7.0`.

**Promotion has not happened and is not yours to do.** `main` is served live by GitHub Pages,
so the Attendance tab is at the URL now — but giving Carol Ann that URL is Brenden's act alone,
and `tmp/note-for-her.md` stays unsent. See `docs/DELIVERY.md`.

The SDD workspace for this plan was deleted after its trail was committed into the previous
handoff. `.superpowers/sdd/` is now empty.

## What could come next

Nothing here is assigned — this is the honest menu, in the order I would pick.

- **Stage 2 (service targets, forward projection) is blocked** on the clinician's IEP answer
  and must stay out of the code until she answers. Start from a conversation, not a plan.
- **`docs/OPEN-QUESTIONS.md` now has six**, and question 6 is the freshest: whether the grid
  should reach back before a child joined a group. It is the one most likely to change what she
  sees, because it drives how often the provisional italics fire.
- **The parked minors** are listed in the previous handoff. The one with real leverage is
  `attendanceGrid` computing over the unfiltered caseload — the student detail page reads all 49
  students to display one row, and filtering `data.students` before the call fixes both sites.
- **`studentFilters` loses input focus on every keystroke** (it re-renders the whole page). This
  is pre-existing on `main`, not from this branch, but Attendance gave it a much heavier caller
  and it is the roughest thing she will touch.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -3              # cd35b65 on top
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 375 tests, 0 failed (~2 min)
```

Running the suite wipes the app database; restore from `tmp/slp-test-data.json` through the
backup UI. Settled — do not re-raise it. That fixture was regenerated this session and now
carries `missed` and `isMakeup` rows, so it can finally exercise the Owed column and the makeup
booking flow. It could not before, which is why every screenshot pass on this branch had to
hand-build its data.

## One operational note

Brenden is often reading from his phone. **Never prefix a shell command with `cd`** — it
triggers a permission prompt he has to answer by hand. Every tool here takes a path: use
`git -C <repo>`, absolute paths for `grep`/`cat`/`bash`, or `R=<repo>; cmd $R/file`. His global
`CLAUDE.md` says this, but dispatched subagents do not reliably inherit it — **restate it in
every dispatch prompt.** Quote paths containing `(`, `)`, `[`, `]`.

## Suggested skills

- **`superpowers:brainstorming`** — the likely next moves are all conversations (Stage 2, the
  open questions), not plans waiting to be executed.
- **`superpowers:verification-before-completion`** — three defects on the last branch passed a
  green suite *and* a screenshot. Evidence, not assertions, and look at the picture yourself.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at the
root. `tmp/` and `.superpowers/` are gitignored and exist on this machine only.
