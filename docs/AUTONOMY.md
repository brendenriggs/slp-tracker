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

A green suite is blind to this app's three failure modes: **layout, scroll position, and
async timing**. So verification is not just the suite.

- Seed realistic data (`node tmp/gen-seed.js`), render, and **measure** with
  `getBoundingClientRect()` — the house style for layout assertions.
- **Screenshot and look at it.** Headless capture works:
  `google-chrome --headless=new --disable-gpu --no-sandbox --window-size=1280,900
  --screenshot=<out.png> <url>`. Do **not** pass `--virtual-time-budget` — it expires before
  IndexedDB callbacks run and the capture comes out blank. `--dump-dom` fails the same way.
- Make the visual call yourself rather than deferring it, and collect the shots into one
  contact sheet for review, with anything you were unsure about called out at the top.

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
- **The clock is stubbable.** `todayStr` is exported on the namespace and called per render,
  so a test can pin it: `w.SLP.ui.todayStr = () => '2026-10-31'`. Prefer this over rewriting
  test dates into the past, which quietly destroys future-exclusion coverage.
- Files generated for Brenden go in the gitignored `tmp/`, never a session scratchpad.
