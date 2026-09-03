# Attendance and Makeup Debt — Implementation Plan (Stage 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the SLP a caseload-wide Attendance tab over a date range she picks, showing every student's per-day outcome, the quarterly attendance percentage her progress notes need, and the makeup minutes she owes — with makeups bookable from the page.

**Architecture:** One bulk read (`store.attendanceRange`) does all the IndexedDB work; one pure function (`derive.attendanceGrid`) turns that data into rows, cells, percentages and balances. The view renders what `derive` hands it and writes back through the existing `store.setAttendance`. `attendance.status` widens from an effective `present | absent` to a four-value vocabulary, plus `null` for a makeup that is booked but not yet marked.

**Tech Stack:** Vanilla ES2020 in one file — `index.html`. IndexedDB via `SLP.db`. No framework, no build step, no dependencies. Tests are classic `<script>` files driven by headless Chrome through `tests/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-08-25-attendance-and-makeup-debt-design.md`

## Global Constraints

- **This plan runs on a branch.** `git checkout -b attendance-stage-1` before Task 1, and
  merge to `main` only once Task 10 is done and the suite is green. `main` is served live at
  https://brendenriggs.github.io/slp-tracker/, and this plan lands ten commits of which nine
  leave the Attendance tab half-built. Branching is what keeps "is promotion urgent?" from
  being a judgment an unattended agent has to make mid-plan.

  Earlier versions of this plan said to work straight on `main`, on the reasoning that
  Carol Ann has not been given the URL and nobody is watching. That is still true, and it is
  no longer the rule: `docs/AUTONOMY.md` is the standing charter and it puts feature work on
  a branch. Do not revert to committing on `main`.

  **Never promote.** Giving her the URL is Brenden's act alone — see `docs/DELIVERY.md`,
  and do not send `tmp/note-for-her.md`.

- **Everything lives in `index.html`.** One file, section-commented. New UI goes in a new `SECTION: ui.attendance` block placed between `ui.today` (ends at line 2125) and `ui.aggregation` (whose banner starts at line 2127). No new source files.
- **`SLP.model` and `SLP.derive` are pure.** No IO, no DOM, no `await` in either. All IndexedDB access lives in `SLP.db` and `SLP.store`.
- **Never `innerHTML` with her data.** Build DOM with `SLP.ui.h(tag, attrs, ...children)` and the `text:` attribute. `html:` is only for app-authored markup.
- **Never call `confirm()`, `alert()` or `prompt()`.** The app has zero of them. Confirmation uses the existing armed-delete pattern (`ui.armedDelete` — see `index.html:1456`, `1538`): first click arms and re-renders showing a confirm/cancel pair, second click acts.
- **Glyph and colour, never colour alone.** Every cell state carries a distinct character. Colour is decoration.
- **Test files share one global scope.** `tests/index.html` loads each `*.test.js` as a classic `<script>`, so a top-level `function chart(...)` in one file silently overwrites another's. **Prefix every new top-level helper with `att`.**
- **Prove each new test can fail before keeping it.** Run the test against unmodified code and confirm it goes red for the stated reason. A guard that guards nothing is worse than none.
- **Run the suite in the background:** a full pass takes over two minutes. `Bash(..., run_in_background: true)`. If the suite produces *no* TAP output at all, suspect a `ReferenceError` or syntax error in the app file, not a harness hang.
- **Running the suite wipes the app database** (`tests/index.html:26`). This is accepted and settled — restore from `tmp/slp-test-data.json` through the backup UI. Do not re-raise it.
- **Stage 2 is out of scope.** No service-target fields on `student`, no forward projection. Blocked on her IEP answer.
- **Also out of scope:** goal deletion (handled separately), and the `chart()` percent-axis
  ceiling bug — that one is fixed on `main` before this branch opens, per ADR 0003, so
  expect it already done rather than still broken.

---

## File Structure

**`index.html`** — the only source file touched:

| Region | Lines (pre-change) | What changes |
|---|---|---|
| CSS | 7–201 | Grid, cell, popover and booking-form styles |
| `SLP.model` | 337–464 | `ATTENDANCE_STATUSES`; `attendance()` validates status |
| `SLP.store` | 470–743 | `deriveAttendance` null-status fix; `attendanceRange`, `setSessionAttendance`, `bookMakeup`, `deleteMakeup`; `setAttendance` validates |
| `SLP.derive` | 749–856 | `minutesOf`, `makeupBalance`, `attendancePct`, `attendanceGrid`, `monthRange`, `makeupDuration`; `studentState` null-status fix |
| `SLP.ui` shell | 1107–1111 | `TABS` gains `['attendance', 'Attendance']` |
| `ui.students` | 1660–1663 | Detail page gains an attendance summary via a new hook |
| **`ui.attendance`** | new, ~2126 | The whole view: range picker, grid, marking popover, makeup booking |
| `ui.aggregation` | 2261 | History row tolerates a null status |
| boot | 2611 | — |
| `SLP` version | 214 | `1.6.0` → `1.7.0` (last task) |

**New test files:**

| File | Covers |
|---|---|
| `tests/attendance-derive.test.js` | Tasks 1–4, 7 (pure helpers) |
| `tests/attendance-store.test.js` | Tasks 1, 5, 6, 9 (harness) |
| `tests/attendance-ui.test.js` | Tasks 7–10 |

All three are registered in `tests/index.html` after `today-collapse.test.js` (line 87) in **Task 1**, so later tasks only append tests.

---

## Design decisions this plan locks in

Two points the spec leaves open, resolved here. An implementer should not re-litigate them; a reviewer should check these paragraphs first.

**1. A booked-but-unheld makeup carries `status: null`.**
The spec says a booked makeup writes an attendance row with `isMakeup: true`, and its grid legend has a `▫ᴹ makeup booked, unmarked` state — but it never says what `status` that row holds. It cannot be `present`: that would credit the debt to zero the instant she books, before the session happens. It cannot be `absent` (blames the child) or `cancelled` (a lie). So the row is written with `status: null`, meaning *the row exists to carry `isMakeup`; the outcome has not happened yet.*

This makes "unmarked" a first-class value the grid already needed, at the cost of three one-line tolerance fixes (`deriveAttendance`, `studentState`, the history row) — all in Task 1, all before anything can write a null.

**2. Session-level bulk marking does not overwrite an explicit non-`present` mark.**
Straight from the spec's testing section: *"that it does not overwrite a mark she made by hand on one student."* This is the same stickiness rule `deriveAttendance` already applies at `index.html:505`, extended to the bulk path. If Ada is marked `absent` and the whole session is then marked `missed`, Ada stays `absent` — which is also the arithmetically right answer, since a child who was not there generates no debt. The per-cell popover is the escape hatch when she genuinely wants to change one.

---

## Task 1: Status vocabulary, the null status, and a minutes helper

The foundation every later task computes on. Nothing writes a `null` status yet — this task only makes the app tolerate one, so the booking task in Task 9 cannot break Today.

**Files:**
- Modify: `index.html:214` (nothing yet — noted for Task 10), `337–464` (model), `503–525` (`deriveAttendance`), `665–676` (`setAttendance`), `749–856` (derive), `2261` (history row)
- Modify: `tests/index.html:87` (register three new test files)
- Test: `tests/attendance-derive.test.js` (create), `tests/attendance-store.test.js` (create)

**Interfaces:**
- Produces:
  - `SLP.model.ATTENDANCE_STATUSES` → frozen `['present', 'absent', 'missed', 'cancelled']`
  - `SLP.model.attendance({ sessionId, studentId, status, participation?, isMakeup? })` → throws `Error` on a status outside that list unless it is exactly `null`
  - `SLP.derive.minutesOf({ startTime, endTime })` → `number` (whole minutes, `0` on unparseable input)
  - `SLP.store.setAttendance({ dateStr, slot, studentId, status })` → throws on an unknown status

- [ ] **Step 1: Register the new test files**

In `tests/index.html`, after line 87 (`<script src="today-collapse.test.js"></script>`), add:

```html
<script src="attendance-derive.test.js"></script>
<script src="attendance-store.test.js"></script>
<script src="attendance-ui.test.js"></script>
```

Create all three files now so the harness does not 404. `attendance-ui.test.js` starts as a single comment line:

```js
// Attendance tab UI. Filled in from Task 7.
```

- [ ] **Step 2: Write the failing tests**

Create `tests/attendance-derive.test.js`:

```js
// The attendance vocabulary and the arithmetic that comes off it.
//
// Helpers here are prefixed `att` on purpose: tests/index.html loads every
// *.test.js as a classic script into ONE global scope, so a bare `chart()`
// or `row()` here would silently clobber another file's.

test('the status vocabulary is exactly the four outcomes', async () => {
  const w = await loadApp();
  eq([...w.SLP.model.ATTENDANCE_STATUSES],
     ['present', 'absent', 'missed', 'cancelled'],
     'one field carries the outcome, and these are its values');
});

test('an unknown attendance status is refused at construction', async () => {
  const w = await loadApp();
  await throws(() => w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: 'excused',
  }), 'a status outside the vocabulary must not reach the database');
});

test('a null status is legal — a makeup booked but not yet held', async () => {
  const w = await loadApp();
  const row = w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: null, isMakeup: true,
  });
  eq(row.status, null, 'the row exists to carry isMakeup, not an outcome');
  eq(row.isMakeup, true, 'and the makeup flag survives');
});

test('minutesOf measures a span in whole minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '09:00', endTime: '09:30' }), 30, 'half hour');
  eq(w.SLP.derive.minutesOf({ startTime: '09:45', endTime: '10:15' }), 30,
     'and it crosses the hour boundary');
});

test('minutesOf reads a slot and a session identically', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const slot = m.slot({ dayOfWeek: 1, startTime: '11:00', endTime: '11:45', studentIds: [] });
  const session = m.session({ date: '2026-10-05', startTime: '11:00', endTime: '11:45' });
  eq(w.SLP.derive.minutesOf(slot), 45, 'a slot has the same shape');
  eq(w.SLP.derive.minutesOf(session), 45, 'so one helper serves both');
});

test('minutesOf returns 0 rather than NaN on unusable times', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '', endTime: '' }), 0, 'blank');
  eq(w.SLP.derive.minutesOf(null), 0, 'nothing at all');
  eq(w.SLP.derive.minutesOf({ startTime: '10:00', endTime: '09:00' }), 0,
     'a backwards span is not negative minutes');
});

test('a null-status row does not read as a state on Today', async () => {
  const w = await loadApp();
  const entry = { attendance: { s1: { status: null, isMakeup: true } },
                  notes: {}, datapoints: {} };
  eq(w.SLP.derive.studentState(entry, 's1'), 'none',
     'booked-but-unmarked is not charted yet — it must not leak a null onto the card');
});
```

Create `tests/attendance-store.test.js`:

```js
// Bulk reads and the write paths the Attendance grid needs.
// Every top-level name here is prefixed `att` — see the note in
// attendance-derive.test.js about the shared global scope.

const ATT_MONDAY = '2026-10-05';    // a Monday
const ATT_TUESDAY = '2026-10-06';

async function attSeed(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincoln' });
  const bo = m.student({ name: 'Bo', grade: '4', school: 'Lincoln' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  // Task 9 charts a datapoint against a makeup to prove deleteMakeup cleans up after
  // itself, so the seed carries one objective. Same shape as aggregation.test.js:5-8.
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve' });
  await st.saveGoal(goal);
  const objective = m.objective({ goalId: goal.id, text: 'STUDENT will identify objects' });
  await st.saveObjective(objective);
  return { ada, bo, slot, objective };
}

test('setAttendance refuses a status outside the vocabulary', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await throws(() => w.SLP.store.setAttendance({
    dateStr: ATT_MONDAY, slot, studentId: ada.id, status: 'excused',
  }), 'the write path is the last gate before the database');
});

test('setAttendance accepts each of the four outcomes', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  for (const status of ['present', 'absent', 'missed', 'cancelled']) {
    const row = await w.SLP.store.setAttendance({
      dateStr: ATT_MONDAY, slot, studentId: ada.id, status });
    eq(row.status, status, status + ' is a legal outcome');
  }
});

test('charting against a booked makeup marks it held without losing isMakeup', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  await w.SLP.db.put('attendance', w.SLP.model.attendance({
    sessionId: session.id, studentId: ada.id, status: null, isMakeup: true }));

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id,
                               text: 'worked on /s/ blends' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 1, 'the booked row was filled in, not duplicated');
  eq(rows[0].status, 'present', 'a null status is not hers to protect — it is unfilled');
  eq(rows[0].isMakeup, true, 'and it is still the makeup she booked');
});

test('clearing the note undoes the charting, not the makeup booking', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  await w.SLP.db.put('attendance', w.SLP.model.attendance({
    sessionId: session.id, studentId: ada.id, status: null, isMakeup: true }));

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id,
                               text: 'worked on /s/ blends' });
  // She typed it into the wrong child and clears it again.
  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: '' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 1, 'the appointment she scheduled survives an emptied note');
  eq(rows[0].status, null, 'back to booked-but-unmarked, not held');
  eq(rows[0].isMakeup, true,
     'and still flagged, or the grid can no longer cancel it and the debt silently returns');
});

test('clearing the note on an ordinary session still withdraws the derived mark', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: 'ok' });
  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: '' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 0,
     'the makeup carve-out is an exception, not a new general rule — this row still goes');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`

Expected: the new tests fail — `ATTENDANCE_STATUSES` is undefined, `minutesOf` is undefined, `model.attendance` does not throw, and the makeup test shows `status: null` surviving untouched because `deriveAttendance` returns early on it. The cleared-note test fails differently and that difference matters: the row is **deleted outright** (`rows.length` is `0`, not `1`), which is the booking-destruction bug in ADR 0002. Its sibling — the ordinary session — must be **green from the start**; if it is red, the carve-out has been written too broadly and is eating the general rule.

- [ ] **Step 4: Add the vocabulary to the model**

In `index.html`, inside the `SLP.model` IIFE, after the `now` helper (line 342):

```js
  // One field carries the outcome, so the vocabulary lives in one place.
  // `null` is legal too and is deliberately NOT in this list: it means a makeup
  // that is booked but not yet held — the row exists to carry isMakeup, and the
  // outcome has not happened. Listing it would invite `status ?? 'unmarked'`
  // arithmetic; keeping it out forces every reader to handle "no answer yet".
  const ATTENDANCE_STATUSES = Object.freeze(['present', 'absent', 'missed', 'cancelled']);
```

Add `ATTENDANCE_STATUSES` to the returned object beside `GRADES` (line 435), and replace the `attendance` factory (lines 453–455) with:

```js
    attendance: ({ sessionId, studentId, status, participation = 'scheduled', isMakeup = false }) => {
      if (status !== null && !ATTENDANCE_STATUSES.includes(status)) {
        throw new Error('unknown attendance status: ' + status);
      }
      return { id: uid('at'), sessionId, studentId, status, participation, isMakeup,
               updatedAt: now() };
    },
```

- [ ] **Step 5: Teach the three readers about a null status**

`deriveAttendance` — `index.html:505`. Replace:

```js
    if (existing && existing.status !== 'present') return existing;   // hers, leave it
```

with:

```js
    // A status she chose is hers and is left alone. A null one is not a choice —
    // it is a makeup she booked and has not held yet, so data entry may fill it in.
    if (existing && existing.status && existing.status !== 'present') return existing;
```

**And the delete branch, at `index.html:521-523`** — the early return above is only half the
fix. Replace:

```js
    // Nothing entered any more — withdraw a mark the app itself derived.
    if (existing) await db.del('attendance', existing.id);
    return null;
```

with:

```js
    // Nothing entered any more — withdraw a mark the app itself derived.
    // But a booked makeup is not a derived mark: she scheduled it. Clearing a note
    // undoes the charting, not the appointment, so the row survives with its status
    // reset to null — back to "makeup booked, unmarked". Deleting it here destroyed
    // the booking: the credit vanished, the debt silently returned, and the row could
    // no longer be cancelled from the grid, since that control is gated on isMakeup.
    // Cancelling a makeup stays a deliberate act through the grid's delete control.
    // See docs/adr/0002-clearing-a-note-keeps-the-makeup-booking.md.
    if (existing && existing.isMakeup) {
      existing.status = null;
      existing.updatedAt = m.now();
      await db.put('attendance', existing);
      return existing;
    }
    if (existing) await db.del('attendance', existing.id);
    return null;
```

This is the only place a cleared note leaves a row behind. It is a deliberate exception to
the withdraw-a-derived-mark rule, and the comment above must survive review — a later reader
"simplifying" it back to an unconditional delete reintroduces the bug.

`derive.studentState` — `index.html:760–765`. Replace the body with:

```js
  function studentState(entry, studentId) {
    const a = entry.attendance[studentId];
    if (a && a.status && a.status !== 'present') return a.status;   // absent / missed / cancelled
    if (a && a.status === 'present') return 'present';
    // A null status carries no outcome, so fall through: whether she has charted
    // anything is the honest answer, exactly as it is for a student with no row.
    return touched(entry, studentId) ? 'present' : 'none';
  }
```

The history row — `index.html:2260–2262`. Replace:

```js
          h('span', { class: 'state-chip',
                      'data-state': row.attendance ? row.attendance.status : 'none',
                      text: row.attendance ? row.attendance.status : 'not charted' })),
```

with:

```js
          h('span', { class: 'state-chip',
                      'data-state': (row.attendance && row.attendance.status) || 'none',
                      text: (row.attendance && row.attendance.status) || 'not charted' })),
```

- [ ] **Step 6: Guard the write path**

In `store.setAttendance` (`index.html:665`), insert as the first statement of the function body:

```js
      if (status !== null && !m.ATTENDANCE_STATUSES.includes(status)) {
        throw new Error('unknown attendance status: ' + status);
      }
```

- [ ] **Step 7: Add `minutesOf` to derive**

In the `SLP.derive` IIFE, after the `touched` helper (ends line 758):

```js
  // A slot and a session both carry startTime/endTime, so one helper reads both.
  // Session times are snapshotted at materialization, which is why minutes need no
  // stored field: a later edit of the slot can never rewrite what a past session was
  // worth. Unusable input is 0, never NaN — a single NaN would poison a whole column.
  function minutesOf(span) {
    const toMin = t => {
      const parts = String(t == null ? '' : t).split(':');
      const hh = Number(parts[0]), mm = Number(parts[1]);
      return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
    };
    const a = toMin(span && span.startTime), b = toMin(span && span.endTime);
    if (a === null || b === null) return 0;
    return Math.max(0, b - a);
  }
```

Add `minutesOf` to the derive return list (line 854).

- [ ] **Step 8: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all previously-passing tests still pass (254 + the new ones), 0 failed.

- [ ] **Step 9: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/index.html tests/attendance-derive.test.js tests/attendance-store.test.js tests/attendance-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: widen the attendance vocabulary to four outcomes, plus unmarked"
```

---

## Task 2: The makeup debt arithmetic

**Files:**
- Modify: `index.html` — `SLP.derive` IIFE, after `minutesOf`
- Test: `tests/attendance-derive.test.js` (append)

**Interfaces:**
- Consumes: `derive.minutesOf` (Task 1) — only indirectly; callers pass minutes in.
- Produces: `SLP.derive.makeupBalance(rows)` where `rows` is `Array<{ status, isMakeup, minutes }>` → `{ debt: number, credit: number, owed: number }`. `owed` is `debt − credit` clamped at 0.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-derive.test.js`:

```js
const attMiss = (minutes, isMakeup = false) => ({ status: 'missed', isMakeup, minutes });
const attHeld = (minutes, isMakeup = false) => ({ status: 'present', isMakeup, minutes });

test('a session she missed owes its minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30)]),
     { debt: 30, credit: 0, owed: 30 }, 'the debt is hers');
});

test('a held makeup pays the debt down', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30), attHeld(30, true)]),
     { debt: 30, credit: 30, owed: 0 }, 'settled');
});

test('over-delivering is not a balance she can draw down', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([attMiss(30), attHeld(60, true)]);
  eq(b.owed, 0, 'never a positive credit — she cannot bank 30 minutes against next month');
});

test('missing a makeup adds no second helping of debt', async () => {
  const w = await loadApp();
  // She missed a 30-minute session, booked a makeup for it, then missed the makeup.
  // One skipped obligation. If the makeup counted, she would owe 60 for one miss —
  // and the number would drift upward every time a makeup slipped.
  const b = w.SLP.derive.makeupBalance([attMiss(30), attMiss(30, true)]);
  eq(b, { debt: 30, credit: 0, owed: 30 }, 'the original debt simply stays outstanding');
});

test('nothing but her own misses creates debt', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([
    { status: 'absent', isMakeup: false, minutes: 30 },
    { status: 'cancelled', isMakeup: false, minutes: 30 },
    attHeld(30),
  ]);
  eq(b, { debt: 0, credit: 0, owed: 0 },
     'a child who stayed home and a district snow day are not her paperwork');
});

test('debt is measured in minutes, not sessions', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(45), attMiss(20)]).owed, 65,
     'two misses of different lengths owe what they were worth');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: every new test fails with `w.SLP.derive.makeupBalance is not a function`.

- [ ] **Step 3: Implement `makeupBalance`**

In the `SLP.derive` IIFE, immediately after `minutesOf`:

```js
  // Her number, not the child's. Two rules, and one of them is load-bearing:
  //
  // The `!r.isMakeup` on the debt line stops a missed makeup adding a SECOND helping
  // of debt for the one obligation it was booked to settle — she would owe 60 minutes
  // for a single skipped session, and the figure would drift upward every time a
  // makeup slipped. A missed makeup is correctly a no-op: the original debt stands.
  //
  // `owed` clamps at zero because over-delivering is not a bank balance. Giving a
  // child an extra 30 minutes does not entitle her to skip 30 later.
  function makeupBalance(rows) {
    let debt = 0, credit = 0;
    for (const r of rows || []) {
      if (r.status === 'missed' && !r.isMakeup) debt += r.minutes || 0;
      if (r.status === 'present' && r.isMakeup) credit += r.minutes || 0;
    }
    return { debt, credit, owed: Math.max(0, debt - credit) };
  }
```

Add `makeupBalance` to the derive return list.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-derive.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: makeup debt arithmetic, with the missed-makeup no-op"
```

---

## Task 3: The attendance percentage

The number she publishes. Every rule below is one a later well-meaning edit could quietly break, so each gets its own test.

**Files:**
- Modify: `index.html` — `SLP.derive` IIFE, after `makeupBalance`
- Test: `tests/attendance-derive.test.js` (append)

**Interfaces:**
- Produces: `SLP.derive.attendancePct(rows, { today })` where `rows` is `Array<{ date: 'YYYY-MM-DD', status: string|null, minutes: number, isMakeup?: boolean }>` and `today` is `'YYYY-MM-DD'` → `{ pct: number|null, heldMinutes, offeredMinutes, heldSessions, offeredSessions, uncharted }`. `pct` is a whole number 0–100, or `null` when nothing was offered.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-derive.test.js`:

```js
const ATT_TODAY = '2026-10-31';
const attRow = (date, status, minutes, isMakeup = false) => ({ date, status, minutes, isMakeup });
const attPct = (w, rows) => w.SLP.derive.attendancePct(rows, { today: ATT_TODAY });

test('a session she missed stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'missed', 30)]);
  eq(p.pct, 100, 'her own paperwork must not land on a child’s progress note');
  eq(p.offeredSessions, 1, 'only one session was ever offered to the child');
});

test('a district cancellation stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'cancelled', 30)]);
  eq(p.pct, 100, 'a snow day is not an opportunity the child declined');
});

test('an absence counts against the child, as it should', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 30)]);
  eq(p.pct, 50, 'offered twice, present once');
});

test('a held makeup lands in both lines, so the figure can never exceed 100%', async () => {
  const w = await loadApp();
  // Missed once, made it up. 8 offered of 10 — not 7 of 9.
  const p = attPct(w, [attRow('2026-10-05', 'absent', 30),
                       attRow('2026-10-12', 'missed', 30),
                       attRow('2026-10-14', 'present', 30, true),
                       attRow('2026-10-19', 'present', 30)]);
  eq(p, { pct: 67, heldMinutes: 60, offeredMinutes: 90,
          heldSessions: 2, offeredSessions: 3, uncharted: 0 },
     'the makeup is simply a session that was offered');
  assert(p.pct <= 100, 'and it can never push the number past 100');
});

test('a session that has not happened yet is neither offered nor uncharted', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-11-09', null, 30)]);
  eq(p.uncharted, 0,
     'a quarter in progress must not accuse her of being behind on paperwork');
  eq(p.offeredSessions, 1, 'and the future session is not in the denominator either');
});

test('uncharted sessions are excluded from the number and counted beside it', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', null, 30),
                       attRow('2026-10-19', null, 30)]);
  eq(p.pct, 100, 'nothing was entered, so nothing is claimed');
  eq(p.uncharted, 2, 'but a confident 100% out of one session must say so out loud');
});

test('minutes, not session count, decide the percentage', async () => {
  const w = await loadApp();
  // One 30-minute session held, one 60-minute session missed by the child.
  // By session count this is 50%. By minutes it is 33%.
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 60)]);
  eq(p.pct, 33, 'the honest figure when a student carries two session lengths');
  eq([p.heldSessions, p.offeredSessions], [1, 2],
     'the counts still travel, because "1 of 2" is what she writes in the note');
});

test('a student with nothing offered reads as a dash, not zero', async () => {
  const w = await loadApp();
  eq(attPct(w, []).pct, null, 'not 0%, which reads as a child who never came');
  eq(attPct(w, [attRow('2026-10-05', 'cancelled', 30)]).pct, null, 'and not NaN');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: every new test fails with `w.SLP.derive.attendancePct is not a function`.

- [ ] **Step 3: Implement `attendancePct`**

In the `SLP.derive` IIFE, immediately after `makeupBalance`:

```js
  // The child's number, and it goes home to a parent — which is why `missed` and
  // `cancelled` are absent from both lines. Neither was an opportunity the child
  // declined, and leaving them in would put her own paperwork and a district snow
  // day onto a child's attendance record. Her misses do not vanish; they are the
  // debt above, reported separately.
  //
  // `isMakeup` does not appear here at all. A makeup is simply a session that was
  // offered: held, it lands in both lines; no-showed, in `offered` alone. So the
  // figure can never exceed 100%.
  //
  // held/offered are MINUTES — that is what the percentage divides, and it stays
  // honest for a student carrying two session lengths. The session counts travel
  // alongside because "8 of 9" is what she writes in the note; they are a label,
  // never the divisor.
  function attendancePct(rows, { today } = {}) {
    let heldMinutes = 0, offeredMinutes = 0;
    let heldSessions = 0, offeredSessions = 0, uncharted = 0;
    for (const r of rows || []) {
      // A range running to the end of the quarter holds sessions that have not
      // happened. Counting them would accuse her of being behind on paperwork
      // until the quarter's final day.
      if (today && r.date > today) continue;
      if (!r.status) { uncharted++; continue; }
      if (r.status !== 'present' && r.status !== 'absent') continue;
      offeredMinutes += r.minutes || 0;
      offeredSessions++;
      if (r.status === 'present') { heldMinutes += r.minutes || 0; heldSessions++; }
    }
    // Nothing offered is not zero percent — that reads as a child who never came.
    const pct = offeredMinutes > 0
      ? Math.round((heldMinutes / offeredMinutes) * 100) : null;
    return { pct, heldMinutes, offeredMinutes, heldSessions, offeredSessions, uncharted };
  }
```

Add `attendancePct` to the derive return list.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-derive.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: the quarterly attendance percentage, in minutes, with uncharted in plain sight"
```

---

## Task 4: The grid assembly

The whole page, as a pure function. After this task the entire feature is unit-testable without the harness ever opening a database.

**Files:**
- Modify: `index.html` — `SLP.derive` IIFE, after `attendancePct`
- Test: `tests/attendance-derive.test.js` (append)

**Interfaces:**
- Consumes: `derive.minutesOf`, `derive.attendancePct`, `derive.makeupBalance`
- Produces: `SLP.derive.attendanceGrid(data)` where

  ```js
  data = { from, to, today, students: [student], slots: [slot],
           sessions: [session], attendance: [attendanceRow] }
  ```

  → `{ dates: ['YYYY-MM-DD', ...], rows: [{ student, cells, pct, owed }] }`

  `cells` is keyed by date; each value is an array of
  `{ sessionId: string|null, slotId: string|null, startTime, minutes, state, isMakeup }`,
  sorted by `startTime`. `state` ∈ `'present' | 'absent' | 'missed' | 'cancelled' | 'unmarked'`.
  A date with no cell for a student has no key. `pct` is `attendancePct`'s shape; `owed` is `makeupBalance`'s.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-derive.test.js`:

```js
// 2026-10-05 is a Monday; 2026-10-10 is that Saturday.
function attGridData(w, over) {
  return Object.assign({
    from: '2026-10-05', to: '2026-10-09', today: '2026-10-31',
    students: [], slots: [], sessions: [], attendance: [],
  }, over || {});
}

test('the grid shows weekdays only', async () => {
  const w = await loadApp();
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { from: '2026-10-05', to: '2026-10-11' }));
  eq(g.dates, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
     'her paper form is M–F; a weekend would be two dead columns');
});

test('a weekend that carries a session still gets its column', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const sat = m.session({ date: '2026-10-10', startTime: '10:00', endTime: '10:30',
                          roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    from: '2026-10-05', to: '2026-10-11', students: [ada], sessions: [sat] }));
  assert(g.dates.includes('2026-10-10'),
     'a makeup booked on a Saturday must not be written and then made invisible');
});

test('a scheduled slot with no session yields an unmarked cell', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { students: [ada], slots: [slot] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 1, 'Monday is her day');
  eq(cells[0].state, 'unmarked', 'scheduled, nothing entered');
  eq(cells[0].minutes, 30, 'and it is worth 30 minutes');
  eq(g.rows[0].cells['2026-10-06'], undefined, 'Tuesday is not her day at all');
});

test('a materialized session replaces its slot rather than doubling it', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const session = m.session({ date: '2026-10-05', slotId: slot.id, startTime: '09:00',
                              endTime: '09:30', roster: [ada.id] });
  const row = m.attendance({ sessionId: session.id, studentId: ada.id, status: 'absent' });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], slots: [slot], sessions: [session], attendance: [row] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 1, 'one session, one box — not the slot AND the session');
  eq(cells[0].state, 'absent', 'and the session is what actually happened');
});

test('two sessions in one day render as two boxes, in time order', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const late = m.session({ date: '2026-10-05', startTime: '13:00', endTime: '13:30',
                           roster: [ada.id] });
  const early = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                            roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [late, early] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 2, 'merging would silently hide a miss');
  eq(cells.map(c => c.startTime), ['09:00', '13:00'], 'in the order she worked them');
});

test('a makeup lands on a day that is not that student’s scheduled day', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const makeup = m.session({ date: '2026-10-07', startTime: '11:00', endTime: '11:30',
                             roster: [ada.id] });          // a Wednesday, slotId null
  const row = m.attendance({ sessionId: makeup.id, studentId: ada.id,
                             status: null, isMakeup: true });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], slots: [slot], sessions: [makeup], attendance: [row] }));
  const cells = g.rows[0].cells['2026-10-07'];
  eq(cells.length, 1, 'it appears on its own date');
  eq(cells[0].state, 'unmarked', 'booked, not yet held');
  eq(cells[0].isMakeup, true, 'and it must never read as a routine session');
});

test('a student with no slots at all still gets a row', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { students: [ada] }));
  eq(g.rows.length, 1, 'she is on the caseload, so she is on the page');
  eq(g.rows[0].cells, {}, 'with nothing scheduled');
  eq(g.rows[0].pct.pct, null, 'and a dash, not a zero');
});

test('each row carries its own percentage and balance', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const held = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                           roster: [ada.id] });
  const skipped = m.session({ date: '2026-10-06', startTime: '09:00', endTime: '09:30',
                              roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [held, skipped],
    attendance: [
      m.attendance({ sessionId: held.id, studentId: ada.id, status: 'present' }),
      m.attendance({ sessionId: skipped.id, studentId: ada.id, status: 'missed' }),
    ] }));
  eq(g.rows[0].pct.pct, 100, 'the child was there for everything offered');
  eq(g.rows[0].owed.owed, 30, 'and she owes the session she did not hold');
});

test('sessions outside the range are ignored even if handed in', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const stray = m.session({ date: '2026-09-28', startTime: '09:00', endTime: '09:30',
                            roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [stray] }));
  eq(g.rows[0].cells, {}, 'the range is the range');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: every new test fails with `w.SLP.derive.attendanceGrid is not a function`.

- [ ] **Step 3: Implement the date helpers and `attendanceGrid`**

In the `SLP.derive` IIFE, after `attendancePct`:

```js
  const WEEKEND = new Set([0, 6]);
  const pad2 = n => String(n).padStart(2, '0');

  // Parsed as a local date so a range never shifts a day by timezone — the same
  // reason store.dayOfWeek does it this way.
  function dowOf(dateStr) {
    const [y, mo, d] = String(dateStr).split('-').map(Number);
    return new Date(y, mo - 1, d).getDay();
  }

  function eachDate(from, to) {
    const [y, mo, d] = String(from).split('-').map(Number);
    const cur = new Date(y, mo - 1, d);
    const out = [];
    // A guard, not a limit: 400 days is longer than any range she would pick, and
    // it stops a malformed `to` spinning the loop forever. An inverted range
    // (`from > to`) yields nothing rather than looping to the cap.
    if (!from || !to || from > to) return out;
    while (out.length < 400) {
      const ds = cur.getFullYear() + '-' + pad2(cur.getMonth() + 1) + '-' + pad2(cur.getDate());
      if (ds > to) break;
      out.push(ds);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  // Her paper form, with the arithmetic done. Pure: hand it the output of
  // store.attendanceRange and it returns everything on screen — no IndexedDB, no
  // await, so the whole page is testable without the harness opening a database.
  function attendanceGrid(data) {
    const { from, to, today, students = [], slots = [],
            sessions = [], attendance = [] } = data || {};
    const inRange = sessions.filter(s => s.date >= from && s.date <= to);

    // Weekdays are her form; a session is a fact. A makeup booked on a Saturday would
    // otherwise be written to the database and then be invisible on the page that owns it.
    const hasSession = new Set(inRange.map(s => s.date));
    const dates = eachDate(from, to)
      .filter(ds => !WEEKEND.has(dowOf(ds)) || hasSession.has(ds));

    const rowsBySession = {};
    for (const a of attendance) {
      (rowsBySession[a.sessionId] || (rowsBySession[a.sessionId] = {}))[a.studentId] = a;
    }

    // A materialized session outranks the slot it came from: its roster and times are
    // the snapshot of what actually happened, and the slot may have been edited since.
    const spokenFor = new Set(inRange.filter(s => s.slotId).map(s => s.date + '|' + s.slotId));

    const rows = students.map(student => {
      const cells = {};
      const push = (date, cell) => (cells[date] || (cells[date] = [])).push(cell);

      for (const session of inRange) {
        if (!(session.roster || []).includes(student.id)) continue;
        const row = (rowsBySession[session.id] || {})[student.id] || null;
        push(session.date, {
          sessionId: session.id, slotId: session.slotId,
          startTime: session.startTime, minutes: minutesOf(session),
          state: (row && row.status) || 'unmarked',
          isMakeup: !!(row && row.isMakeup),
        });
      }

      for (const date of dates) {
        const dow = dowOf(date);
        for (const slot of slots) {
          if (slot.dayOfWeek !== dow) continue;
          if (!(slot.studentIds || []).includes(student.id)) continue;
          if (spokenFor.has(date + '|' + slot.id)) continue;
          push(date, {
            sessionId: null, slotId: slot.id,
            startTime: slot.startTime, minutes: minutesOf(slot),
            state: 'unmarked', isMakeup: false,
          });
        }
      }

      for (const list of Object.values(cells)) {
        list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
      }

      // Both numbers come off the same cells; they differ only in which they read.
      const flat = Object.entries(cells).flatMap(([date, list]) => list.map(c => ({
        date, minutes: c.minutes, isMakeup: c.isMakeup,
        status: c.state === 'unmarked' ? null : c.state,
      })));

      return { student, cells,
               pct: attendancePct(flat, { today }),
               owed: makeupBalance(flat) };
    });

    return { dates, rows };
  }
```

Add `attendanceGrid` to the derive return list.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-derive.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: derive.attendanceGrid — the whole page as a pure function"
```

---

## Task 5: The bulk read

**Files:**
- Modify: `index.html` — `SLP.store` returned object, after `planForDate` (line 648)
- Test: `tests/attendance-store.test.js` (append)

**Interfaces:**
- Produces: `SLP.store.attendanceRange({ from, to, today? })` → `Promise<{ from, to, today, students, slots, sessions, attendance }>` — exactly the shape `derive.attendanceGrid` consumes. `today` defaults to `SLP.ui.todayStr()` is **not** used here (store must not reach into ui); callers pass it, and it is echoed back unchanged, defaulting to `null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-store.test.js`:

```js
test('attendanceRange returns exactly what the grid needs', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31',
                                                   today: '2026-10-31' });
  eq(data.students.map(s => s.name), ['Ada', 'Bo'], 'the caseload, by name');
  eq(data.slots.length, 1, 'the weekly template');
  eq(data.sessions.length, 1, 'the one session materialized by that write');
  eq(data.attendance.length, 1, 'and its attendance row');
  eq(data.today, '2026-10-31', 'the caller’s notion of today is echoed back');
});

test('attendanceRange excludes sessions outside the range', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setAttendance({ dateStr: '2026-11-02', slot,
                                    studentId: ada.id, status: 'absent' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(data.sessions.length, 1, 'only October');
  eq(data.attendance.length, 1, 'and no orphan rows from November’s session');
});

test('attendanceRange leaves former students off the page', async () => {
  const w = await loadApp();
  const { bo } = await attSeed(w);
  await w.SLP.store.setStudentActive(bo.id, false);
  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(data.students.map(s => s.name), ['Ada'], 'the grid is her current caseload');
});

test('attendanceRange does not fan out one query per session', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  // Thirty sessions — a month of a real caseload. The old shape would be hundreds
  // of IndexedDB round-trips; this must stay flat.
  for (let d = 1; d <= 30; d++) {
    const date = '2026-10-' + String(d).padStart(2, '0');
    await w.SLP.store.setAttendance({ dateStr: date, slot, studentId: ada.id,
                                      status: 'present' });
  }

  let calls = 0;
  const realGetAll = w.SLP.db.getAll, realGetAllBy = w.SLP.db.getAllBy;
  w.SLP.db.getAll = function (...a) { calls++; return realGetAll.apply(this, a); };
  w.SLP.db.getAllBy = function (...a) { calls++; return realGetAllBy.apply(this, a); };
  try {
    await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  } finally {
    w.SLP.db.getAll = realGetAll; w.SLP.db.getAllBy = realGetAllBy;
  }
  assert(calls <= 6, 'expected a handful of bulk reads, got ' + calls +
                     ' — the per-session fan-out is back');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all four fail with `w.SLP.store.attendanceRange is not a function`.

- [ ] **Step 3: Implement `attendanceRange`**

In the `SLP.store` returned object, immediately after `planForDate` (which ends at line 648) and before the `// --- write paths` comment (line 650):

```js
    // --- the grid ---
    // All the IO in one place, and none of the meaning. A month is roughly 30 students
    // × 22 days and a quarter closer to 30 × 60; querying per session, per store the way
    // planForDate does would be hundreds of round-trips at that size. Five bulk reads
    // instead, whatever the range. Everything computed lives in derive.attendanceGrid.
    async attendanceRange({ from, to, today = null }) {
      const students = (await db.getAll('students')).filter(s => s.active).sort(byName);
      const slots = await this.listSlots();
      const sessions = (await db.getAll('sessions'))
        .filter(s => s.date >= from && s.date <= to);
      const ids = new Set(sessions.map(s => s.id));
      // Filtered here rather than queried per session: one read of a store she has
      // a few thousand rows in beats one read per session she has hundreds of.
      const attendance = (await db.getAll('attendance')).filter(a => ids.has(a.sessionId));
      return { from, to, today, students, slots, sessions, attendance };
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-store.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: store.attendanceRange — one bulk read for the whole grid"
```

---

## Task 6: Session-level bulk marking

**Files:**
- Modify: `index.html` — `SLP.store` returned object, after `setAttendance` (line 676)
- Test: `tests/attendance-store.test.js` (append)

**Interfaces:**
- Consumes: `store.ensureSession`, `model.attendance`, `model.ATTENDANCE_STATUSES`
- Produces: `SLP.store.setSessionAttendance({ dateStr, slot, status })` → `Promise<Array<attendanceRow>>` — the rows actually written.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-store.test.js`:

```js
test('marking a session writes every student on its roster', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  const written = await w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'missed' });
  eq(written.length, 2, 'both students on the roster');

  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  const rows = await w.SLP.db.getAllBy('attendance', 'sessionId', session.id);
  eq(rows.map(r => r.status).sort(), ['missed', 'missed'], 'and both are on file');
  eq(rows.filter(r => r.studentId === ada.id).length, 1, 'Ada, once');
  eq(rows.filter(r => r.studentId === bo.id).length, 1, 'Bo, once');
});

test('a session-wide sweep does not overwrite a mark she made by hand', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });

  await w.SLP.store.setSessionAttendance({ dateStr: ATT_MONDAY, slot, status: 'missed' });

  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  const rows = await w.SLP.db.getAllBy('attendance', 'sessionId', session.id);
  const adaRow = rows.find(r => r.studentId === ada.id);
  const boRow = rows.find(r => r.studentId === bo.id);
  eq(adaRow.status, 'absent',
     'she said Ada was not there; a sweep must not blame the paperwork on the child');
  eq(boRow.status, 'missed', 'Bo, who had no mark, takes the sweep');
});

test('a bulk sweep is refused an unknown status too', async () => {
  const w = await loadApp();
  const { slot } = await attSeed(w);
  await throws(() => w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'snowday' }), 'same gate as the single write');
});

test('a session-wide mark creates no debt for a child who was absent', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setSessionAttendance({ dateStr: ATT_MONDAY, slot, status: 'missed' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31',
                                                   today: '2026-10-31' });
  const grid = w.SLP.derive.attendanceGrid(data);
  const adaRow = grid.rows.find(r => r.student.id === ada.id);
  const boRow = grid.rows.find(r => r.student.id === bo.id);
  eq(adaRow.owed.owed, 0, 'a child who stayed home is owed nothing');
  eq(boRow.owed.owed, 30, 'Bo turned up to a session that did not happen');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all four fail with `w.SLP.store.setSessionAttendance is not a function`.

- [ ] **Step 3: Implement `setSessionAttendance`**

In the `SLP.store` returned object, immediately after `setAttendance` (ends line 676):

```js
    // "I missed this whole session" is a bulk write, not a second field. A session-level
    // status plus per-student rows can contradict each other, and something then has to
    // arbitrate — a bug generator and an extra concept for a reader to hold. One source
    // of truth.
    //
    // A mark she already made by hand outranks the sweep, which is the same stickiness
    // rule deriveAttendance applies above. It is also the arithmetically right answer:
    // a child who was not there generates no debt, so sweeping `missed` over an `absent`
    // would invent minutes she does not owe. The per-cell popover is the way to change
    // one deliberately.
    async setSessionAttendance({ dateStr, slot, status }) {
      if (status !== null && !m.ATTENDANCE_STATUSES.includes(status)) {
        throw new Error('unknown attendance status: ' + status);
      }
      const session = await ensureSession(dateStr, slot);
      const existing = {};
      for (const r of await db.getAllBy('attendance', 'sessionId', session.id)) {
        existing[r.studentId] = r;
      }
      const written = [];
      for (const studentId of session.roster) {
        const prior = existing[studentId];
        if (prior && prior.status && prior.status !== 'present') continue;   // hers
        const row = prior || m.attendance({
          sessionId: session.id, studentId, status,
          participation: 'scheduled',
        });
        row.status = status;
        row.updatedAt = m.now();
        await db.put('attendance', row);
        written.push(row);
      }
      return written;
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-store.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: session-level marking as a bulk write that respects her own marks"
```

---

## Task 7: The Attendance tab — range picker, grid, and the two sticky columns

The page she asked for, read-only. Marking comes in Task 8.

**Files:**
- Modify: `index.html:1107–1111` (TABS), CSS block (before `</style>` at line 205), new section at line ~2126, `SLP.derive` (add `monthRange`)
- Test: `tests/attendance-ui.test.js` (replace the placeholder comment), `tests/attendance-derive.test.js` (append `monthRange` tests)

**Interfaces:**
- Consumes: `store.attendanceRange`, `derive.attendanceGrid`, `SLP.ui.studentFilters`, `SLP.ui.h`, `SLP.ui.todayStr`
- Produces:
  - `SLP.derive.monthRange(dateStr)` → `{ from, to }` — first and last day of that date's month
  - `SLP.ui.views.attendance` — the view function
  - DOM contract later tasks and tests depend on:
    - `#attendance-grid` — the `<table>`
    - `#attendance-from`, `#attendance-to` — the two `<input type="date">`
    - `th.att-day[data-date]` — one per column
    - `tr[data-student-id]` — one per student
    - `td.att-day[data-date]` — one cell per student per date
    - `button.att-cell[data-state][data-makeup][data-date][data-student-id]` — one per session box
    - `td.att-pct`, `td.att-owed` — the sticky right columns
    - `#attendance-legend`

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-derive.test.js`:

```js
test('the range defaults to the month she is in', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.monthRange('2026-10-14'), { from: '2026-10-01', to: '2026-10-31' },
     'a 31-day month');
  eq(w.SLP.derive.monthRange('2026-02-03'), { from: '2026-02-01', to: '2026-02-28' },
     'and February knows its own length');
});
```

Replace the contents of `tests/attendance-ui.test.js` with:

```js
// The Attendance tab. Every top-level name is prefixed `attUi` — tests/index.html
// loads each *.test.js into ONE global scope.

const ATT_UI_MONDAY = '2026-10-05';
const ATT_UI_TODAY = '2026-10-31';

async function attUiSeed(w) {
  // Pin the clock. `attendancePct` drops any date after today, so on a real clock every
  // October 2026 row below would vanish and these assertions would die. `todayStr` is a
  // namespace export called per render, so overriding it here holds for the whole test.
  // Pin it — do NOT rewrite these dates into the past, which would silently destroy the
  // future-exclusion coverage the dropped-date tests exist to provide.
  w.SLP.ui.todayStr = () => ATT_UI_TODAY;
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincoln' });
  const bo = m.student({ name: 'Bo', grade: '4', school: 'Fairview' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, bo, slot };
}

// House style for a range change is aggregation.test.js:66-69 — set the value, dispatch a
// bubbling change, then await one render. Re-query between the two renders rather than
// holding a reference across them: each render tears #app down and builds new nodes, so a
// handle taken before the first render is detached by the second.
async function attUiSetRange(w, id, value) {
  const el = w.document.querySelector('#attendance-' + id);
  el.value = value;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();
}

async function attUiOpen(w, from = '2026-10-01', to = '2026-10-31') {
  await w.SLP.ui.go({ tab: 'attendance' });
  await attUiSetRange(w, 'from', from);
  await attUiSetRange(w, 'to', to);
  return w.document;
}

function attUiRow(doc, student) {
  return doc.querySelector('#attendance-grid tr[data-student-id="' + student.id + '"]');
}

function attUiCells(doc, student, date) {
  return Array.from(attUiRow(doc, student)
    .querySelectorAll('td.att-day[data-date="' + date + '"] .att-cell'));
}

test('Attendance is a top-level tab', async () => {
  const w = await loadApp();
  const tab = w.document.querySelector('.tab[data-tab="attendance"]');
  assert(tab, 'it is caseload-wide, so it does not belong inside Students');
  eq(tab.textContent, 'Attendance', 'labelled plainly');
});

test('clicking the tab opens the grid over the current month', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  w.document.querySelector('.tab[data-tab="attendance"]').click();
  await w.SLP.ui.render();
  const doc = w.document;
  assert(doc.querySelector('#attendance-grid'), 'the grid rendered');
  const expected = w.SLP.derive.monthRange(w.SLP.ui.todayStr());
  eq(doc.querySelector('#attendance-from').value, expected.from, 'defaults to this month');
  eq(doc.querySelector('#attendance-to').value, expected.to, 'through its last day');
});

test('the grid runs weekdays across and the caseload down', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-11');
  const days = Array.from(doc.querySelectorAll('#attendance-grid th.att-day'))
    .map(th => th.dataset.date);
  eq(days, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
     'M–F; weekends would be dead columns on her form');
  assert(attUiRow(doc, ada), 'Ada has a row');
  assert(attUiRow(doc, bo), 'Bo has a row');
});

test('a scheduled but unmarked session shows as a box, an unscheduled day as a dot', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const monday = attUiCells(doc, ada, '2026-10-05');
  eq(monday.length, 1, 'Monday is her day');
  eq(monday[0].dataset.state, 'unmarked', 'scheduled, nothing entered');
  eq(attUiCells(doc, ada, '2026-10-06').length, 0, 'Tuesday is not');
  assert(attUiRow(doc, ada).querySelector('td.att-day[data-date="2026-10-06"] .att-none'),
     'and it says so with a dot rather than a blank');
});

test('each state carries its own glyph, not just a colour', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const cell = attUiCells(doc, ada, ATT_UI_MONDAY)[0];
  eq(cell.dataset.state, 'missed', 'the state is on the element');
  assert(cell.textContent.trim().length > 0,
     'her highlighter system does not survive a grayscale print — the glyph must');
  assert((cell.getAttribute('aria-label') || '').includes('Ada'),
     'and a screen reader is told whose cell this is');
});

test('the percentage and the owed minutes sit in the sticky right columns', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-12', slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-19', slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  const row = attUiRow(doc, ada);
  const pct = row.querySelector('td.att-pct').textContent;
  assert(pct.includes('50%'), 'offered twice, present once — got ' + pct);
  assert(pct.includes('1 of 2'), 'the counts she writes in the note — got ' + pct);
  assert(row.querySelector('td.att-owed').textContent.includes('30'),
     'and the 30 minutes she owes for the session she missed');
});

test('a student with nothing offered reads as a dash', async () => {
  const w = await loadApp();
  const { bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-12-01', '2026-12-31');
  eq(attUiRow(doc, bo).querySelector('td.att-pct').textContent, '—',
     'not 0%, which reads as a child who never came');
});

test('an uncharted session is counted in plain sight beside the number', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-19');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct').textContent;
  assert(pct.includes('uncharted'),
     'a quarter with one charted session must not read as a confident 100% — got ' + pct);
});

test('the student filters narrow the grid', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const search = doc.querySelector('#attendance-search');
  assert(search, 'the grid is the second caller studentFilters was factored for');
  search.value = 'Ada';
  search.dispatchEvent(new w.Event('input'));
  await w.SLP.ui.render();
  assert(attUiRow(w.document, ada), 'Ada stays');
  assert(!attUiRow(w.document, bo), 'Bo is filtered out');
});

test('the legend names every glyph on the page', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const legend = doc.querySelector('#attendance-legend');
  assert(legend, 'the vocabulary is not something she should have to memorise');
  for (const word of ['held', 'absent', 'missed', 'cancelled', 'makeup']) {
    assert(legend.textContent.toLowerCase().includes(word), 'legend names ' + word);
  }
});

test('a month band groups the day numbers it repeats', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  // A quarter shows "1" three times; without the band nothing says which month.
  const doc = await attUiOpen(w, '2026-10-01', '2026-12-31');
  const band = Array.from(doc.querySelectorAll('#attendance-months .att-month'));
  eq(band.map(th => th.textContent), ['Oct 2026', 'Nov 2026', 'Dec 2026'], 'one per month');
  eq(band.map(th => Number(th.getAttribute('colspan'))), [31, 30, 31],
     'each band spans exactly its own days, or it sits over the wrong columns');
  const days = doc.querySelectorAll('#attendance-grid thead th.att-day').length;
  eq(band.reduce((n, th) => n + Number(th.getAttribute('colspan')), 0), days,
     'the band and the day row must cover the same width');
});

test('a percentage over an incomplete range is styled as provisional', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-19');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct');
  assert(pct.textContent.includes('uncharted'), 'the count is there');
  assert(pct.classList.contains('att-pct-provisional'),
     'and the number itself looks unfinished — she reads it at a glance onto a note');
});

test('a fully charted range is not flagged as provisional', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-05');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct');
  assert(!pct.classList.contains('att-pct-provisional'),
     'flagging a complete number would make the flag mean nothing');
});

test('an end date before the start says so instead of emptying the caseload', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-31', '2026-10-01');
  assert(doc.querySelector('#attendance-range-error'),
     'an empty grid alone reads as "my students are gone", not "I typed the dates backwards"');
  eq(doc.querySelector('#attendance-grid'), null, 'and no grid is drawn from a range that has no days');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: `monthRange is not a function`, and every UI test fails — there is no `attendance` tab, so `.tab[data-tab="attendance"]` is null.

- [ ] **Step 3: Add `monthRange` to derive**

In the `SLP.derive` IIFE, after `eachDate`:

```js
  // Her default range. `new Date(y, mo, 0)` is the last day of month `mo` — the
  // zeroth day of the next one — so February needs no special case.
  function monthRange(dateStr) {
    const [y, mo] = String(dateStr).split('-').map(Number);
    const last = new Date(y, mo, 0).getDate();
    return { from: y + '-' + pad2(mo) + '-01', to: y + '-' + pad2(mo) + '-' + pad2(last) };
  }
```

Add `monthRange` to the derive return list.

- [ ] **Step 4: Register the tab**

`index.html:1107–1111`. Replace:

```js
  const TABS = [
    ['today', 'Today'],
    ['students', 'Students'],
    ['schedule', 'Schedule'],
  ];
```

with:

```js
  const TABS = [
    ['today', 'Today'],
    ['students', 'Students'],
    ['schedule', 'Schedule'],
    ['attendance', 'Attendance'],
  ];
```

- [ ] **Step 5: Add the styles**

In the CSS block, immediately before `</style>` (line 205):

```css
  /* --- the attendance grid --- */
  /* The table is the only horizontally scrolling thing on the page: #app is capped
     at 1100px and a quarter is sixty columns wide. The document keeps scrolling
     vertically, which is what the scroll-position fix in doRender() depends on. */
  .att-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
  .att-grid { border-collapse: separate; border-spacing: 0; font-size: 13px; }
  .att-grid th, .att-grid td {
    padding: 3px 5px; text-align: center; white-space: nowrap;
    border-bottom: 1px solid var(--line); background: var(--bg);
  }
  .att-grid thead th { font-weight: 600; color: var(--muted); font-size: 11px; }
  .att-grid tbody tr:nth-child(even) th,
  .att-grid tbody tr:nth-child(even) td { background: var(--row); }
  /* Sticky in three places: her name on the left, and the two answers on the right.
     Set to a quarter she does not scroll at all — these columns are the whole point. */
  .att-grid .att-name { position: sticky; left: 0; z-index: 2; text-align: left;
                        min-width: 130px; font-weight: 400; }
  /* 150px does not fit "78% · 7 of 9 · 3 uncharted" at 13px, and this column is
     nowrap and sticky, so the overflow lands under the Owed column rather than
     wrapping. Sized to the longest real string; confirm it in the screenshot pass. */
  .att-grid .att-pct  { position: sticky; right: 96px; z-index: 2; text-align: right;
                        min-width: 210px; border-left: 1px solid var(--line); }
  .att-grid .att-owed { position: sticky; right: 0; z-index: 2; text-align: right;
                        min-width: 96px; }
  .att-grid thead .att-name, .att-grid thead .att-pct, .att-grid thead .att-owed { z-index: 3; }
  /* A percentage computed over an incomplete quarter is provisional (spec:174-175).
     The uncharted count says so in words; this says so at a glance. */
  .att-grid .att-pct-provisional { font-style: italic; color: var(--muted); }
  /* The month band above the day numbers. Ruled off so the runs read as groups. */
  .att-grid thead .att-month { border-bottom: 1px solid var(--line);
                               border-left: 1px solid var(--line);
                               font-size: 11px; letter-spacing: .3px; }
  .att-cell { border: 0; background: none; padding: 0 3px; cursor: pointer;
              font: inherit; line-height: 1.2; color: var(--muted); }
  .att-cell[data-state="present"]   { color: var(--ok); }
  .att-cell[data-state="absent"]    { color: var(--danger); }
  .att-cell[data-state="missed"]    { color: var(--warn); font-weight: 700; }
  .att-cell[data-state="cancelled"] { color: var(--muted); }
  .att-cell sup { font-size: 9px; letter-spacing: .5px; }
  .att-none { color: var(--line); }
  .att-owed-debt { color: var(--warn); }
  .att-legend { font-size: 12px; color: var(--muted); margin: 10px 0 0;
                display: flex; flex-wrap: wrap; gap: 12px; }
```

- [ ] **Step 6: Write the view**

Insert a new section in `index.html` between the end of `ui.today` (`})();` at line 2125) and the `// SECTION: ui.aggregation` banner (starts line 2127):

```js
// ============================================================
// SECTION: ui.attendance — the caseload grid.
// Her paper clipboard form, with the arithmetic done for her. One store call does
// all the IO; one pure function produces everything on screen.
// ============================================================
(() => {
  const { h } = SLP.ui;

  // Survives re-render within the tab, like ui.schedule's draft. The range is null
  // until the first render so it can default to whatever month she opens it in.
  const ui = { search: '', gradeFilter: '', schoolFilter: '', range: null };

  // Glyph AND colour, never colour alone: her highlighter system does not survive a
  // colourblind reader or a grayscale print, and these go home in a folder.
  const GLYPH = { present: '✓', absent: '✗', missed: '–',
                  cancelled: '∅', unmarked: '▫' };
  const LABEL = { present: 'held', absent: 'absent', missed: 'I missed it',
                  cancelled: 'cancelled', unmarked: 'scheduled, unmarked' };

  const dayNum = ds => String(Number(ds.split('-')[2]));

  const MONTH_NAME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthKey = ds => ds.slice(0, 7);
  const monthLabel = ds => MONTH_NAME[Number(ds.slice(5, 7)) - 1] + ' ' + ds.slice(0, 4);

  // The day row carries day-of-month alone, so a quarter shows "1" three times with
  // nothing to say which month each belongs to. Group the dates into one band above.
  function monthBand(dates) {
    const spans = [];
    dates.forEach(d => {
      const k = monthKey(d);
      const last = spans[spans.length - 1];
      if (last && last.key === k) last.count++;
      else spans.push({ key: k, label: monthLabel(d), count: 1 });
    });
    return spans;
  }

  function pctText(p) {
    if (p.pct === null) return '—';
    let s = p.pct + '% · ' + p.heldSessions + ' of ' + p.offeredSessions;
    // Excluding uncharted sessions quietly would let three charted out of thirty
    // read as a confident 100%. The count travels with the number.
    if (p.uncharted) s += ' · ' + p.uncharted + ' uncharted';
    return s;
  }

  // The spec styles the figure as provisional whenever uncharted is non-zero
  // (spec:174-175). The count alone is not the flag — the number itself must look
  // unfinished, because that is what she reads at a glance onto a progress note.
  const pctProvisional = p => !!(p && p.pct !== null && p.uncharted);

  function cellEl(date, row, cell) {
    return h('button', {
      class: 'att-cell', type: 'button',
      'data-state': cell.state,
      'data-makeup': cell.isMakeup ? 'true' : 'false',
      'data-date': date,
      'data-student-id': row.student.id,
      'data-session-id': cell.sessionId,
      'data-slot-id': cell.slotId,
      'aria-label': row.student.name + ', ' + date + ': ' + LABEL[cell.state] +
                    (cell.isMakeup ? ' (makeup)' : ''),
    }, ...makeupGlyph(cell));
  }

  // Spec glyphs (spec:215): a *held* makeup is the single character `Ⓜ`, and every other
  // makeup state is its own glyph with a superscript M — so a booked-but-unmarked one
  // reads `▫ᴹ`. A uniform superscript would make a held makeup indistinguishable from a
  // held ordinary session at a glance, which is the distinction the column exists for.
  function makeupGlyph(cell) {
    const base = GLYPH[cell.state] || '?';
    if (!cell.isMakeup) return [base];
    if (cell.state === 'present') return ['Ⓜ'];
    return [base, h('sup', { text: 'M' })];
  }

  function legend() {
    return h('p', { class: 'att-legend', id: 'attendance-legend' },
      h('span', { text: '✓ held' }),
      h('span', { text: '✗ absent' }),
      h('span', { text: '– I missed it' }),
      h('span', { text: '∅ cancelled' }),
      h('span', { text: '▫ scheduled, unmarked' }),
      h('span', { text: '· not scheduled' }),
      h('span', { text: 'Ⓜ makeup (held)' }),
      h('span', { text: '▫ᴹ makeup booked, unmarked' }));
  }

  function gridTable(grid) {
    // Two header rows. The day row carries day-of-month alone, which repeats across a
    // quarter ("1" three times); the band above it names the month each run belongs to.
    const monthRow = h('tr', { id: 'attendance-months' },
      h('th', { class: 'att-name', scope: 'col' }),
      monthBand(grid.dates).map(s => h('th', {
        class: 'att-month', scope: 'colgroup', colspan: String(s.count),
        'data-month': s.key, text: s.label })),
      h('th', { class: 'att-pct', scope: 'col' }),
      h('th', { class: 'att-owed', scope: 'col' }));

    const head = h('tr', {},
      h('th', { class: 'att-name', scope: 'col', text: 'Student' }),
      grid.dates.map(d => h('th', { class: 'att-day', scope: 'col',
                                    'data-date': d, text: dayNum(d) })),
      h('th', { class: 'att-pct', scope: 'col', text: '%' }),
      h('th', { class: 'att-owed', scope: 'col', text: 'Owed' }));

    const body = grid.rows.map(row =>
      h('tr', { 'data-student-id': row.student.id },
        h('th', { class: 'att-name', scope: 'row', text: row.student.name }),
        grid.dates.map(d => {
          const cells = row.cells[d] || [];
          // Two sessions in one day render as two boxes rather than one merged
          // verdict — uncommon, but merging would silently hide a miss.
          return h('td', { class: 'att-day', 'data-date': d },
            cells.length ? cells.map(c => cellEl(d, row, c))
                         : h('span', { class: 'att-none', text: '·' }));
        }),
        h('td', { class: 'att-pct' + (pctProvisional(row.pct) ? ' att-pct-provisional' : ''),
                  text: pctText(row.pct) }),
        h('td', { class: 'att-owed' },
          row.owed.owed
            ? h('span', { class: 'att-owed-debt', text: '−' + row.owed.owed + ' min' })
            : h('span', { text: '—' }))));

    return h('div', { class: 'att-wrap' },
      h('table', { class: 'att-grid', id: 'attendance-grid' },
        h('thead', {}, monthRow, head), h('tbody', {}, body)));
  }

  SLP.ui.views.attendance = async (root) => {
    // One control, two jobs: left at its default she marks the current month and
    // scrolls a little; set to a quarter at progress-note time she does not scroll
    // at all. Her Q1-versus-Q1-plus-Q2 split is two ranges on this one screen.
    if (!ui.range) ui.range = SLP.derive.monthRange(SLP.ui.todayStr());

    const from = h('input', { type: 'date', id: 'attendance-from', value: ui.range.from });
    const to = h('input', { type: 'date', id: 'attendance-to', value: ui.range.to });
    from.addEventListener('change', async () => {
      ui.range = { from: from.value, to: ui.range.to };
      await SLP.ui.render();
    });
    to.addEventListener('change', async () => {
      ui.range = { from: ui.range.from, to: to.value };
      await SLP.ui.render();
    });

    // She sets the two ends one at a time, so "end before start" is a normal state on
    // the way from one range to another — the picker stores what she typed and says so,
    // rather than refusing the keystroke and stranding her half-way. eachDate yields
    // nothing for an inverted range, so the grid below is empty rather than wrong.
    const invalidRange = !ui.range.from || !ui.range.to || ui.range.from > ui.range.to;
    if (invalidRange) SLP.ui.toast('The end date must be after the start.', 'warn');

    const data = await SLP.store.attendanceRange({
      from: ui.range.from, to: ui.range.to, today: SLP.ui.todayStr() });

    // The filters take the caseload, not the grid rows, so a school with nobody
    // left in it drops off the list the same way it does on the Students tab.
    const filters = SLP.ui.studentFilters({
      idPrefix: 'attendance', state: ui, students: data.students,
      onChange: () => SLP.ui.render(),
    });
    const shown = new Set(filters.shown.map(s => s.id));

    const grid = SLP.derive.attendanceGrid(data);
    grid.rows = grid.rows.filter(r => shown.has(r.student.id));

    root.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Attendance' }),
      h('div', { class: 'row-form' }, 'From', from, 'to', to),
      filters.el,
      invalidRange
        ? h('p', { class: 'empty', id: 'attendance-range-error',
                   text: 'The end date must be after the start.' })
        : grid.rows.length
          ? gridTable(grid)
          : h('p', { class: 'empty', text: 'No students match.' }),
      legend()));
  };
})();
```

The message appears twice on purpose: the toast is what she notices, and the line in the
panel is what is still on screen a few seconds later when she looks back at an empty grid
and wonders whether her caseload has gone.

- [ ] **Step 7: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 8: Verify by measurement, not by the green suite**

Layout is one of this app's three blind spots (the others are scroll position and async timing), and a green suite agrees with all of them. Adapt `tmp/measure-collapse.html` into `tmp/measure-attendance.html`: load the real app, seed six students on a Monday slot, open the Attendance tab over a full quarter, and report `getBoundingClientRect()` for:

- `#attendance-grid th.att-name` (left column — must not overlap the first day column)
- `td.att-pct` and `td.att-owed` (must be pinned to the right edge while the day columns scroll under them)
- `.att-wrap` `scrollWidth` vs `clientWidth` (must exceed it for a quarter, proving the scroll is inside the wrapper and not on the document)

Drive it the same way `run-tests.sh` drives Chrome. Record the numbers in the commit message.

**Headless screenshots do work — take one as well.** Earlier handoffs say they don't; that was half right. The culprit is `--virtual-time-budget`, which freezes IndexedDB so the app never finishes booting and the page captures blank. **Drop that flag and `--screenshot` renders the real app.** Verified 2026-09-02 against both the local file and the hosted URL:

```bash
google-chrome --headless=new --no-sandbox --disable-gpu \
  --user-data-dir=/tmp/att-shot --window-size=1400,900 \
  --screenshot=tmp/attendance.png "file:///home/brenden/dev/slp-tracker/index.html"
```

A blank capture means the flag crept back in, or the shot beat the async render — take a second one before concluding the layout is broken. The grid is this app's widest, most alignment-dependent surface; a picture catches the sticky-column overlap that a `getBoundingClientRect()` number can agree with and still look wrong.

**Judge the picture yourself.** Do not defer the visual call to Brenden — open the PNG, look
at it, and say in the commit message what you concluded. Two things to look for specifically,
because both are live suspicions rather than hypotheticals: the `%` column is `nowrap` and
sticky, so `78% · 7 of 9 · 3 uncharted` overflowing its `min-width` slides under `Owed`
rather than wrapping; and the month band's `colspan` runs must line up with the day columns
beneath them. Keep the shot — Task 10 Step 7 collects it into one contact sheet.

- [ ] **Step 9: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-derive.test.js tests/attendance-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: the Attendance tab — her caseload over a range she picks"
```

---

## Task 8: Marking a cell

**Files:**
- Modify: `index.html` — `ui.attendance` section (cell handler, popover), CSS block
- Test: `tests/attendance-ui.test.js` (append)

**Interfaces:**
- Consumes: `store.setAttendance`, `store.setSessionAttendance`, `store.listSlots`
- Produces: DOM contract —
  - `#att-popover` — the open popover, at most one on the page
  - `button.att-choice[data-status]` — one per outcome
  - `button.att-choice-session[data-status]` — the session-wide sweep
  - `#att-popover-close`

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-ui.test.js`:

```js
function attUiPopover(doc) { return doc.querySelector('#att-popover'); }

async function attUiOpenCell(w, student, date) {
  attUiCells(w.document, student, date)[0].click();
  await w.SLP.ui.render();
  return attUiPopover(w.document);
}

test('clicking a cell offers the four outcomes rather than cycling', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  assert(pop, 'a popover, not a click-to-cycle');
  const offered = Array.from(pop.querySelectorAll('.att-choice'))
    .map(b => b.dataset.status).sort();
  eq(offered, ['absent', 'cancelled', 'missed', 'present'],
     'four states means overshooting, and cycling hides the vocabulary');
});

test('picking an outcome writes it and closes the popover', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice[data-status="missed"]').click();
  await w.SLP.ui.render();

  eq(attUiCells(w.document, ada, ATT_UI_MONDAY)[0].dataset.state, 'missed',
     'the cell shows what she chose');
  assert(!attUiPopover(w.document), 'and the popover is gone');
});

test('a mark made in the grid shows up in the owed column immediately', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-01', '2026-10-31');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice[data-status="missed"]').click();
  await w.SLP.ui.render();
  assert(attUiRow(w.document, ada).querySelector('td.att-owed').textContent.includes('30'),
     'the Owed column is the answer to "who needs makeup sessions"');
});

test('the popover can mark the whole session at once', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice-session[data-status="cancelled"]').click();
  await w.SLP.ui.render();

  eq(attUiCells(w.document, ada, ATT_UI_MONDAY)[0].dataset.state, 'cancelled', 'Ada');
  eq(attUiCells(w.document, bo, ATT_UI_MONDAY)[0].dataset.state, 'cancelled',
     'a snow day closed the school for everyone in the room');
});

test('only one popover is open at a time', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  await attUiOpenCell(w, bo, ATT_UI_MONDAY);
  eq(w.document.querySelectorAll('#att-popover').length, 1, 'exactly one');
  eq(attUiPopover(w.document).dataset.studentId, bo.id, 'and it is the one she just clicked');
});

test('marking a day the schedule never had still works', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  // A one-off session on a Wednesday: no slot, so the cell comes from the session.
  // Written straight to the store because Task 9's bookMakeup does not exist yet — and
  // this test is about marking an ad-hoc cell, not about how it came to be booked.
  await w.SLP.db.put('sessions', w.SLP.model.session({
    date: '2026-10-07', slotId: null, startTime: '11:00', endTime: '11:30',
    roster: [ada.id] }));
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const cells = attUiCells(doc, ada, '2026-10-07');
  eq(cells.length, 1, 'the ad-hoc session has a cell');
  cells[0].click();
  await w.SLP.ui.render();
  const pop = attUiPopover(w.document);
  pop.querySelector('.att-choice[data-status="present"]').click();
  await w.SLP.ui.render();
  eq(attUiCells(w.document, ada, '2026-10-07')[0].dataset.state, 'present',
     'a session with no slot is still markable');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all fail — clicking a cell does nothing, so `#att-popover` is null.

- [ ] **Step 3: Add the popover styles**

Append to the attendance CSS block, before `</style>`:

```css
  .att-popover { position: absolute; z-index: 20; background: var(--bg);
                 border: 1px solid var(--line); border-radius: 8px; padding: 8px;
                 box-shadow: 0 4px 14px rgba(0,0,0,.12); min-width: 190px; }
  .att-popover h3 { font-size: 11px; margin: 0 0 6px; text-transform: uppercase;
                    letter-spacing: .5px; color: var(--muted); font-weight: 600; }
  .att-popover .att-choices { display: flex; flex-direction: column; gap: 2px; }
  .att-popover button { text-align: left; }
  .att-popover hr { border: 0; border-top: 1px solid var(--line); margin: 8px 0 6px; }
```

- [ ] **Step 4: Implement the popover**

Inside the `ui.attendance` IIFE, add to the state object:

```js
  const ui = { search: '', gradeFilter: '', schoolFilter: '', range: null,
               marking: null };   // { studentId, date, sessionId, slotId }
```

Add these functions before `SLP.ui.views.attendance`:

```js
  // A slot object is what setAttendance wants, and the cell may know only a sessionId
  // (an ad-hoc session has no slot at all). ensureSession is keyed on slot.id, so a
  // session with no slot needs its own path: write straight to the row instead.
  async function markCell(target, status, wholeSession) {
    const { date, slotId, sessionId, studentId } = target;
    if (slotId) {
      const slot = (await SLP.store.listSlots()).find(s => s.id === slotId);
      if (slot) {
        if (wholeSession) {
          await SLP.store.setSessionAttendance({ dateStr: date, slot, status });
        } else {
          await SLP.store.setAttendance({ dateStr: date, slot, studentId, status });
        }
        return;
      }
    }
    // No slot: a one-off session. Its row is written directly, and a session-wide
    // sweep walks the roster the same way store.setSessionAttendance does.
    if (!sessionId) return;
    const session = await SLP.db.get('sessions', sessionId);
    if (!session) return;
    const rows = await SLP.db.getAllBy('attendance', 'sessionId', sessionId);
    const targets = wholeSession ? session.roster : [studentId];
    for (const id of targets) {
      const prior = rows.find(r => r.studentId === id);
      if (wholeSession && prior && prior.status && prior.status !== 'present') continue;
      const row = prior || SLP.model.attendance({
        sessionId, studentId: id, status,
        participation: session.roster.includes(id) ? 'scheduled' : 'added' });
      row.status = status;
      row.updatedAt = SLP.model.now();
      await SLP.db.put('attendance', row);
    }
  }

  function choice(status, wholeSession) {
    return h('button', {
      class: (wholeSession ? 'att-choice-session' : 'att-choice') + ' plain',
      type: 'button', 'data-status': status,
      text: (wholeSession ? 'Whole session: ' : '') + LABEL[status],
      'on:click': async () => {
        const target = ui.marking;
        ui.marking = null;
        await markCell(target, status, wholeSession);
        await SLP.ui.render();
      },
    });
  }

  // Rendered into the page rather than positioned against the clicked element: every
  // render tears #app down, so an element-anchored popover would have nothing to
  // anchor to on the way back. The route through state is the same one the Today
  // card's expansion takes.
  function popover() {
    if (!ui.marking) return null;
    return h('div', { class: 'att-popover panel', id: 'att-popover',
                      'data-student-id': ui.marking.studentId,
                      'data-date': ui.marking.date, role: 'dialog',
                      'aria-label': 'Mark ' + ui.marking.studentName + ' on ' + ui.marking.date },
      h('h3', { text: ui.marking.studentName + ' · ' + ui.marking.date }),
      h('div', { class: 'att-choices' },
        SLP.model.ATTENDANCE_STATUSES.map(s => choice(s, false)),
        h('hr', {}),
        // One reason to mark a whole session at once, and it is the honest one:
        // a closure or a day she was out is not a per-child fact.
        choice('missed', true),
        choice('cancelled', true)),
      h('button', { class: 'linkish', id: 'att-popover-close', type: 'button', text: 'Cancel',
                    'on:click': async () => { ui.marking = null; await SLP.ui.render(); } }));
  }
```

In `cellEl`, add the click handler — replace the `h('button', {` attribute block's closing by adding before the children:

```js
      'on:click': () => {
        ui.marking = {
          studentId: row.student.id, studentName: row.student.name, date,
          sessionId: cell.sessionId, slotId: cell.slotId,
        };
        SLP.ui.render();
      },
```

In `SLP.ui.views.attendance`, append the popover to the section — change the final `root.appendChild(...)` call so the section's last child is `popover()`:

```js
    root.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Attendance' }),
      h('div', { class: 'row-form' }, 'From', from, 'to', to),
      filters.el,
      grid.rows.length
        ? gridTable(grid)
        : h('p', { class: 'empty', text: 'No students match.' }),
      legend(),
      popover()));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed.

- [ ] **Step 6: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: mark a cell from the grid, one student or the whole session"
```

---

## Task 9: Booking a makeup, and deleting one

**Files:**
- Modify: `index.html` — `SLP.store` (after `setSessionAttendance`), `SLP.derive` (`makeupDuration`), `ui.attendance` (booking form), CSS
- Test: `tests/attendance-store.test.js`, `tests/attendance-derive.test.js`, `tests/attendance-ui.test.js` (append to each)

**Interfaces:**
- Consumes: `derive.minutesOf`, `model.session`, `model.attendance`
- Produces:
  - `SLP.derive.makeupDuration(owedMinutes, slots, studentId)` → `number`
  - `SLP.store.bookMakeup({ date, startTime, endTime, location?, studentId })` → `Promise<{ session, attendance }>`
  - `SLP.store.deleteMakeup(sessionId)` → `Promise<void>`
  - DOM: `#att-booking`, `#att-book-date`, `#att-book-start`, `#att-book-end`, `#att-book-where`, `#att-book-save`, `#att-book-cancel`, `button.att-owed-open`, `#att-delete-makeup`, `#att-delete-makeup-confirm`

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-derive.test.js`:

```js
test('a makeup is proposed at one session’s length, not the whole debt', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: ['s1'] });
  eq(w.SLP.derive.makeupDuration(90, [slot], 's1'), 30,
     'a student owed 90 minutes gets a 30-minute makeup proposed, not a 90-minute one');
});

test('a makeup shorter than one session is proposed at what is owed', async () => {
  const w = await loadApp();
  const slot = w.SLP.model.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                                  studentIds: ['s1'] });
  eq(w.SLP.derive.makeupDuration(15, [slot], 's1'), 15, 'never longer than the debt');
});

test('the cap is that student’s longest regular session', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const short = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                         studentIds: ['s1'] });
  const long = m.slot({ dayOfWeek: 3, startTime: '11:00', endTime: '12:00',
                        studentIds: ['s1'] });
  const other = m.slot({ dayOfWeek: 4, startTime: '13:00', endTime: '15:00',
                         studentIds: ['s2'] });
  eq(w.SLP.derive.makeupDuration(120, [short, long, other], 's1'), 60,
     'someone else’s two-hour block is not a cap on hers');
});

test('a student with no regular slot is proposed the whole debt', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupDuration(45, [], 's1'), 45, 'nothing to cap against');
});
```

Append to `tests/attendance-store.test.js`:

```js
test('booking a makeup writes a one-off session and an unheld makeup row', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  const { session, attendance } = await w.SLP.store.bookMakeup({
    date: '2026-10-16', startTime: '11:00', endTime: '11:30',
    location: 'Room 4', studentId: ada.id });

  eq(session.slotId, null, 'a one-off is not recurring');
  eq(session.roster, [ada.id], 'a roster of one');
  eq(attendance.isMakeup, true, 'the makeup flag is per-student, on the row');
  eq(attendance.status, null,
     'booked is not held — crediting it now would zero the debt before the session happens');
});

test('booking a makeup does not pay the debt down until it is held', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', studentId: ada.id });

  const before = w.SLP.derive.attendanceGrid(await w.SLP.store.attendanceRange({
    from: '2026-10-01', to: '2026-10-31', today: '2026-10-31' }));
  eq(before.rows.find(r => r.student.id === ada.id).owed.owed, 30,
     'still outstanding — she has not delivered it yet');

  const booked = (await w.SLP.db.getAll('sessions')).find(s => s.date === '2026-10-16');
  const row = (await w.SLP.db.getAllBy('attendance', 'sessionId', booked.id))[0];
  row.status = 'present';
  await w.SLP.db.put('attendance', row);

  const after = w.SLP.derive.attendanceGrid(await w.SLP.store.attendanceRange({
    from: '2026-10-01', to: '2026-10-31', today: '2026-10-31' }));
  eq(after.rows.find(r => r.student.id === ada.id).owed.owed, 0, 'settled once held');
});

test('a booked makeup appears on Today for its date', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', location: 'Room 4', studentId: ada.id });
  const plan = await w.SLP.store.planForDate('2026-10-16');
  eq(plan.length, 1, 'planForDate already folds in ad-hoc sessions');
  eq(plan[0].students.map(s => s.name), ['Ada'], 'and it is her session');
});

test('deleting a makeup takes its rows with it', async () => {
  const w = await loadApp();
  const { ada, objective } = await attSeed(w);
  const { session } = await w.SLP.store.bookMakeup({
    date: '2026-10-16', startTime: '11:00', endTime: '11:30', studentId: ada.id });
  const adHocSlot = { id: null, sessionId: session.id, startTime: '11:00',
                      endTime: '11:30', studentIds: [ada.id], location: '' };
  await w.SLP.store.saveNote({ dateStr: '2026-10-16', slot: adHocSlot,
                               studentId: ada.id, text: 'x' });
  await w.SLP.store.recordValue({ dateStr: '2026-10-16', slot: adHocSlot,
                                  studentId: ada.id, objectiveId: objective.id,
                                  fieldId: objective.fields[0].id, raw: '4' });

  await w.SLP.store.deleteMakeup(session.id);

  eq(await w.SLP.db.get('sessions', session.id), undefined, 'the session is gone');
  // All four stores, not just the two that are easy to reach — the notes and datapoints
  // loop is the half that was shipped untested, and a backup carries whatever it misses.
  for (const store of ['attendance', 'notes', 'datapoints']) {
    eq((await w.SLP.db.getAllBy(store, 'sessionId', session.id)).length, 0,
       store + ' rows nothing can read again still ride in every backup she makes');
  }
});

test('two makeups on one day do not write into each other', async () => {
  const w = await loadApp();
  const { ada, bo } = await attSeed(w);
  // The collision ADR 0001 exists for: both sessions are slotless on the same date, so
  // a lookup keyed on `slotId === null` cannot tell them apart and returns the first.
  const first = await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                               endTime: '11:30', studentId: ada.id });
  const second = await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '13:00',
                                                endTime: '13:30', studentId: bo.id });
  assert(first.session.id !== second.session.id, 'two bookings, two sessions');

  await w.SLP.store.saveNote({
    dateStr: '2026-10-16',
    slot: { id: null, sessionId: second.session.id, startTime: '13:00', endTime: '13:30',
            studentIds: [bo.id], location: '' },
    studentId: bo.id, text: 'bo worked on /r/' });

  const onFirst = await w.SLP.db.getAllBy('notes', 'sessionId', first.session.id);
  const onSecond = await w.SLP.db.getAllBy('notes', 'sessionId', second.session.id);
  eq(onFirst.length, 0, "Ada's session must not receive a note written against Bo's");
  eq(onSecond.length, 1, 'the note belongs to the session it was written against');
});

test('an ad-hoc session cannot be addressed by date alone', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', studentId: ada.id });
  let threw = null;
  try {
    await w.SLP.store.saveNote({
      dateStr: '2026-10-16',
      slot: { id: null, startTime: '11:00', endTime: '11:30', studentIds: [ada.id], location: '' },
      studentId: ada.id, text: 'x' });
  } catch (e) { threw = e; }
  assert(threw, 'a slotless slot with no sessionId names no session — guessing is the bug');
});
```

Note the `sessionId` on every hand-built ad-hoc slot above. Before Step 4 that field is
ignored and these tests pass by accident on a one-makeup date; the two-makeup test is the one
that cannot. `attSeed` returns `objective` for the `deleteMakeup` test — it was extended in Task 1
Step 2 for exactly this. `objective.fields[0]` is the trials field the preset supplies.

Append to `tests/attendance-ui.test.js`:

```js
test('the owed column is where she books the makeup', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  const open = attUiRow(doc, ada).querySelector('.att-owed-open');
  assert(open, 'that is where she is already looking when she asks who she owes');
  open.click();
  await w.SLP.ui.render();
  assert(w.document.querySelector('#att-booking'), 'the booking form opened');
});

test('a student who is square offers nothing to book', async () => {
  const w = await loadApp();
  const { bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  eq(attUiRow(doc, bo).querySelector('.att-owed-open'), null,
     'the eye goes to the students carrying debt');
});

test('the proposed duration is one session, capped, not the whole debt', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) {
    await w.SLP.store.setAttendance({ dateStr: d, slot, studentId: ada.id, status: 'missed' });
  }
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  attUiRow(doc, ada).querySelector('.att-owed-open').click();
  await w.SLP.ui.render();
  const start = w.document.querySelector('#att-book-start').value;
  const end = w.document.querySelector('#att-book-end').value;
  eq(w.SLP.derive.minutesOf({ startTime: start, endTime: end }), 30,
     'owed 90, proposed 30 — the length of her regular session');
});

test('booking writes a makeup that shows on the grid with its own glyph', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  attUiRow(doc, ada).querySelector('.att-owed-open').click();
  await w.SLP.ui.render();

  const date = w.document.querySelector('#att-book-date');
  date.value = '2026-10-07';                       // a Wednesday — not her day
  date.dispatchEvent(new w.Event('change'));
  w.document.querySelector('#att-book-save').click();
  await w.SLP.ui.render();

  const cells = attUiCells(w.document, ada, '2026-10-07');
  eq(cells.length, 1, 'it appears on its own date');
  eq(cells[0].dataset.makeup, 'true', 'a makeup must never read as a routine session');
  eq(cells[0].dataset.state, 'unmarked', 'booked, not yet held');
});

test('a booked makeup can be deleted, behind a confirmation', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await w.SLP.store.bookMakeup({ date: '2026-10-07', startTime: '11:00',
                                 endTime: '11:30', studentId: ada.id });
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, '2026-10-07');

  const del = pop.querySelector('#att-delete-makeup');
  assert(del, 'a mis-booking must be undoable');
  del.click();
  await w.SLP.ui.render();
  const confirm = w.document.querySelector('#att-delete-makeup-confirm');
  assert(confirm, 'armed first — one click must not destroy a session');
  confirm.click();
  await w.SLP.ui.render();

  eq(attUiCells(w.document, ada, '2026-10-07').length, 0, 'gone from the grid');
});

test('a regular session offers no delete', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  eq(pop.querySelector('#att-delete-makeup'), null,
     'deleting a scheduled session is the Schedule tab’s job, not this one’s');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: `makeupDuration`, `bookMakeup`, `deleteMakeup` are not functions; `.att-owed-open` is null.

The two lookup tests fail for their own reasons, and confirming *which* reason is the point
of this step. Once Step 5 has given you a working `bookMakeup` but before Step 4 lands,
re-run them: "two makeups on one day" must fail by putting Bo's note on **Ada's** session
(`onFirst.length` is `1`) — the collision itself, not a missing function — and "cannot be
addressed by date alone" must fail by *not throwing*. A test that goes red only because
`bookMakeup` is undefined has proved nothing about the lookup. If that means doing Step 5
before Step 4, do it in that order and note it in the commit message; proving these two red
for the right reason matters more than the step numbering.

- [ ] **Step 3: Add `makeupDuration` to derive**

In the `SLP.derive` IIFE, after `monthRange`:

```js
  // A student owed 90 minutes gets a 30-minute makeup proposed, not a 90-minute one:
  // she settles a debt over several sessions, not in one marathon a child could not
  // sit through. The cap is that student's own longest regular session — someone
  // else's two-hour block is not a ceiling on hers.
  function makeupDuration(owedMinutes, slots, studentId) {
    const mine = (slots || []).filter(s => (s.studentIds || []).includes(studentId));
    const cap = mine.reduce((max, s) => Math.max(max, minutesOf(s)), 0);
    return cap ? Math.min(owedMinutes, cap) : owedMinutes;
  }
```

Add `makeupDuration` to the derive return list.

- [ ] **Step 4: Address an ad-hoc session by its id, not by its slot**

**Do this before Step 5.** This task is what makes slotless sessions routine, and the
existing lookup cannot tell two of them apart. `findSession(dateStr, slotId)` finds a session
by the slot it came from — but a booked makeup has `slotId: null`, and
`onDate.find(s => s.slotId === null)` matches the *first* slotless session on that date. Book
two makeups on one day and charting the second writes into the first. Two different students'
makeups collide just as readily. See `docs/adr/0001-ad-hoc-sessions-are-found-by-id-not-slot.md`.

`findSession` — `index.html:480-483`. Replace:

```js
  async function findSession(dateStr, slotId) {
    const onDate = await db.getAllBy('sessions', 'date', dateStr);
    return onDate.find(s => s.slotId === slotId) || null;
  }
```

with:

```js
  // A slotless session has no template to be found by, so there is no honest answer
  // here — `find(s => s.slotId === null)` would return whichever ad-hoc session on this
  // date happens to be first. Ad-hoc sessions are addressed by their own id instead.
  async function findSession(dateStr, slotId) {
    if (!slotId) return null;
    const onDate = await db.getAllBy('sessions', 'date', dateStr);
    return onDate.find(s => s.slotId === slotId) || null;
  }
```

`ensureSession` — `index.html:485-495`. Every write path (`recordValue`, `saveNote`,
`setAttendance`) funnels through it, so this is the one place the id has to be honoured.
Insert as the first statement of the body:

```js
    // An ad-hoc session is addressed by id. planForDate puts it on the synthetic slot
    // it builds, and bookMakeup returns it; there is nothing to create here, because a
    // session with no slot cannot be conjured from a date the way a recurring one can.
    if (!slot.id) {
      if (!slot.sessionId) throw new Error('an ad-hoc session must be addressed by sessionId');
      const adHoc = await db.get('sessions', slot.sessionId);
      if (!adHoc) throw new Error('unknown session: ' + slot.sessionId);
      return adHoc;
    }
```

`planForDate` — `index.html:641-645`. The synthetic slot must carry the id. Add `sessionId`:

```js
      for (const session of adHoc) {
        entries.push(await build(
          { id: null, sessionId: session.id, dayOfWeek: dow, startTime: session.startTime,
            endTime: session.endTime, studentIds: session.roster, location: session.location },
          session));
      }
```

Deliberately **not** a synthetic `slotId` (`makeup:<uid>`): that would put ids of slots that
do not exist into a field meaning "the template this came from", and it would break the
`!s.slotId` test that folds ad-hoc sessions into Today in the first place.

- [ ] **Step 5: Add the store write paths**

In the `SLP.store` returned object, after `setSessionAttendance`:

```js
    // A one-off booked outside the recurring schedule. It is a session with no slot,
    // which planForDate already folds into Today — so it appears there with no further
    // work, and never on Schedule, which is the recurring week.
    //
    // The row is written with a null status on purpose: `present` here would credit
    // the debt to zero the instant she books, before the session has happened. The row
    // exists to carry isMakeup; charting it on Today fills the outcome in.
    async bookMakeup({ date, startTime, endTime, location = '', studentId }) {
      const session = m.session({ date, slotId: null, startTime, endTime, location,
                                  roster: [studentId] });
      await db.put('sessions', session);
      const attendance = m.attendance({
        sessionId: session.id, studentId, status: null,
        participation: 'scheduled', isMakeup: true });
      await db.put('attendance', attendance);
      return { session, attendance };
    },

    // Same reasoning as deleteObjective: a session removed without its rows leaves
    // records nothing can ever read again — off the screen, but still in every backup
    // she makes afterwards.
    async deleteMakeup(sessionId) {
      for (const store of ['attendance', 'notes', 'datapoints']) {
        for (const row of await db.getAllBy(store, 'sessionId', sessionId)) {
          await db.del(store, row.id);
        }
      }
      await db.del('sessions', sessionId);
    },
```

- [ ] **Step 6: Add the booking form to the view**

Add to the `ui.attendance` state object: `booking: null, armedDelete: null`.

Add before `SLP.ui.views.attendance`:

```js
  // Nudged to the next weekday so the default is a day she is actually in school.
  function nextWeekday(fromStr) {
    const [y, mo, d] = fromStr.split('-').map(Number);
    const cur = new Date(y, mo - 1, d);
    do { cur.setDate(cur.getDate() + 1); } while (cur.getDay() === 0 || cur.getDay() === 6);
    const p = n => String(n).padStart(2, '0');
    return cur.getFullYear() + '-' + p(cur.getMonth() + 1) + '-' + p(cur.getDate());
  }

  const addMinutes = (time, minutes) => {
    const [hh, mm] = time.split(':').map(Number);
    const total = hh * 60 + mm + minutes;
    const p = n => String(n).padStart(2, '0');
    return p(Math.floor(total / 60) % 24) + ':' + p(total % 60);
  };

  // Her own usual time is the better guess than a number we invented: a makeup at the
  // hour she already sees this child is the one most likely to be free in both their
  // timetables. 11:00 survives only as the fallback for a student with no slot at all.
  // Open question 4 in docs/OPEN-QUESTIONS.md — she may well fit makeups into a specific
  // free period instead, in which case this becomes a fixed time again.
  function usualStart(slots, studentId) {
    const mine = (slots || [])
      .filter(s => (s.studentIds || []).includes(studentId) && s.startTime)
      .map(s => s.startTime)
      .sort();
    return mine[0] || '11:00';
  }

  function bookingForm(slots) {
    if (!ui.booking) return null;
    const { student, owed } = ui.booking;
    const minutes = SLP.derive.makeupDuration(owed, slots, student.id);
    const start = usualStart(slots, student.id);

    const date = h('input', { type: 'date', id: 'att-book-date',
                              value: nextWeekday(SLP.ui.todayStr()) });
    const from = h('input', { type: 'time', id: 'att-book-start', value: start });
    const to = h('input', { type: 'time', id: 'att-book-end',
                            value: addMinutes(start, minutes) });
    const where = h('input', { type: 'text', id: 'att-book-where', placeholder: 'Where' });

    return h('section', { class: 'panel', id: 'att-booking' },
      h('h2', { text: 'Book a makeup · ' + student.name }),
      h('p', { class: 'muted', text: 'owes ' + owed + ' min' }),
      h('div', { class: 'row-form' },
        'Date', date, 'Time', from, '–', to, 'Where', where,
        h('button', {
          class: 'primary', id: 'att-book-save', type: 'button', text: 'Book it',
          'on:click': async () => {
            if (!date.value || !from.value || !to.value) {
              SLP.ui.toast('A makeup needs a date and a time.', 'warn'); return;
            }
            if (SLP.derive.minutesOf({ startTime: from.value, endTime: to.value }) <= 0) {
              // Word for word what the schedule form says at index.html:1302. The same
              // mistake must not get two different sentences in one app.
              SLP.ui.toast('The end time must be after the start.', 'warn'); return;
            }
            await SLP.store.bookMakeup({
              date: date.value, startTime: from.value, endTime: to.value,
              location: where.value.trim(), studentId: student.id });
            ui.booking = null;
            await SLP.ui.render();
          },
        }),
        h('button', { class: 'linkish', id: 'att-book-cancel', type: 'button', text: 'Cancel',
                      'on:click': async () => { ui.booking = null; await SLP.ui.render(); } })));
  }
```

In `gridTable`, replace the `att-owed` cell so a debt is a button:

```js
        h('td', { class: 'att-owed' },
          row.owed.owed
            ? h('button', {
                class: 'att-owed-open linkish att-owed-debt', type: 'button',
                text: '−' + row.owed.owed + ' min',
                'aria-label': 'Book a makeup for ' + row.student.name +
                              ', owes ' + row.owed.owed + ' minutes',
                'on:click': async () => {
                  ui.marking = null;
                  ui.booking = { student: row.student, owed: row.owed.owed };
                  await SLP.ui.render();
                },
              })
            : h('span', { text: '—' }))));
```

In `popover()`, append the delete control before the Cancel button — only for a makeup cell:

```js
      ui.marking.isMakeup && ui.marking.sessionId
        ? h('div', {},
            h('hr', {}),
            ui.armedDelete === ui.marking.sessionId
              ? h('div', {},
                  h('p', { class: 'muted', text: 'Delete this booked makeup?' }),
                  h('button', {
                    class: 'danger', id: 'att-delete-makeup-confirm', type: 'button',
                    text: 'Delete it',
                    'on:click': async () => {
                      const id = ui.marking.sessionId;
                      ui.marking = null; ui.armedDelete = null;
                      await SLP.store.deleteMakeup(id);
                      await SLP.ui.render();
                    },
                  }),
                  h('button', { class: 'linkish', type: 'button', text: 'Keep it',
                                'on:click': async () => { ui.armedDelete = null;
                                                          await SLP.ui.render(); } }))
              : h('button', {
                  class: 'linkish', id: 'att-delete-makeup', type: 'button',
                  text: 'Delete this makeup',
                  'on:click': async () => { ui.armedDelete = ui.marking.sessionId;
                                            await SLP.ui.render(); },
                }))
        : null,
```

In `cellEl`'s click handler, carry `isMakeup` into `ui.marking`:

```js
        ui.marking = {
          studentId: row.student.id, studentName: row.student.name, date,
          sessionId: cell.sessionId, slotId: cell.slotId, isMakeup: cell.isMakeup,
        };
```

In `SLP.ui.views.attendance`, add `bookingForm(data.slots)` to the section, between `filters.el` and the grid:

```js
      filters.el,
      bookingForm(data.slots),
      grid.rows.length ? gridTable(grid) : h('p', { class: 'empty', text: 'No students match.' }),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: all pass, 0 failed. Step 4 changes `ensureSession`, which every write path in the
app funnels through — a failure anywhere in Today, Schedule or the entry tests is this step,
not the booking form.

- [ ] **Step 8: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-derive.test.js tests/attendance-store.test.js tests/attendance-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: book a makeup from the Owed column, and undo a mis-booking"
```

---

## Task 10: The same number on the student detail page

She writes progress notes one student at a time. This is where she will already be looking.

**Files:**
- Modify: `index.html` — `ui.attendance` (export a summary renderer), `ui.students` `renderDetail` (call it), `SLP` version at line 214
- Test: `tests/attendance-ui.test.js` (append)

**Interfaces:**
- Consumes: `store.attendanceRange`, `derive.attendanceGrid`, `derive.monthRange`
- Produces:
  - `SLP.ui.students.renderAttendance(container, student)` — a hook `renderDetail` calls, matching the existing `renderAggregation` shape at `index.html:2276`
  - DOM: `#student-attendance`, `#student-attendance-from`, `#student-attendance-to`, `#student-attendance-pct`, `#student-attendance-owed`

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendance-ui.test.js`:

```js
async function attUiOpenStudent(w, student) {
  await w.SLP.ui.go({ tab: 'students', studentId: student.id });
  return w.document;
}

test('a student’s page carries the same percentage, over a range she picks', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-12', slot,
                                    studentId: ada.id, status: 'absent' });

  const doc = await attUiOpenStudent(w, ada);
  const panel = doc.querySelector('#student-attendance');
  assert(panel, 'it is where she will already be looking when she writes the note');

  const from = doc.querySelector('#student-attendance-from');
  const to = doc.querySelector('#student-attendance-to');
  from.value = '2026-10-01'; from.dispatchEvent(new w.Event('change'));
  await w.SLP.ui.render();
  const to2 = w.document.querySelector('#student-attendance-to');
  to2.value = '2026-10-31'; to2.dispatchEvent(new w.Event('change'));
  await w.SLP.ui.render();

  const pct = w.document.querySelector('#student-attendance-pct').textContent;
  assert(pct.includes('50%'), 'the same arithmetic as the grid — got ' + pct);
  assert(pct.includes('1 of 2'), 'and the same counts — got ' + pct);
});

test('the student page and the grid never disagree', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-12', slot,
                                    studentId: ada.id, status: 'present' });

  const gridDoc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  const gridPct = attUiRow(gridDoc, ada).querySelector('td.att-pct').textContent;
  const gridOwed = attUiRow(gridDoc, ada).querySelector('td.att-owed').textContent;

  const doc = await attUiOpenStudent(w, ada);
  const from = doc.querySelector('#student-attendance-from');
  from.value = '2026-10-01'; from.dispatchEvent(new w.Event('change'));
  await w.SLP.ui.render();
  const to = w.document.querySelector('#student-attendance-to');
  to.value = '2026-10-31'; to.dispatchEvent(new w.Event('change'));
  await w.SLP.ui.render();

  eq(w.document.querySelector('#student-attendance-pct').textContent, gridPct,
     'one pure function feeds both, so they cannot drift');
  assert(w.document.querySelector('#student-attendance-owed').textContent
           .includes(gridOwed.replace('−', '').replace(' min', '').trim()),
     'and the debt agrees too');
});

test('the version records that Attendance shipped', async () => {
  const w = await loadApp();
  eq(w.SLP.version, '1.7.0', 'a new tab is a minor bump');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: `#student-attendance` is null; the version is still `1.6.0`.

- [ ] **Step 3: Export the summary from `ui.attendance`**

In the `ui.attendance` IIFE, add its own range state and the hook — after `SLP.ui.views.attendance`:

```js
  // The student page has its own range: she is writing one child's progress note and
  // may want a different window from whatever the grid is showing. Same arithmetic,
  // same pure function — the two can disagree about the range, never about the number.
  const detail = { range: null };

  SLP.ui.students.renderAttendance = async (container, student) => {
    if (!detail.range) detail.range = SLP.derive.monthRange(SLP.ui.todayStr());

    const from = h('input', { type: 'date', id: 'student-attendance-from',
                              value: detail.range.from });
    const to = h('input', { type: 'date', id: 'student-attendance-to',
                            value: detail.range.to });
    from.addEventListener('change', async () => {
      detail.range = { from: from.value, to: detail.range.to };
      await SLP.ui.render();
    });
    to.addEventListener('change', async () => {
      detail.range = { from: detail.range.from, to: to.value };
      await SLP.ui.render();
    });

    const data = await SLP.store.attendanceRange({
      from: detail.range.from, to: detail.range.to, today: SLP.ui.todayStr() });
    const grid = SLP.derive.attendanceGrid(data);
    const row = grid.rows.find(r => r.student.id === student.id);
    const pct = row ? row.pct : { pct: null, heldSessions: 0, offeredSessions: 0, uncharted: 0 };
    const owed = row ? row.owed.owed : 0;

    container.appendChild(h('section', { class: 'panel', id: 'student-attendance' },
      h('h2', { text: 'Attendance' }),
      h('div', { class: 'row-form' }, 'From', from, 'to', to),
      h('p', { id: 'student-attendance-pct', text: pctText(pct),
               class: pctProvisional(pct) ? 'att-pct-provisional' : '' }),
      h('p', { id: 'student-attendance-owed', class: 'muted',
               text: owed ? 'Makeup owed: ' + owed + ' min' : 'No makeup owed.' })));
  };
```

Note: `SLP.ui.students` is created at `index.html:1754`, which runs before this section, so assigning onto it here is safe — the same arrangement `ui.aggregation` uses at line 2276.

- [ ] **Step 4: Call the hook from `renderDetail`**

`index.html:1660–1663`. Replace:

```js
    // Task 12 appends the history and progress sections here.
    if (SLP.ui.students.renderAggregation) {
      await SLP.ui.students.renderAggregation(detail, student);
    }
```

with:

```js
    // ui.aggregation and ui.attendance append their sections here. Both are defined
    // in later sections of this file, so both are guarded — the detail page renders
    // with whatever has loaded.
    if (SLP.ui.students.renderAttendance) {
      await SLP.ui.students.renderAttendance(detail, student);
    }
    if (SLP.ui.students.renderAggregation) {
      await SLP.ui.students.renderAggregation(detail, student);
    }
```

- [ ] **Step 5: Bump the version**

`index.html:214`. Replace:

```js
window.SLP = { version: '1.6.0' };
```

with:

```js
window.SLP = { version: '1.7.0' };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (background): `bash /home/brenden/dev/slp-tracker/tests/run-tests.sh`
Expected: the whole suite passes, 0 failed.

- [ ] **Step 7: Drive the loop end to end yourself, and judge the pictures**

A green suite is blind to layout, scroll position and async timing — all three of this app's
failure modes. This step is **not** a hand-off to Brenden: drive it, look at it, and make the
call yourself, per `docs/AUTONOMY.md`.

Write `tmp/walk-attendance.html` alongside `tmp/measure-attendance.html` from Task 7 Step 8:
load the real app in an iframe, seed from `tmp/gen-seed.js`, and drive the loop below through
`SLP.ui`, capturing a screenshot at each numbered stop. Same Chrome invocation as Task 7 Step
8 — **no `--virtual-time-budget`**, which expires before IndexedDB settles and captures blank.

1. Open Attendance. The range is the current month; the grid scrolls sideways while her name, `%` and `Owed` stay put.
2. Mark a cell `missed`. `Owed` shows `−30 min` without the page jumping back to the header.
3. Click the balance, book a makeup on a day that is not her scheduled day. It appears as `▫ᴹ`.
4. Open Today on that date. The makeup is there. Type a note. Return to Attendance — the cell is `Ⓜ` and `Owed` reads `—`.
5. Widen the range to a quarter. No horizontal scrolling is needed to read `%` and `Owed`, and the month band names each run of days.
6. Open that student on the Students tab. The percentage matches the grid.

Then assemble every shot from this step and from Task 7 Step 8 into one contact sheet at
`tmp/attendance-contact-sheet.html` — a plain grid of `<img>` with its stop number and a
one-line verdict under each. Put anything you were unsure about at the top, in words, rather
than leaving it for Brenden to spot. A stop you could not drive is a finding: say so on the
sheet and in the commit message.

- [ ] **Step 8: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/attendance-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: the attendance percentage on the student page, where she writes the note"
```

---

## Self-review

**Spec coverage** — every Stage 1 item mapped:

| Spec requirement | Task |
|---|---|
| Status vocabulary widens to four | 1 |
| `cancelled` exists so a snow day has an honest mark | 1 (vocabulary), 8 (session-wide sweep) |
| Session-level marking is a bulk write, no second field | 6 |
| Stickiness: data entry never overwrites her mark | 1 (the null carve-out), 6 |
| `isMakeup` per-student on the attendance row | 9 |
| Debt = Σ minutes(missed AND NOT isMakeup) | 2 |
| Credit = Σ minutes(present AND isMakeup) | 2 |
| Balance ≥ 0 displays `—` | 2 (`owed` clamp), 7 (render) |
| Percentage in minutes, `missed`/`cancelled` excluded | 3 |
| `date ≤ today` clause | 3 |
| Uncharted excluded and counted in plain sight | 3 (count), 7 (render) |
| Nothing offered → `—` | 3, 7 |
| Attendance tab, top level | 7 |
| Weekdays only | 4 (`dates`), 7 |
| Start/end picker, defaults to current month | 7 |
| Sticky left column, sticky `%` and `Owed` | 7 (CSS + measurement step) |
| Student filtering reuses `studentFilters` | 7 |
| Glyph and colour, never colour alone | 7 |
| Two sessions in a day → two boxes | 4, 7 |
| Makeup cells on their own date, distinct glyph | 4, 7, 9 |
| Click a cell → popover, not click-to-cycle | 8 |
| Book a makeup from the `Owed` column | 9 |
| Duration defaults to owed, capped at longest regular session | 9 |
| Booked makeup appears on Today, not Schedule | 9 (test asserts `planForDate`; Schedule reads slots only, so it cannot show a `slotId: null` session) |
| Makeups deletable behind a confirmation | 9 |
| `store.attendanceRange` / `derive.attendanceGrid` split | 5, 4 |
| No per-session query fan-out | 5 |
| Percentage on the student detail page | 10 |
| Percentage styled provisional when uncharted is non-zero (spec:174-175) | 7 |
| Month band above the repeating day numbers | 7 |
| `Ⓜ` held makeup, `▫ᴹ` booked-unmarked (spec:215) | 7 |
| Stage 2, service targets, projection | **deliberately absent** — blocked |

**Decisions carried in from the ADRs**, each with the task that implements it:

| Decision | ADR | Task |
|---|---|---|
| Clearing a note keeps the makeup booking (`status` resets to `null`) | 0002 | 1 (Step 5) |
| An ad-hoc session is addressed by session id, never by a null `slotId` | 0001 | 9 (Step 4) |
| Objective charts scale past criterion | 0003 | **not this plan** — landed on `main` first |

**Open questions this plan assumes an answer to** (`docs/OPEN-QUESTIONS.md` — do not treat
any of these as settled):

- **Q1, the divisor.** The percentage is computed in minutes. Every fixture slot is 30
  minutes, so minutes and session-count produce identical numbers and **the suite cannot tell
  the two definitions apart** — the tests "around minutes" in Task 3 prove nothing about
  which one is implemented. If she says sessions, Task 3 needs revisiting.
- **Q4, the booking default.** The start time defaults to that student's own usual slot time,
  falling back to `11:00` for a student with no slot (Task 9, `usualStart`).

**Placeholder scan:** every code step carries real code, and there are no deliberate stand-ins left. Task 8's last test seeds its ad-hoc session with a plain `db.put` because the booking API does not exist until Task 9 — that is the real seeding path for that test, not a placeholder to swap out.

**Type consistency:**
- `minutesOf(span)` takes `{ startTime, endTime }` — used against slots (Task 9), sessions (Task 4), and raw time pairs (Task 9's validation). Consistent.
- `attendancePct(rows, { today })` rows are `{ date, status, minutes, isMakeup? }`; `makeupBalance(rows)` reads `{ status, isMakeup, minutes }` off the same objects. `attendanceGrid` builds one `flat` array satisfying both. Consistent.
- Cell `state` uses `'unmarked'`; the attendance row's `status` uses `null`. `attendanceGrid` converts between them in exactly two places (`state: (row && row.status) || 'unmarked'` and `status: c.state === 'unmarked' ? null : c.state`). Deliberate: the DOM needs a string for `data-state`, the arithmetic needs a falsy "no answer".
- `ui.marking` carries `{ studentId, studentName, date, sessionId, slotId, isMakeup }` — set in `cellEl` (Tasks 8 and 9), read in `popover` and `markCell`. Consistent after Task 9's amendment.
- `SLP.ui.students.renderAttendance` matches the existing `renderAggregation(container, student)` signature exactly.

---

## Verify before acting

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --short HEAD  # 02598c7 or later
git -C /home/brenden/dev/slp-tracker status --short          # expect clean
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh        # expect 256 tests, 0 failed (~2 min)
```

Run the baseline before Task 1. If it is not 256/0, reconcile that first — a plan that starts from a red suite cannot tell its own failures from the ones already there.

Three fixes land on `main` between `02598c7` and Task 1 — the `deleteSlot` orphan, the chart
ceiling (ADR 0003) and the scroll/collapse regression tests. Each adds tests, so the real
baseline is **256 plus whatever those three contribute**. Take the count from your own run of
the suite immediately before Task 1, not from this line.
