# Handoff — the app is hosted as a beta env; the attendance plan is now accurate

**Written:** 2026-09-03 01:52 UTC · **Branch:** `main` · **HEAD:** `c97d4ec` ·
**Previous handoff:** `2026-08-26-0053-attendance-percentage-and-today-collapse.md`

---

## Start here

Working tree clean. Suite **256/256, 0 failed** (was 254). App is **v1.6.0**, and the file
is now **`index.html`** — `slp-tracker.html` no longer exists. **There is a remote now:**
`git@github.com:brendenriggs/slp-tracker.git`, public, with Pages serving
https://brendenriggs.github.io/slp-tracker/. Everything is pushed.

**Nothing is blocked on a human.** The attendance spec was approved and its plan written in
`9f0703a`; this session verified that and corrected the previous handoff, which still said
the spec was awaiting review. **The next step is executing
`docs/superpowers/plans/2026-08-26-attendance-and-makeup-debt.md` from Task 1** — ten tasks,
zero checkboxes ticked, nothing implemented.

```
c97d4ec  docs: main is a beta env, and capture the slot-time edit request
b71b5aa  docs: refresh the attendance plan for the rename, and open a backlog
121855f  docs: rewrite DELIVERY.md for hosting, and test the version stamp
9c8e651  feat: serve the tracker as index.html and stamp the version in the footer
```

## The hosting change, and the one thing to get right about it

Brenden asked for a hosted URL so his updates reach Carol Ann without emailing a file.
Delivered on GitHub Pages: `git push` is the whole update procedure, ~10 min of CDN cache
before a refresh shows it. Setup details are in `docs/DELIVERY.md`; don't re-derive them.

**`main` is a beta environment, not production.** She has **not** been given the URL and is
still working from her emailed `file://` copy. So pushing half-built work to `main` is free
right now — nobody is watching. This matters because the attendance plan lands ten commits,
nine of which leave the Attendance tab visibly half-built.

**Promotion is a single act: sending her the URL.** The draft that does it is
`tmp/note-for-her.md` (gitignored, marked DRAFT — NOT SENT). Do not send it mid-plan.

**Why promotion is a migration, not a link.** Her data lives in IndexedDB keyed to the
`file://` origin; the hosted app is `https://brendenriggs.github.io`, a different origin.
**IndexedDB does not cross between them, and neither does her linked backup-file handle.**
So promotion is back-up → open URL (it will look empty) → restore → re-link backup file →
*then* delete the old HTML. The ordered steps are in `docs/DELIVERY.md`; the sharp edge is
the last one, because two working copies on two origins both accepting entries is a silent
data-split.

## What else shipped

- **Version stamp in the footer** (`9c8e651`), reading `SLP.version`. The point is that
  "did you get the update?" is now answerable over the phone — she reads the number back.
  Two tests guard it, including that it does not accumulate across re-renders.
- **`slp-tracker.html` → `index.html`** so the bookmark is a bare URL. Four references in
  `tests/` updated.
- **`docs/BACKLOG.md` is new.** It holds her latest request plus the deferred items that
  were previously living only in handoff prose. Put future non-spec action items there
  rather than in a handoff, where they rot.

## Unprocessed feature request

A schedule slot's time cannot be edited — `docs/BACKLOG.md`.

## The attendance plan was stale; it is now accurate

The plan was written against `slp-tracker.html` at v1.5.0 and every line number in it moved
when this session edited the file. Fixed in `b71b5aa` and **re-verified line by line** —
each of the 26 citations was read back out of `index.html` to confirm it lands on what the
plan claims. Also: 37 filename references, and the final task's version bump, which
targeted 1.6.0 — already spent on the version stamp — and now targets **1.7.0**.

Two things the plan could not have known, both now written into it:

- **Headless screenshots do work.** The last two handoffs say they don't. The culprit is
  `--virtual-time-budget`, which freezes IndexedDB so the app never boots and the capture
  comes out blank — not headless itself. **Drop that flag and `--screenshot` renders the
  real app.** Confirmed this session against both the local file and the live URL, and the
  blank-page failure was reproduced on a file known to work, which is what proved it was
  the flag. Task 7 Step 8 now asks for a picture alongside the `getBoundingClientRect()`
  numbers, with the working command inline. The grid is the app's most alignment-dependent
  surface and a number can agree with a layout that still looks wrong.
- **The promotion constraint above**, written into the plan's Global Constraints.

## Notes for whoever works here next

- **Test files share one global scope.** `tests/index.html` loads each `*.test.js` as a
  classic `<script>`, so a top-level helper in one file silently overwrites another's. The
  plan already says to prefix every new attendance helper with `att`. Do it.
- **A broken intermediate edit makes the suite look like it hangs, not fail.** No TAP
  output at all means a `ReferenceError` or syntax error in the app file, not a harness
  problem. Run the suite with `run_in_background: true`; a full pass is over two minutes.
- **Running the suite wipes the app database** (`tests/index.html:26`) — restore from
  `tmp/slp-test-data.json`. Accepted and settled; **do not re-raise it.** Note it only
  touches the test profile, not Brenden's own Chrome.
- **Layout, scroll position and async timing are this app's three blind spots**, and a
  green suite is blind to all three. Measure, and now also screenshot.
- **Neither the scroll fix nor the Today collapse has been confirmed by hand.** Still true,
  still untouched — carried into `docs/BACKLOG.md` so it stops depending on someone reading
  the right handoff.
- **The `chart()` percent axis is still hardcoded at 100.** In the backlog, out of scope
  for attendance.
- **The previous handoff was stale on its central claim** and cost a verification pass to
  catch. Handoffs are timestamped moments — this one supersedes it; it was left unedited on
  purpose, because rewriting a past handoff falsifies the trail.
- **Files generated for Brenden go in the gitignored `tmp/`** in the repo root, never the
  session scratchpad under `/tmp`.

## Verify before acting

No state-verification script in this repo; the test run and a fetch of the live URL are the
checks.

```bash
git -C /home/brenden/dev/slp-tracker log --oneline -3   # expect c97d4ec, b71b5aa, 121855f
git -C /home/brenden/dev/slp-tracker status --short     # expect clean
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh   # expect 256 tests, 0 failed (~2 min)
curl -sS -o /dev/null -w '%{http_code}\n' https://brendenriggs.github.io/slp-tracker/  # 200
ls /home/brenden/dev/slp-tracker/tmp/   # slp-test-data.json, gen-seed.js,
                                        # measure-collapse.html, note-for-her.md
```

## Suggested skills

- **`superpowers:subagent-driven-development`** (or `superpowers:executing-plans`) — the
  attendance plan names one of these as required, and it is the actual next step.
- **`superpowers:test-driven-development`** — every task in the plan is written red-first,
  and it insists each new test is proven able to fail before being kept. Five sessions
  running, that practice has caught a real bug.
- **`superpowers:verification-before-completion`** — see the three blind spots above.
- **`superpowers:brainstorming`** — only if Brenden raises her slot-time request, or
  anything else outside the attendance plan.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). Working tree clean, everything
pushed. GitHub Pages serves `main` at the root. `tmp/` is gitignored and its contents exist
on this machine only.
