# Handoff — per-student colour picked up, stopped at the question that decides its shape

**Written:** 2026-09-08 01:02 UTC · **Branch:** `main` · **HEAD:** `a60cc16` ·
**Previous handoff:** `2026-09-07-0118-four-shipped-and-a-changelog.md`

---

## Start here

**Nothing was built this session and nothing is half-done.** No code changed, no commits
beyond this handoff. What this session produced is a *framing* of the per-student colour
idea and one unanswered question — resume at that question, not at an implementation.

Read `docs/AUTONOMY.md` first, then the previous handoff — **its rulings, its "do not
re-open" list, and its `tmp/` tooling notes all still stand verbatim** and are not repeated
here. Nothing in them changed.

## What happened

A `/pickup` verified the previous handoff's state (below), and Brenden chose
**per-student column colour** off its "what could come next" list. That item has been
carried as *"a conversation, not a ticket"* across three handoffs.

The conversation opened, context was gathered, and the first design question was put to
him — **he interrupted it and asked for this handoff instead.** So the question stands
unanswered. Do not answer it on his behalf and do not pick a shape and start building.

## The finding that reframes the idea

This is the substance of the session and the reason not to build the obvious thing.

**Her sheet colours student columns because in her layout a student is a column.** The
grid's own code comment already names why that is hard, in `index.html` above
`function crosshair`:

> *"the row her finger is on is not the row her eye is on. The column is the half that
> needs help: a row already reads as a run, a column is only an alignment."*

**Our grid keeps students as rows, and a row already has three aids** — zebra striping
(`.att-grid tbody tr:nth-child(even)`), a sticky `.att-name` cell, and the hover/focus
crosshair that lights the whole row. So the literal transplant — tint each student's line —
is solving a problem this layout does not have. That does not kill the idea; it means the
colour has to earn its place on some other ground.

Related and settled: **transposing the grid is rejected** (Brenden, 2026-09-04, recorded in
`AUTONOMY.md`). The colour is the surviving half of that photo, which is exactly why its
purpose has to be restated rather than inherited.

## The open question, and the four framings put to him

*What is the per-student colour actually for?* The four options offered, kept here so the
next session can re-put the question rather than re-derive it:

1. **Encode a category she filters by** — tint the name cell by `school` or `grade`, so 49
   rows can be scanned by group without filtering. Derived from data she already enters:
   nothing new stored, nothing for her to pick. The cheapest of the four.
2. **Row-tracking across the month** — a tint on the whole row, name to `Owed`. The literal
   transplant, on top of zebra and crosshair. Weakest on the finding above.
3. **Student identity across views** — a colour belonging to the student in the grid, the
   Today card and the detail page. Needs a stored colour and a way to assign it.
   **This one upgrades the task from bounded to architectural.**
4. **Ask her first** — we do not know why she colours her columns. Add it to
   `docs/OPEN-QUESTIONS.md` and build nothing until she answers.

Option 4 is not a dodge: `AUTONOMY.md` says the clinician decides how her own practice
works, and the photo is the closest thing to her answering. If Brenden does not have a
purpose in mind, that file is where this belongs.

## What the code says, so the next session need not re-read it

- **The student record is `{ id, name, grade, school, background }`** — no colour field, no
  group field (`index.html:633`). Framings 1 and 2 need no schema change; framing 3 does.
- **The grid renders at `index.html:3380`**, one `<tr>` per student with
  `data-student-id`, a `th.att-name`, a `td.att-day` per date, then `att-pct` and
  `att-owed`. `att-name`, `att-pct` and `att-owed` are `position: sticky`.
- **Any colour rule has to outscore the zebra rule.** `.att-grid tbody tr:nth-child(even) td`
  is (0,2,2); write the tint as `tbody tr td.thing` and assert the computed background **on a
  striped row**. This is already an `AUTONOMY.md` rule, earned by the `att-hot` bug.
- **A tint sits behind glyphs.** The four status marks and `--faint` were tuned against
  white and `--row`. A third background means re-checking contrast for every glyph on it —
  `AUTONOMY.md`'s "quiet is not invisible" rule applies to what is drawn *on* the tint, not
  just the tint itself. Assert computed colours, not classes.
- **Colour cannot be the only carrier.** The grid's whole vocabulary is shape-based
  (`☑ ☐` plus non-box exceptions) precisely so an unusual day is findable. A tint that
  encodes something must not become the only way to read it.

## State, verified this session

`main` at `a60cc16`, tree clean, level with `origin` (0/0). Suite **444/444, 0 failed** —
run in full this session, summary line read.

Docs and `tmp/` tooling from the previous handoff all confirmed present.

`main` is served live by GitHub Pages. **Promotion has not happened and is not yours to
do** — `tmp/note-for-her.md` stays unsent. See `docs/DELIVERY.md`.

**The local app database is wiped** — the suite run did it. Restore from
`tmp/slp-test-data.json` through the backup UI. Settled; do not re-raise.

## What could come next

Nothing here is assigned. The previous handoff's list is otherwise unchanged — the
requirement model (ADR 0004) is still the big deferred build, and
`docs/OPEN-QUESTIONS.md` still has three blocking her.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -3              # this handoff on top of a60cc16
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 444 tests, 0 failed (~2 min)
```

## Suggested skills

- **`superpowers:brainstorming`** — this resumes mid-conversation, at step 2 of its bounded
  path. Re-put the question above; do not present a design until it is answered.
- **`superpowers:test-driven-development`** — once a shape is agreed. A colour change is
  exactly the kind that passes a class assertion and fails the eye.
- **`superpowers:verification-before-completion`** — a tint has to be screenshotted at her
  real caseload and measured, not just tested.

## One operational note

Brenden often reads from his phone — short, scannable answers earn their keep. **Never
prefix a shell command with `cd`**; every tool here takes a path (`git -C <repo>`, absolute
paths). Quote paths containing `(`, `)`, `[`, `]`. Do not write files via shell redirection
or `sed -i`; use the Write/Edit tools. Dispatched subagents do not reliably inherit his
global `CLAUDE.md` — restate this in every dispatch prompt.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
https://brendenriggs.github.io/slp-tracker/. `tmp/` and `.superpowers/` are gitignored and
exist on this machine only.
