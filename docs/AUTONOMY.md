# Working here without Brenden watching

Standing rules for an agent running unattended. These were settled across several sessions
but lived only in handoff prose, which a fresh agent has no reason to read — handoffs are
timestamped moments, and the newest one supersedes the rest. This file is durable. Read it
before starting a long run.

## Standing authority

**Execute the plan end to end.** Do not stop for approval between tasks, do not stop to
report progress, do not ask clarifying questions you can answer from the repo. Commit per
task as the plan instructs.

**If the plan turns out to be wrong, fix it and keep going.** Prefer the plan's intent over
its letter when they conflict. Never weaken a test to go green. A test that fails because
the plan's expectation was wrong is a finding worth writing down, not a reason to stop.

**Stop early only when genuinely blocked and out of options.** Then finish every task that
is not blocked, commit it, and say exactly what you left and why.

**Finish with a summary and a handoff**, so his return starts with a summary rather than a
scroll.

## Where work lands

Feature work runs on a branch and merges to `main` only when the plan is complete and the
suite is green. `main` is served live by GitHub Pages, so keeping it coherent means
"is promotion urgent?" is never a judgment an unattended agent has to make.

Small, self-contained fixes that are complete and green on their own may go straight to
`main`.

**Never promote.** Promotion — giving the clinician the URL — is Brenden's act alone. See
`docs/DELIVERY.md`. Do not send `tmp/note-for-her.md`.

## What "verified" means

A green suite is blind to four of this app's failure modes: **layout, scroll position,
async timing, and fixture size**. So verification is not just the suite.

- Seed realistic data, render, and **measure** with `getBoundingClientRect()` — the house
  style for layout assertions. `tmp/gen-seed.js` is the generator; check what it emits against
  the current vocabulary before trusting it, since a fixture drifts from the code it seeds and
  nothing fails when it does.
- **Seed at her real caseload — 49 students — not six.** A control that renders 175px from the
  row it acts on looks fine in a six-student fixture and lands 1200px off-screen in her data.
  Two features shipped past both a green suite and a screenshot this way. Fixture size is not
  a detail of the test; it is the thing being tested.
- **Screenshot and look at it, at the scroll position she would actually be at.** A capture at
  scroll 0 cannot answer a question about something that opens beside a mid-list row.
- **Drive Chrome over CDP and capture only after a readiness marker is set.** `--screenshot`
  fires at the page's `load` event, which precedes IndexedDB seeding and the render, so a cold
  capture comes out blank on its own — `--virtual-time-budget` and `--dump-dom` make it worse
  but are not the cause. `tmp/cdp-shot-task9.js` and `tmp/screenshot-attendance.html` are the
  working shape.
- **Compare the same number across every view that shows it.** A CSS rule scoped to one view's
  container silently styles nothing in another, and the class still reads as present in the
  DOM — so both the suite and a single screenshot pass. Put the two shots side by side.
- Make the visual call yourself rather than deferring it, and collect the shots into one
  contact sheet for review, with anything you were unsure about called out at the top.

**Fix the pattern, not the instance.** A defect found in one control is a defect in every
control built the same way. Generalise the rule into this file before moving on — twice the
same placement bug was fixed where it was found, and the next control built repeated it.

## Which questions need which human

**Brenden** decides product shape, scope, and anything about delivery.

**The clinician** decides how her own practice works, and an agent must not invent answers
on her behalf. Open questions for her live in `docs/OPEN-QUESTIONS.md`; add to that file
rather than designing around a guess. Commit `38fe57b` reverted an agent that over-reached
here.

## Constraints a fresh agent gets wrong

- **One self-contained HTML file, opened by double-click.** No build step, no npm, no
  bundler, no CDN, no framework, no network calls of any kind. The file *is* the source.
- **She is never at a computer during a session.** She charts on paper and transcribes
  later — keyboard-first batch entry, never live capture. This killed one complete screen
  design already.
- **A pre-filled default is not data entry.** Never simplify the `entered` flag away; it is
  the bug that costs her real records.
- **Progress is charted per objective, over time — never across objectives.** No
  normalization, no comparable scales.
- **Exactly two field types: number and text.** Resisting a third is what keeps this from
  becoming a form builder.
- **Never `alert`, `confirm` or `prompt`.** They freeze browser automation and hang test
  runs. Confirmation uses the armed-delete pattern.
- **Controls anchor to the row they act on.** A popover or form that acts on one student's row
  is inserted as a `<tr>` immediately after that row, never appended at section level. The
  Today card's in-place expansion is the model.
- **A control that survives a render is identified by its `id`.** Every render tears `#app`
  down, so the node she was typing in is discarded and rebuilt. `doRender` restores the
  scroll offset and the focused element (with its caret and selection) across that teardown,
  and it finds the element again by `id` alone. So an `id` on an input or select is
  load-bearing, not decoration: leave it off and the control silently loses the keyboard on
  every keystroke. Do not solve this at a call site by refusing to re-render — that dodge was
  taken twice before the third control could not use it.
- **Quiet is not invisible, and `--line` is not an ink.** A mark meant to recede still has
  to clear about 3:1 against its background; below that it is simply absent, and no test
  notices because the element is present and the class applies. `--line` is a border
  colour (1.4:1 on white) and vanishes when a glyph is drawn in it — use `--faint`. Assert
  the computed colour, not the class, and check the contrast of anything deliberately
  understated. The attendance grid's dots and unmarked squares sat below the threshold of
  vision for two releases this way.
- **One glyph must not carry two meanings.** `attendanceGrid` emits `unmarked` for a past
  session she has not recorded and for one that has not happened yet; drawing both alike
  made a forward month look like a wall of overdue work. Split the *drawing* in the view
  (`data-future`) rather than inventing a state — the stored vocabulary stays the four
  statuses plus null, and nothing new has to be persisted or counted.
- **The template is not history.** Editing a slot never rewrites a past session.
- **Never run anything on her machine.** All manual checks happen on Brenden's.
- **She will never use git.** This repo is Brenden's history alone.

## Test harness notes

- Test files share one global scope — `tests/index.html` loads each `*.test.js` as a classic
  script, so a top-level helper in one file silently overwrites another's. Prefix new
  helpers per-feature.
- **Run the suite in the background**; a full pass takes over two minutes. No TAP output at
  all means a syntax error or `ReferenceError` in the app file, not a hung harness.
- **Running the suite wipes the app database.** Restore from `tmp/slp-test-data.json`.
  Settled; do not re-raise it.
- **`throws()` catches any throw, including a `TypeError` from a function that does not exist
  yet.** A test asserting only "it threw" proves nothing — it passes just as happily against a
  typo. Assert the message names the thing it rejected; `tests/backup.test.js:152-168` is the
  house convention. The same trap has a styling form: asserting a class is present passes
  against a rule that styles nothing. Assert the computed style.
- **The clock is stubbable.** `todayStr` is exported on the namespace and called per render,
  so a test can pin it: `w.SLP.ui.todayStr = () => '2026-10-31'`. Prefer this over rewriting
  test dates into the past, which quietly destroys future-exclusion coverage.
- Files generated for Brenden go in the gitignored `tmp/`, never a session scratchpad.
