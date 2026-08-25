# Attendance and makeup debt — design

**Date:** 2026-08-25 · **Status:** approved in chat, spec awaiting review
**Origin:** a conversation between Brenden and his wife (the SLP this app is built for),
in which she asked for "a page that shows my entire caseload and whether they were present
on their day and received their session."

---

## The problem, in her words

Three things came out of that conversation, and they are not the same request:

1. **A caseload-wide attendance page.** Today the app answers "what is happening right
   now" (Today) and "what is the recurring plan" (Schedule). It cannot answer "how has my
   whole caseload been doing." She currently answers that with a paper clipboard form —
   students down the side, dates across, highlighter for the states.

2. **Present and served are different facts.** Asked whether "present on their day" and
   "received their session" could come apart, she said: *"There are days that they are
   present, but I missed the session. I document that too. I usually mark it as -30 —
   cause then I have to make up 30 minutes of therapy."* The app currently has no way to
   say the session did not happen *because of her*.

3. **A running obligation.** Some missed time must be made up; some need not be. She needs
   to see who she owes, and — separately — whether the schedule as planned even delivers
   the minutes the IEP requires by the end of the service period.

A fourth, unrelated item surfaced in the same conversation and is specified elsewhere:
she cannot delete a goal she added. That is being handled as its own small change and is
**not** part of this design.

## Decisions taken

| Question | Decision |
|---|---|
| What creates debt? | Both student absences and her own misses are recorded and visible; **only her misses count toward the deficit.** |
| Which deficit number? | **Both** — accrued (backward) and projected (forward). |
| How is the IEP target written? | **OPEN.** Blocked on her answer. Gates Stage 2 only. |
| Page shape | **Month grid**, mirroring her paper form. |
| How are makeups recorded? | **One-off makeup sessions** booked on a date outside the recurring schedule. |

## What already exists

Worth stating plainly, because it substantially reduces the work and because a reader
would otherwise assume all of this is new:

- **`model.attendance` already carries `status`, `participation`, and `isMakeup`.**
  `isMakeup` is declared at `slp-tracker.html:443` and referenced **nowhere else in the
  codebase.** This design is what it was waiting for.
- **`derive.studentState` already advertises the wider vocabulary** in a comment —
  `absent / excused / cancelled` — though only `absent` is ever written today.
- **`session` snapshots `startTime` / `endTime`** at materialization, so session duration
  is derivable and immune to a later edit of the underlying slot. No minutes field needed.
- **`store.planForDate` already folds in ad-hoc sessions** (`slp-tracker.html:577`,
  `605–610`) — sessions with `slotId: null` render on Today already. Only the *creation*
  path is missing.
- **`store.setAttendance`** (`slp-tracker.html:629`) already takes exactly
  `{ dateStr, slot, studentId, status }`. The grid becomes a second caller of a working
  write path rather than a new one.

## Data model

### One field carries the outcome

`attendance.status` widens from its current effective `present | absent` to:

```
status ∈ {
  'present'    // held, she charted it          → owes nothing
  'absent'     // student wasn't there          → shown on grid, owes nothing
  'missed'     // she did not hold it           → OWES minutes
  'cancelled'  // no school, assembly, closure  → owes nothing
}
```

The debt rule then lives in exactly one place: a session owes minutes if and only if its
status is `missed`.

**Why `cancelled` exists.** Without it a snow day has no honest mark. She would have to
file it under `missed` and carry phantom debt, or under `absent` and blame a child who was
home because the district closed. One enum value keeps the deficit true.

### Session-level marking is a bulk write, not a second field

Marking "I missed this whole session" writes `missed` to the attendance row of every
student on the session roster. **There is no session-level status field.**

This is deliberate. A session flag *plus* per-student rows can contradict each other, and
something then has to arbitrate — which is a bug generator and an extra concept for a
reader to hold. One source of truth, and the existing stickiness rule already protects
these marks: `deriveAttendance` (`slp-tracker.html:495`) returns any explicit non-`present`
mark untouched, so data entry never silently overwrites her judgment.

### Makeups

`isMakeup: true` on the attendance row, not on the session. It is per-student on purpose:
a group session can be a makeup for one student and routine for another.

### Service target (Stage 2, blocked)

Fields on `student` to be determined once the real IEP phrasing is known. Candidate shapes
considered: minutes-per-week + end date; sessions-per-week × duration + end date; or a
flat total for the period. **Nothing in Stage 1 depends on this choice.**

## The arithmetic

```
debt    = Σ minutes( status = missed  AND NOT isMakeup )
credit  = Σ minutes( status = present AND     isMakeup )
balance = credit − debt
```

**The `NOT isMakeup` on the debt line is load-bearing.** Without it, booking a makeup and
then missing that makeup would add a second 30 minutes of debt for a single missed
obligation — she would owe 60 minutes for one skipped session, and the number would drift
upward every time a makeup slipped. A missed makeup is correctly a no-op: the original
debt simply stays outstanding.

A balance of zero or better displays as `—`, never as a positive credit. Over-delivering
is not a bank balance she can draw down.

## Views

### New tab: Attendance

Top level, beside Schedule / Students / Today. It is caseload-wide, so it does not belong
inside Students.

**Weekdays only.** Her paper form is M–F blocks; weekends would be eight dead columns.

Students in a sticky left column, dates across, horizontal scroll for the month, month
name with ← → arrows.

```
                    ┌── week 1 ──┐ ┌── week 2 ──┐
October 2026        1  2  3   6  7  8  9 10  13 …    Owed
──────────────────────────────────────────────────────────
Ada Chen            ✓  ·  ✓   ✓  ·  ✗  ·  ✓   ✓      —
Ben Ortiz           ·  ✗  ·   ·  ✓  ·  ✓  ·   ·      —
Cy Alvarez          ✓  ·  –   ✓  ·  ✓  ·  ✗   ✓   −90 min
Dee Park            ·  ✓  ·   ·  ✓  ·  ▫  ·   ✓   −30 min

✓ held   ✗ absent   – I missed   ∅ cancelled   ▫ scheduled, unmarked   · not scheduled
Ⓜ makeup (held)   ▫ᴹ makeup booked, unmarked
```

**Student filtering reuses the existing `SLP.ui.studentFilters` component.** It currently
has a single caller; the grid gives it a second one, which is the arrangement it was
factored for in the first place.

**Glyph and color, never color alone.** Her highlighter system does not survive a
colorblind reader or a grayscale print.

**The `Owed` column is the answer to "who needs makeup sessions."** Sticky right, showing
`—` when the student is square, so the eye goes to the students carrying debt.

**Two sessions in one day render as two boxes** in the cell rather than one merged
verdict. Uncommon, but merging would silently hide a miss.

**Makeup sessions appear as cells on their own date**, with a distinct glyph, even though
that weekday is not a scheduled day for that student — so a makeup never reads as a
routine session.

### Marking

Click a cell → a small popover offering the four outcomes. **Not click-to-cycle:** four
states means overshooting, and cycling hides the vocabulary from someone who has not
memorized the order. The popover writes through the existing `store.setAttendance`.

### Booking a makeup

Entry point is the `Owed` column — click a balance and book against it, because that is
where she is already looking when she asks who she owes.

```
Book a makeup · Cy Alvarez        owes 90 min
  Date   [2026-10-16]
  Time   [11:00] – [11:30]   30 min
  Where  [Room 4]
```

Duration defaults to the outstanding balance, capped at the length of that student's
longest regular session, and she can override it — a student owed 90 minutes gets a
30-minute makeup proposed, not a 90-minute one. Writes a `session` with `slotId: null` and a roster of one, plus an attendance row with
`isMakeup: true`. It appears on Today for that date with no further work.

It does **not** appear on Schedule — Schedule is the recurring week, and a one-off is not
recurring.

Booked makeups can be deleted, behind a basic "are you sure?".

## Reads: the part that needs care

A month grid is roughly 30 students × 22 days. The current code queries per session, per
store — `getAllBy('attendance', 'sessionId', …)` once per session — which at that size is
hundreds of IndexedDB round-trips.

Split it:

- **`store.attendanceRange({ from, to })`** — bulk-loads slots, students, sessions in
  range, and attendance rows **once each**. All the IO, no logic. Returns plain data.
- **`derive.attendanceGrid(data)`** — a pure function turning that into rows and cells.
  No IndexedDB, no async.

This follows the split the codebase already uses (store does IO, `derive` is pure), and it
means the whole grid — cell states, scheduled-vs-not, the owed arithmetic — is unit
testable without the harness ever opening a database.

## Testing

The pure/IO split is what makes this tractable:

- **`derive.attendanceGrid`** — pure, so the bulk of the coverage goes here with
  hand-built fixtures: scheduled-vs-not cells, two-sessions-in-a-day, makeup cells landing
  on unscheduled weekdays, month boundaries, a student with no slots at all.
- **The arithmetic** — its own tests, with the double-counting case
  (`missed` on a makeup adds no debt) called out explicitly, because that is the rule most
  likely to be broken by a later well-meaning edit.
- **`store.attendanceRange`** — harness tests that it returns the right rows for a range,
  and that it does so without a per-session query fan-out.
- **Session-level bulk marking** — that it writes every roster member, and that it does
  not overwrite a mark she made by hand on one student.
- **Stickiness** — data entry after an explicit `missed` does not silently flip it to
  `present`.

**Prove each new test can fail before keeping it.** Three sessions running, a test written
here has turned out to be incapable of going red; see the handoff notes. A guard that
guards nothing is worse than none.

Note that running the suite wipes the app database — `tests/index.html:26`. That is
accepted; the seed is restorable from `tmp/slp-test-data.json`.

## Staging

**Stage 1 — the complete loop, nothing blocked.**
Status vocabulary · session-level bulk marking · Attendance tab and month grid ·
`attendanceRange` / `attendanceGrid` split · Owed column · makeup booking, credit, and
deletion.

She can accrue debt, see it, and settle it. This is the page she asked for.

**Stage 2 — blocked on her IEP answer.**
Service-target fields on `student`, and the forward projection:
*"current plan has Cy at a 3hr deficit by Jun 5."*

## Open questions

1. **How is the required service amount written in her IEPs?** Minutes per week, sessions
   × duration, or a flat total for the period. Gates Stage 2 only.

## Explicitly out of scope

- **Deleting a goal** — real, requested in the same conversation, being handled separately.
- **The `chart()` percent-axis ceiling** — a known open bug (the axis maximum is hardcoded
  at 100, so a datapoint above criterion draws outside the plot area). Unrelated to this
  work; not to be folded in.
