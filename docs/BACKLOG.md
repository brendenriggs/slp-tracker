# Backlog

Action items that are not yet specs, plans, or code. Newest first. When one graduates
into a spec, replace its entry with a link to that spec rather than deleting it.

Decisions that depend on the clinician live in `docs/OPEN-QUESTIONS.md`, not here.

---

## Deleting a slot hides sessions already charted against it

**Raised:** 2026-09-03 by audit · **Status:** done, 2026-09-03 (`11c9950`)

`deleteSlot` now nulls the `slotId` on the sessions that referenced it, so the existing
ad-hoc path folds them back into Today. A session whose slot is gone genuinely has no
template any more, and it renders from the time, roster and location snapshot it already
carries. Three regression tests.

The workaround this trap sat behind — deleting and recreating a slot to fix its time — is
still the only way to change a slot's time. That remains gated on her answer to question 2.

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

- ~~**The `chart()` percent axis is hardcoded at 100**~~ — done 2026-09-03 (`4c700b7`). The
  ceiling rises to the highest datapoint and a dashed line marks 100%, per
  `docs/adr/0003-objective-charts-scale-past-criterion.md`.
- **The day-long tab-through** is still deferred.
- **The Today collapse has never been confirmed by hand**, and whether collapsed-by-default
  is right at all is question 3 in `docs/OPEN-QUESTIONS.md`.
- ~~**The scroll fix's two untested cases**~~ — done 2026-09-03 (`6cecef4`). Paging to a
  different day was preserving the offset and now starts at the top. The shrinking-content
  case turned out not to be a bug: a drastic shrink already lands at the top by clamping,
  and keeping her at the clamped bottom of a moderate one is deliberate — the alternative
  throws her to the header whenever she collapses a card at the end of a long day. Both are
  pinned in `tests/scroll-restore.test.js` so the reasoning is not re-derived.
- **Stage 2 of attendance** (service targets, forward projection) is blocked on question 5
  in `docs/OPEN-QUESTIONS.md`.
