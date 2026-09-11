# Questions for Carol Ann

Decisions that depend on how her practice actually works. An agent must not answer these by
inventing a reasonable-sounding default — where work had to proceed anyway, the assumption
made is recorded so it can be corrected cheaply.

Phrased for asking her directly. When one is answered, fold it into the spec and delete it
here.

**Six questions were answered on 2026-09-06** and are folded into
`docs/adr/0004-service-requirements-and-attempt-based-debt.md`, `CONTEXT.md` and
`docs/BACKLOG.md`. **A seventh was answered on 2026-09-11** — where she goes to mark a
session she missed — and shipped in 1.11.0.

Questions 1 and 2 are left over from the requirement model. Questions 3 and 4 are new on
2026-09-11 and both belong to **assessment timelines**, which she asked for that day. Neither
has been put to her yet, and neither blocks the build — the design accommodates either answer
and records what was assumed meanwhile.

**Two more assessment questions were raised and closed the same day**, both by Brenden, and
are folded into `docs/superpowers/specs/2026-09-11-assessment-timelines-design.md`. Which date
starts the clock: the order always happens at the IEP meeting, so it is one date and one due
date. And whether a student can hold several assessments over time: many, with exactly one
active, and she closes one herself rather than the ninth component closing it.

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

---

## 3. Is it always 60 days?

> Is 60 calendar days the rule everywhere you work, or does it change by district, by state,
> or by what kind of assessment it is?

**Why it matters:** decides whether 60 is a constant in the code or a number she can set per
assessment. Building it as a constant and discovering later that it varies means touching
every stored record.

**Status:** not yet asked. Raised 2026-09-11 alongside her request. Brenden's call the same
day was "static 60 for now", which decides the build but not the question.

**Assumed meanwhile:** 60, fixed, because that is the only number she has named. It lives in
one place, the `assessmentDue` function in the derive section, so it becomes a field on the
record cheaply if she says it varies.

---

## 4. Is the list of nine components fixed, or does she add to it?

> You listed nine things — background history, classroom observation, language sample,
> narrative sample, formal assessment, teacher interview, assessment written, assessment
> uploaded, assessment billed. Is that always the list, or does it change from one assessment
> to the next?

**Why it matters:** a fixed list is nine dates on one record. A list she edits is a second
kind of user-defined thing in the app, closer to the objectives model, and a much bigger
build. Her Medicaid reporting is what drives the list, which suggests it is fixed, but that
is an inference and not her answer.

**Status:** not yet asked. Raised 2026-09-11.

**Assumed meanwhile:** the nine she named, fixed and in her order. Each one holds a **date,
not a checkmark** — she has to report the dates to Medicaid, so a checkbox would lose the
thing she asked for. That part is settled from her own words and is not in question.

The list is **copied onto each assessment record** when it is created, the way an objective
carries its own fields, so this answer stays cheap. If the nine ever become ten, assessments
she has already reported to Medicaid still render as she reported them.

