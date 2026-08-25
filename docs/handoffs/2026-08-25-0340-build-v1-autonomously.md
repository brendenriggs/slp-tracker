# Handoff — Build V1 autonomously, start to finish

**Written:** 2026-08-25 03:40 UTC · **Branch:** `main` · **HEAD:** `4fada8f` ·
**Previous handoff:** `2026-08-25-0258-build-v1.md`

---

## Start here — the ask

**Execute `docs/superpowers/plans/2026-08-25-slp-tracker-v1.md` end to end, tasks 1
through 14, without stopping to ask anything.**

Brenden is asleep. He wants a working, reviewable V1 waiting when he wakes up. He has
explicitly authorised building the whole plan with no input from him, and said you can
iterate together afterwards if it needs work.

So: **do not ask clarifying questions, do not stop for approval between tasks, and do not
stop to report progress.** Read the plan, follow it, commit per task as it instructs, and
have `slp-tracker.html` finished and green when he returns. The plan was written to be
executed exactly this way — every task carries its own tests, its own code, and its own
commit.

### What "done" means

- All 14 tasks complete, each committed as the plan specifies.
- `bash tests/run-tests.sh` exits 0 with `0 failed`.
- `slp-tracker.html` opens by double-click and runs — one file, no build, no network.
- Task 14's grep for constraint violations comes back clean.
- A short summary at the end of what you built and anything you'd flag for review.

### The one thing you cannot do alone

**Task 6 Step 6** and **Task 14 Step 5** are hand-verification passes that need a real
browser window and a human at it — the OS file picker and the tab-through feel. You
cannot do either headless.

**Do not skip the rest of the task waiting for them.** Build everything, run the automated
suite, and leave those two checks clearly listed as the first things for Brenden to do at
review. Say plainly in your summary that they are unverified and why.

## Suggested skills

- **`superpowers:executing-plans`** — first, and the right one here. The plan's own handoff
  section offered a choice between subagent-driven and inline execution; **inline is the
  call for this run**, because nobody is awake to do the between-task reviews that make
  the subagent flow worth its overhead.
- **`superpowers:test-driven-development`** — the plan is already written red-green-commit;
  this keeps you honest about running the red step rather than assuming it.
- **`superpowers:verification-before-completion`** — before claiming V1 is done. Evidence,
  not assertions: paste the actual suite output.
- **`handoff`** at the end, so his morning starts with a summary rather than a scroll.

## Verify before acting

No deployment, no state-check script, nothing live — this repo is a spec, a plan, and a
probe. Confirm before you start:

```bash
git -C /home/brenden/dev/slp-tracker log --oneline -3   # expect 4fada8f at HEAD
git -C /home/brenden/dev/slp-tracker status --short     # expect clean
google-chrome --version                                  # expect 147+; the harness needs it
```

`slp-tracker.html` and `tests/` **do not exist yet** — Task 1 creates them. That is
expected, not drift.

## What was settled this session

**The `file://` origin question is answered — and it was the one blocking every future
release.** Storage is keyed to the shared `file://` origin, not the file path. Shipping
her an updated HTML file does not wipe her data, so export/import does not need to be part
of the release process. Evidence and method are in
`docs/superpowers/specs/2026-08-25-storage-probe-result.md` (commit `f6f9a52`) — read it
there, don't re-derive. Caveat recorded: verified on Chrome 147/Linux, hers is Chrome
151/Windows.

**The test harness shape was verified before the plan was written**, because every task
depends on it. Headless Chrome loads the *real* `slp-tracker.html` in an iframe
(`--allow-file-access-from-files`, test-only) and asserts against its live namespace and
DOM. Console → `--log-file` is the output channel; `window.close()` ends the run. I proved
all of this works, **including that the harness reports failures rather than only passes**.
Two dead ends already ruled out, so don't retry them:

- `--dump-dom` fires at the load event, before any async IndexedDB work finishes.
- `--virtual-time-budget` expires before IndexedDB callbacks run, silently truncating output.

**The plan itself** is `docs/superpowers/plans/2026-08-25-slp-tracker-v1.md` (commit
`4fada8f`), 14 tasks, ~5000 lines, with real code and real tests in every step. It carries
its own self-review section covering spec coverage and the seams that cross task
boundaries. It is the source of truth for the build — this handoff does not repeat it.

## Things a fresh agent will get wrong without being told

**It must stay one self-contained HTML file opened by double-click.** No build step, no
npm, no bundler, no CDN, no framework fetched at runtime, no network calls of any kind —
it runs on a district machine with student data nearby. The single HTML file *is* the
source; there is no generate-from-source step. If you reach for React and Vite, you have
already broken it.

**She is never at a computer during a session.** She charts on paper and transcribes
later. Keyboard-first *batch entry*, not live capture. This fact already killed one
complete screen design.

**Pre-filled field defaults must not count as data entry.** The subtlest bug in the build,
and the one that costs her real data. Task 3 tests it seven ways; Task 11's tab-through
test is the one that catches it at the UI layer. If you find yourself "simplifying" the
`entered` flag away, stop.

**Progress is charted per objective, over time — never across objectives.** No
normalization, no comparable scales.

**Exactly two field types: number and text.** Not three. Resisting a third is what keeps
this from becoming a form builder.

**Never trigger `alert`/`confirm`/`prompt`.** They freeze browser automation and will hang
your own test runs. The plan uses inline two-step confirms everywhere for exactly this
reason — keep it that way.

**Do not run anything on her machine.** She is the end user, not a test environment. All
manual checks happen on Brenden's machine.

**She will never use git.** This repo is Brenden's history alone. Delivery is one HTML
file she double-clicks.

## If the plan turns out to be wrong somewhere

It was written in one pass and never executed. Something in it is probably wrong.

**Fix it and keep going** — that is what he wants from this run. Prefer the plan's intent
over its letter when they conflict, keep the tests honest rather than weakening them to go
green, and note what you changed and why in your closing summary. A test that fails
because the *plan's expectation* was wrong is a finding worth writing down, not a reason to
stop and wait.

Genuinely blocked and out of options is the only reason to stop early. If that happens,
finish every task that isn't blocked, commit it, and say exactly what you left and why.

## Out of scope

Phase 2 (curriculum ingestion + lesson planning) — spec §7, gets its own design pass. Also
not building: school-year rollover, makeup-session linking, multi-user or sync, and the
automatic file-mirror backup (§10 step 7 — the probe decision made backup manual, so the
handle is wired to a button, not a trigger). `isMakeup` exists on the model with no UI,
deliberately; see the plan's self-review.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, working tree clean, **no remote
configured** — nothing has left the machine and this handoff cannot be pushed.

```
.gitignore                                    # blocks slp-data-*.json, *-backup.json, data/
docs/handoffs/
docs/superpowers/specs/2026-08-24-slp-session-tracker-design.md   # the spec
docs/superpowers/specs/2026-08-25-storage-probe-result.md         # probe + origin answer
docs/superpowers/specs/slp-session-tracker.html                   # published spec page
docs/superpowers/plans/2026-08-25-slp-tracker-v1.md               # THE PLAN — start here
storage-probe.html                                                # the probe
```

The published spec page is at
https://claude.ai/code/artifact/a1a69fb0-acbb-40ee-866d-a2745b8c8f92 — republish the same
path to update it in place.

The `.gitignore` deliberately excludes student IEP records. Keep it that way, and never
commit a backup JSON.
