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
