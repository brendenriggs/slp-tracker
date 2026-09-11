# Questions for Carol Ann

Decisions that depend on how her practice actually works. An agent must not answer these by
inventing a reasonable-sounding default — where work had to proceed anyway, the assumption
made is recorded so it can be corrected cheaply.

Phrased for asking her directly. When one is answered, fold it into the spec and delete it
here.

**Six questions were answered on 2026-09-06** and are folded into
`docs/adr/0004-service-requirements-and-attempt-based-debt.md`, `CONTEXT.md` and
`docs/BACKLOG.md`. **A seventh was answered on 2026-09-11** — where she goes to mark a
session she missed — and shipped in 1.11.0. The two below are what is left.

---

## 1. When a school closure wipes out a month's opportunities, is the child short?

> A child needs two sessions in October and both their Tuesdays were snow days. Does that
> month read **0 of 2**, or does it read **nothing was required**?

**Why it matters:** it is the difference between a parent seeing `0%` and seeing `—`. It also
decides whether a closure reduces the *requirement* or only the *opportunities* — the first
makes the monthly quota elastic, the second makes it a debt she carries into November.

**Status:** asked three times on 2026-09-06 and not reached before she left. She did settle
the neighbouring half of it — **a school closure creates no makeup debt for her**, she does
not owe that time. Whether the child's own record absorbs the closure the same way is the
part still open.

**Assumed meanwhile:** nothing. Do not pick the convenient one — the two produce different
numbers on a document that goes home to a parent.

---

## 2. Does makeup debt ever expire?

> You are a session behind on a child in October and it is still not repaid by June. Does it
> close out at the end of a grading period or the school year, or does it follow them the
> whole way?

**Why it matters:** decides whether the owed figure is bounded or accumulates across the
year.

**Status:** raised 2026-09-06. Her answer was "unsure for now" and explicitly that we can
build without it.

**Assumed meanwhile:** debt carries forward indefinitely and nothing expires it. This is the
behaviour that falls out of building the rest and was accepted as a starting point, not a
decision — it is the smaller commitment, because adding an expiry later closes debts, while
removing one would have to resurrect them.

