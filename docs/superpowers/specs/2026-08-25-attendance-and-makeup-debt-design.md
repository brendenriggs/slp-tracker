# Attendance and makeup debt — design

**Date:** 2026-08-25 · **Status:** revised after a follow-up from the SLP; awaiting review
**Origin:** a conversation between Brenden and his wife (the SLP this app is built for),
in which she asked for "a page that shows my entire caseload and whether they were present
on their day and received their session." **Revised the same day**, after she clarified how
she actually uses the number: quarterly, as a percentage, in progress notes sent home.

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

4. **A quarterly attendance percentage — the number she actually publishes.** In her words:
   *"When I send a progress note home quarter one I calculate the percentage of time that
   they were actually present for their speech session. Quarter two will include both
   quarter one and quarter two data unless there's been a big change… as in I see a big
   improvement or a decrease in attendance in quarter two, then I will calculate them
   separately to show the difference."*

   Three things follow from that, and none of them were in the first draft of this design.
   The reporting period is **quarterly, not monthly** — monthly was inferred from the shape
   of her paper form rather than from anything she said. The output is a **percentage, not
   a count of days**. And the cumulative-versus-split choice is not a feature to build: Q1
   and Q1+Q2 are two date ranges over the same data, so an arbitrary start/end range covers
   both, and the "unless there's been a big change" case needs nothing at all.

A fifth, unrelated item surfaced in the same conversation and is specified elsewhere:
she cannot delete a goal she added. That is being handled as its own small change and is
**not** part of this design.

## Decisions taken

| Question | Decision |
|---|---|
| What creates debt? | Both student absences and her own misses are recorded and visible; **only her misses count toward the deficit.** |
| Which deficit number? | **Both** — accrued (backward) and projected (forward). |
| How is the IEP target written? | **OPEN.** Blocked on her answer. Gates Stage 2 only. |
| Page shape | **A grid over a date range she picks**, mirroring her paper form. Defaults to the current month; she widens it to a quarter at progress-note time. |
| How are makeups recorded? | **One-off makeup sessions** booked on a date outside the recurring schedule. |
| Reporting period | **A start/end date she picks** — not a month, and not a fixed quarter the app knows about. |
| What is in the attendance denominator? | **Every session offered to the child**, which excludes the ones she missed and the ones the district cancelled. |
| Minutes or session count? | **Minutes.** Identical to a session count when a student's sessions are all one length; honest when they are not. |
| Sessions she never charted? | **Excluded from the percentage, and counted in plain sight beside it.** |
| Do makeups affect the percentage? | **No.** `isMakeup` touches the debt arithmetic only. |

## What already exists

Worth stating plainly, because it substantially reduces the work and because a reader
would otherwise assume all of this is new:

- **`model.attendance` already carries `status`, `participation`, and `isMakeup`.**
  `isMakeup` is declared at `index.html:456` and referenced **nowhere else in the
  codebase.** This design is what it was waiting for.
- **`derive.studentState` already advertises the wider vocabulary** in a comment —
  `absent / excused / cancelled` — though only `absent` is ever written today.
- **`session` snapshots `startTime` / `endTime`** at materialization, so session duration
  is derivable and immune to a later edit of the underlying slot. No minutes field needed.
- **`store.planForDate` already folds in ad-hoc sessions** (`index.html:628`, `641–646`) —
  sessions with `slotId: null` render on Today already. Only the *creation* path is
  missing.
- **`store.setAttendance`** (`index.html:685`) already takes exactly
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
these marks: `deriveAttendance` (`index.html:506`) returns any explicit non-`present`
mark untouched, so data entry never silently overwrites her judgment.

### Makeups

`isMakeup: true` on the attendance row, not on the session. It is per-student on purpose:
a group session can be a makeup for one student and routine for another.

### Service target (Stage 2, blocked)

Fields on `student` to be determined once the real IEP phrasing is known. Candidate shapes
considered: minutes-per-week + end date; sessions-per-week × duration + end date; or a
flat total for the period. **Nothing in Stage 1 depends on this choice.**

## The arithmetic

Two numbers come off the same attendance rows, and they answer to different people. The
debt is hers — what she owes and must schedule. The percentage is the child's — what goes
home to a parent. Keeping them apart is what most of the rules below are protecting.

### Makeup debt

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

### Attendance percentage

Computed over the selected range, in minutes, per student:

```
offered = Σ minutes( charted, status ∈ {present, absent}, date ≤ today )
held    = Σ minutes( charted, status = present,           date ≤ today )
pct     = held / offered
```

**`missed` and `cancelled` are absent from both lines, and that is the whole point.** A
session she did not hold, and a day the district closed, were never opportunities the child
declined. Leaving them in the denominator would put her own paperwork and a snow day onto a
child's attendance record in a document going home to a parent. Her misses do not vanish —
they are the debt above, reported separately.

**`isMakeup` does not appear here.** A makeup is simply a session that was offered: held,
it lands in both lines; no-showed, in `offered` alone. So a student she missed once and then
made up sits at 8 offered out of 10 rather than 7 out of 9, and the percentage can never
exceed 100%.

**Uncharted sessions are excluded, and shown.** `deriveAttendance`
(`index.html:506`) writes no row at all for a session with nothing entered against it,
so uncharted is a real third state and not a silent `present`. Excluding it is the only
honest option — but excluding it *quietly* lets a quarter with three charted sessions out of
thirty read as a confident 100%. So the count travels with the number, and the figure is
styled as provisional whenever it is non-zero:

```
Ada Chen     78%  · 7 of 9  · 3 uncharted     ← flagged, provisional
Ben Ortiz    92%  · 11 of 12                  ← nothing missing
```

**The `date ≤ today` clause is load-bearing too.** A range running to the end of the quarter
contains sessions that have not happened yet. Those sit out of `offered`, out of `held`, and
out of the uncharted count — otherwise every quarter in progress would accuse her of being
behind on paperwork until its final day.

**A student with nothing offered in the range displays `—`.** Not `0%`, which reads as a
child who never came, and not `NaN`.

## Views

### New tab: Attendance

Top level, beside Schedule / Students / Today. It is caseload-wide, so it does not belong
inside Students.

**Weekdays only.** Her paper form is M–F blocks; weekends would be eight dead columns.

Students in a sticky left column, dates across, horizontal scroll through the range, and a
**start/end date picker** defaulting to the current month. The sticky right edge carries two
columns — `%` and `Owed` — both computed over whatever range is showing.

```
From [2026-10-01]  to [2026-10-31]

                    ┌── week 1 ──┐ ┌── week 2 ──┐
                    1  2  3   6  7  8  9 10  13 …           %                 Owed
───────────────────────────────────────────────────────────────────────────────────
Ada Chen            ✓  ·  ✓   ✓  ·  ✗  ·  ✓   ✓     89% · 8 of 9               —
Ben Ortiz           ·  ✗  ·   ·  ✓  ·  ✓  ·   ·     67% · 2 of 3               —
Cy Alvarez          ✓  ·  –   ✓  ·  ✓  ·  ✗   ✓     80% · 4 of 5           −90 min
Dee Park            ·  ✓  ·   ·  ✓  ·  ▫  ·   ✓     75% · 3 of 4 · 1 unch. −30 min

✓ held   ✗ absent   – I missed   ∅ cancelled   ▫ scheduled, unmarked   · not scheduled
Ⓜ makeup (held)   ▫ᴹ makeup booked, unmarked
```

**One control, two jobs.** Left at its default she marks the current month and scrolls a
little. Set to a quarter at progress-note time, she does not scroll at all — the two sticky
columns are the whole answer. Her Q1-versus-Q1-plus-Q2 split is two ranges on this one
screen, and needs nothing else built.

**No quarter presets in Stage 1.** Her district's quarter boundaries are not in the app, and
guessing at them would be worse than typing two dates four times a year. If she finds that
tedious, presets are a small follow-up once we know the dates are stable.

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

### The same number on the student detail page

She writes progress notes one student at a time. Once `derive` computes the percentage,
showing it on that student's page — over the same picked range — is nearly free, and it is
where she will already be looking. A small addition, not a stage of its own.

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

A month grid is roughly 30 students × 22 days, and a quarter closer to 30 × 60. The current
code queries per session, per store — `getAllBy('attendance', 'sessionId', …)` once per session — which at that size is
hundreds of IndexedDB round-trips.

Split it:

- **`store.attendanceRange({ from, to })`** — bulk-loads slots, students, sessions in
  range, and attendance rows **once each**. All the IO, no logic. Returns plain data.
- **`derive.attendanceGrid(data)`** — a pure function turning that into rows and cells. Each
  row carries its cells, its owed balance, and `{ pct, held, offered, uncharted }`. No
  IndexedDB, no async.

This follows the split the codebase already uses (store does IO, `derive` is pure), and it
means the whole grid — cell states, scheduled-vs-not, the owed arithmetic — is unit
testable without the harness ever opening a database.

## Testing

The pure/IO split is what makes this tractable:

- **`derive.attendanceGrid`** — pure, so the bulk of the coverage goes here with
  hand-built fixtures: scheduled-vs-not cells, two-sessions-in-a-day, makeup cells landing
  on unscheduled weekdays, range boundaries, a student with no slots at all.
- **The arithmetic** — its own tests, with the double-counting case
  (`missed` on a makeup adds no debt) called out explicitly, because that is the rule most
  likely to be broken by a later well-meaning edit.
- **The percentage** — its own tests, one per rule a later well-meaning edit could quietly
  break: `missed` and `cancelled` stay out of the denominator; a held makeup lands in both
  lines, so the result can never exceed 100%; a session dated after today counts as neither
  offered nor uncharted; a student with nothing offered renders `—` rather than `0%` or
  `NaN`; and minutes, not session count, decide the result when a student's sessions differ
  in length.
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
Status vocabulary · session-level bulk marking · Attendance tab and date-range grid ·
`attendanceRange` / `attendanceGrid` split · the attendance percentage, in the grid and on
the student detail page · Owed column · makeup booking, credit, and deletion.

She can accrue debt, see it, and settle it — and she can pull the quarterly percentage her
progress notes need. This is the page she asked for.

**Stage 2 — blocked on her IEP answer.**
Service-target fields on `student`, and the forward projection:
*"current plan has Cy at a 3hr deficit by Jun 5."*

## Open questions

1. **How is the required service amount written in her IEPs?** Minutes per week, sessions
   × duration, or a flat total for the period. Gates Stage 2 only.

2. **Confirm that "percentage of time" means minutes.** Decided as minutes here, which
   matches her wording and is identical to a session count whenever a student's sessions are
   all one length — it diverges only for a student carrying two different durations. Not
   blocking: if she means session count, it is a one-line change inside a pure function.

## Explicitly out of scope

- **Deleting a goal** — real, requested in the same conversation, being handled separately.
- **The `chart()` percent-axis ceiling** — a known open bug (the axis maximum is hardcoded
  at 100, so a datapoint above criterion draws outside the plot area). Unrelated to this
  work; not to be folded in.
