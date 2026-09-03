# Ad-hoc sessions are found by id, not by slot

`findSession(date, slotId)` locates a session by the slot it came from, which works only
while every session has one. Booked makeups are slotless, so `slotId === null` matched the
first slotless session on that date and charting a second makeup wrote into the first.

We decided a slotless session has no template to be found by: `findSession` returns `null`
for a null `slotId`, and callers address an ad-hoc session by its own session id, which
`bookMakeup` returns and the attendance grid already carries.

## Considered options

Giving each makeup a synthetic `slotId` (`makeup:<uid>`) would have left every existing
lookup untouched, but it puts ids of slots that do not exist into a field meaning "the
template this came from", and it breaks `planForDate`'s `!s.slotId` test for ad-hoc
sessions. Constraining the clinician to one makeup per student per day was rejected as a
real limit invented to dodge a lookup bug — and two *different* students' makeups still
collide on the same date.
