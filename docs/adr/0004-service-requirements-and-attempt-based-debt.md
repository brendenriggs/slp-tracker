# Service requirements are monthly quotas, and makeup debt counts attempts

The app modelled exactly one cadence. A **Slot** recurs weekly, `attendanceGrid` projects it
onto every matching weekday in the range, and every projection is a session the clinician is
accountable for. Her caseload does not work that way. The IEP carries a frequency column
whose dropdown is *weekly* or *monthly*, with a session count beside it, so a child can
require two sessions a month while appearing on four weekly opportunities. Under
held ÷ offered, that child scored 50% for a month in which she delivered everything the IEP
asked for — and the "provisional" italics never cleared, because two of those four cells
stayed uncharted forever no matter how caught up she was.

Her own framing settled the shape: she wants low-cadence students on the weekly schedule
anyway, so she can see her options for when to catch them, and she wants the app to know how
much time they need in a month so it stops marking them poorly.

## What was decided

**A Requirement is a number of sessions per period, and the period is weekly or monthly** —
the IEP's own two-value dropdown, mirrored rather than reinterpreted. There are no
in-between cadences to design for, because the source document does not offer any.

**The weekly schedule keeps projecting every slot.** A projected weekday that a monthly
child does not need is an **Opportunity** and draws as an unused chance — a state of its
own, not a to-do and not an absence. Removing it would take away the thing she uses the
schedule for.

**The child's percentage is measured against what they needed, not what was offered.** A
child who needs two and attends two is at 100% in a month with four opportunities.

**The requirement accrues monthly, and a shortfall becomes debt that follows.** Falling a
session behind in October is not closed out by October ending; it is owed into the months
after.

**Debt is counted in attempts, not minutes.** An **Attempt** is the child appearing on a
session they were not scheduled for — an ad-hoc session, or being added to an existing
session outside their roster. Holding a student's own regular session never repays a debt,
however well it goes. Debt clears when **the child misses an attempt** or **the clinician
holds it**; if the *clinician* misses it, the debt stands. A weekly child's debt takes one
attempt to clear, a monthly child's takes two.

**Changing a requirement is two different acts, and she picks which.** A requirement that
changes going forward must leave already-computed history alone; a requirement that was
recorded wrongly must be able to correct it. The retroactive one recalculates from **a date
she chooses**, not from the beginning of time, and sits behind confirmations — it can rewrite
a percentage on a progress note already sent home, which the forward-only one cannot.

**Three percentages, each oriented so 100% is good and 0% is bad:**

| Number | Reads | Whose record |
|---|---|---|
| Planned attendance | attended ÷ planned, makeups excluded | the child's |
| Offered attendance | attended ÷ offered, makeups included | the child's |
| Delivery | provided ÷ required | the clinician's |

## Consequences

`makeupBalance` stops returning minutes and starts returning attempts, and its credit line
changes shape: today it credits only `present && isMakeup`, and it must also credit
`absent && isMakeup`, because the child skipping an attempt repays it. The existing
`!r.isMakeup` guard on the debt line survives untouched — a makeup the *clinician* missed
still earns no credit, which is the same rule it has always encoded.

`Owed` is displayed in sessions. Minutes become an input the app reads off the IEP, never a
figure it reports — the clinician does no partial sessions, so session count is the only
unit her numbers are in.

Whether a session is an attempt is **derived, not flagged**: the child is on the session's
roster and the session is not one they were scheduled for. She never has to remember to tick
a box, and the ad-hoc session button on Today therefore repays debt as a side effect of
ordinary use. That is intended.

Two questions are deliberately unresolved and live in `docs/OPEN-QUESTIONS.md`: whether debt
ever expires, and whether a school closure that wipes out a month's opportunities reduces the
requirement or leaves the child reading zero of two. Neither blocks building the rest, and
neither should be answered by picking whichever is convenient.
