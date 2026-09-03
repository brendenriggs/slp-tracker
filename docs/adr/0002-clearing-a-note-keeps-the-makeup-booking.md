# Clearing a note keeps the makeup booking

The app withdraws an attendance mark it derived once nothing is entered against a session,
deleting the row outright. For a booked makeup that row also carries `isMakeup: true`, so
clearing a note destroyed the booking: the credit vanished, the debt silently returned, and
the orphaned session could no longer be deleted from the grid, since that control is gated
on `isMakeup`.

We decided clearing a note undoes the *charting*, not the *appointment*. A row carrying
`isMakeup: true` is never deleted by derivation — its status resets to `null`, returning the
cell to "makeup booked, unmarked". Cancelling a makeup stays a deliberate act through the
grid's delete control.

## Consequences

This is a deliberate exception to the general withdraw-a-derived-mark rule, and the only
place a cleared note leaves a row behind. The exception exists because a booking is
something the clinician scheduled, not something the app inferred.

## Every door onto that row

The rule was written once, for one door, and the next thing built walked in through
another and destroyed the booking again — Today's Absent toggle, clicked a second time to
undo, deleted the row with a raw `db.del`. So the doors are named here rather than
rediscovered. **Nothing outside `SLP.store` writes to the `attendance` store one row at a
time**, with one exception: `backup.applyBackup` clears every store and `bulkPut`s the rows
from her file wholesale. That path restores rows as they were written, `isMakeup` included,
and never reconstructs one — it is outside this rule rather than an exception to it.

Inside the store:

- `deriveAttendance` — the rule itself. Nothing entered any more, so the derived mark is
  withdrawn, except that an `isMakeup` row survives with `status: null`.
- `bookMakeup` — where the row is born, and the only writer of a `slotId: null` session.
  It is the reason every other door has to care.
- `addStudentToSession` — adds a student to a session that already exists, creating their
  row. A makeup's roster is one child, so this is how a second one would join.
- `clearAttendance` — undoing an explicit mark. It blanks the status and hands the row to
  `deriveAttendance` rather than deleting it, so there is one implementation of the rule.
- `setAttendance` / `setSessionAttendance` — they mutate the existing row's `status`, never
  replace the row, so `isMakeup` rides through a re-mark and through a whole-session sweep.
- `removeStudentFromSession` — the row goes, deliberately: that student was not in the
  session at all. If the removal empties a *slotless* session, the booking is cancelled
  outright, because a makeup with nobody in it is drawn on Today forever and can never be
  reached by the grid's delete control again.
- `deleteMakeup` — the one place a booking is *meant* to end, and the control the grid
  gates on `isMakeup`.

A new write path against `attendance` inherits this list: say which of those it is, or add
to it here.
