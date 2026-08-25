# Handoff — hand-verification nearly closed; one item left, and its data is seeded

**Written:** 2026-08-25 13:10 UTC · **Branch:** `main` · **HEAD:** `c95f6e6` ·
**Previous handoff:** `2026-08-25-1205-school-grade-pickers.md`

---

## Start here

The previous handoff's whole job was hand-verification. **Two of its three items are now
closed.** Three commits landed on the way; read their messages for the *why* — it isn't
repeated here.

- `482f753` — school/grade filters on the Students tab, plus the school-box placeholder fix
- `99b445b` — each student's school now shows on the caseload row
- `c95f6e6` — ignore a `tmp/` scratch directory

App is **v1.2.0**, suite is **192/192**, working tree clean.

## What is still owed — one item, and only one

**The tab-through of a real day** (previous handoff's item 2, originally Task 14 Step 5).
Nobody has done it. It cannot be automated: it is a feel judgment about tab order, whether
the input column holds still across goals of very different lengths, whether the counter
climbs only on real typing, and whether `Alt+A` marks the focused student absent without
stealing focus from the note box. The original instruction still stands — **if the
tab-through feels slow or the layout jumps, that is a stop-and-fix, not a note for later.**

**The setup is already done for him.** `tmp/slp-test-data.json` (gitignored, present on
this machine only) is a restorable backup holding 49 students, 3–4 per grade across all 14
grades, 4 schools, 14 goals, 28 objectives and 3 weekly slots — Monday 09:00 and 10:15,
Wednesday 13:00. Every student in a slot has a goal with two objectives, and the goal texts
run to ~350 characters deliberately, because varied length is what stresses the input
column. He opens his `file://` copy, presses **Restore…**, picks that file, and goes
straight to a Monday on the Today tab. `tmp/gen-seed.js` regenerates it
(`node tmp/gen-seed.js <out.json>`) if it is ever lost.

Warn him of one thing if it comes up: restore deliberately **keeps the linked backup
handle**, so pressing *Back up now* afterwards overwrites his linked file with test data.

### Closed this session

1. **The file-picker round trip** — he ran it and reported `'ok'` with no dialog after a
   full Chrome restart. `docs/DELIVERY.md:21` is accurate as written; nothing to change.
2. **The datalist and edit-row questions** — driven in a real browser and both settled;
   see `482f753` and `99b445b`.

## How to drive this app in a browser

The Chrome extension refuses `file://`, which is what blocked the previous session. The way
through: `python3 -m http.server 8765 --bind 127.0.0.1 --directory <repo>` and open
`http://127.0.0.1:8765/slp-tracker.html`. **The localhost origin has its own IndexedDB**,
completely separate from the `file://` origin, so nothing you do there can touch his real
data. Wipe it between runs with `indexedDB.deleteDatabase('slp-tracker')` and reload.

Four things that cost time this session, all avoidable:

- **The viewport resizes between screenshot calls**, so coordinates from one screenshot are
  stale by the next. Drive by element through `javascript_tool`, not by coordinate.
- **CDP screenshots cannot capture native popups.** A `<datalist>` dropdown or an open
  `<select>` is browser chrome, not page content — it will never appear. Verify those by
  measuring the input instead, and say plainly what you could not see.
- **`document.body.textContent` includes the app's own inline `<script>`.** Substring checks
  for tokens like `STUDENT` false-positive on the source. Walk text nodes and exclude
  `SCRIPT` parents.
- **Dispatching `change` on a filter control synchronously clears the render root**, so a
  test that sets two controls back to back will find `null` on the second `querySelector`.
  Await a render between changes — which is also how a person actually uses it.

## Verify before acting

```bash
git -C /home/brenden/dev/slp-tracker log --oneline -4   # expect c95f6e6 at HEAD
git -C /home/brenden/dev/slp-tracker status --short     # expect clean
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh   # expect 192 tests, 0 failed, exit 0
ls /home/brenden/dev/slp-tracker/tmp/                   # expect slp-test-data.json, gen-seed.js
```

No state-verification script in this repo; the test run is the check.

## Notes for whoever works here next

- **Tests could not have caught the one real bug in the filter work.** `flex-basis: 100%`
  does not stop a `<select>` from claiming its longest option's intrinsic width — the
  school filter measured 294px inside a 250px column and ran under the detail pane. Only
  measuring the rendered box found it. The `min-width: 0` at `slp-tracker.html:81-84` is
  load-bearing; the comment says so. **Measure layout in a browser before calling UI work
  done.**
- **`SLP.ui.gradeSelect(id, value, blankLabel)`** is now the single grade picker, shared by
  the caseload add form, the caseload edit row and the students filter. Do not add a
  fourth copy — that drift is exactly what the comment on it warns about.
- The Students tab is `activeOnly: true`, so its school filter derives options from active
  students only. A filter whose school stops existing resets itself rather than reading as
  an empty caseload.
- **Files generated for Brenden go in the gitignored `tmp/` in the repo root**, never in
  the session scratchpad under `/tmp`. He has to open them himself, often through a GUI
  dialog. The session scratchpad is still right for your own working files.
- Heredocs into test files are still blocked by the `no-brace-expansion` hook — use
  Write/Edit for test files.

## Suggested skills

- **`superpowers:verification-before-completion`** — the remaining item is a verification
  pass whose failure mode is calling it fine without having driven it.
- **`superpowers:test-driven-development`** if the tab-through turns something up. The
  suite is honest at 192; keep it that way.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, working tree clean, **no remote
configured** — this handoff is committed locally only and cannot be pushed. `tmp/` is
gitignored and its contents exist on this machine only.
