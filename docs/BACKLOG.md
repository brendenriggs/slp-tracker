# Backlog

Action items that are not yet specs, plans, or code. Newest first. When one graduates
into a spec, replace its entry with a link to that spec rather than deleting it.

Decisions that depend on the clinician live in `docs/OPEN-QUESTIONS.md`, not here.

---

## Deleting a slot hides sessions already charted against it

**Raised:** 2026-09-03 by audit · **Status:** scheduled

`deleteSlot` does not cascade, and the toast promises "Sessions already charted are
untouched" — but `planForDate` only rescues slotless sessions as ad hoc
(`.filter(s => !s.slotId)`). A session whose slot was deleted keeps a dangling `slotId`,
belongs to nothing, and disappears from Today. Its note survives on the student's page but
is read-only there, which is why she ends up retyping.

This is the trap her slot-time workaround walks into. Fixing it needs no input from her.

---

## A schedule slot's time cannot be edited

**Raised:** 2026-09-02 by Carol Ann · **Status:** gated on her answer

> If you put the time in wrong for your schedule, I can't edit it,
>
> So I wrote my note and then realized it was the wrong time
>
> I can't go and fix that without deleting the session and then have to retype the notes

Blocked on question 2 in `docs/OPEN-QUESTIONS.md`: a retroactive correction and a
forward-only one need different designs. Ask her before designing.

---

## Deferred, still true

- **The `chart()` percent axis is hardcoded at 100**, so a score above criterion computes a
  negative `y` and the point is clipped away entirely — her best session is the one that
  vanishes. Decided in `docs/adr/0003-objective-charts-scale-past-criterion.md`; scheduled.
- **The day-long tab-through** is still deferred.
- **The scroll fix and the Today collapse have never been confirmed by hand.** The
  measurable half is scheduled as regression tests, including two untested cases: paging to
  a different day preserves the scroll offset, and content shrinking below the saved offset
  clamps her somewhere she was not looking. Whether collapsed-by-default is right at all is
  question 3 in `docs/OPEN-QUESTIONS.md`.
- **Stage 2 of attendance** (service targets, forward projection) is blocked on question 5
  in `docs/OPEN-QUESTIONS.md`.
