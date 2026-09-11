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

Questions 1 and 2 are left over from the requirement model. Questions 3 to 6 are new on
2026-09-11 and all belong to **assessment timelines**, which she asked for that day. Question
3 is the one that decides the shape of the feature; 4 to 6 decide how much of it has to be
editable. None of them has been put to her yet.

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

## 3. Does the 60-day clock start when the assessment was ordered, or at the IEP meeting?

> When you asked for this you said "I put in the date of the IEP meeting and it calculates
> when I need to have the assessment done", and then later "the date we ordered the
> assessment". Are those the same date for you, or two different ones — and if they are two,
> which one is the 60 days counted from?

**Why it matters:** they are different clocks, so they give different due dates. It also
decides whether the record stores one date or two. If the IEP meeting is a second deadline
rather than another name for the same one, the feature has to show two.

**Status:** raised 2026-09-11 from her own two descriptions of it. Put to Brenden the same
day; he had no preference, which makes it a question about how her practice runs rather than
a product decision. `docs/AUTONOMY.md` says that is hers.

**Assumed meanwhile:** the clock runs from **the date the assessment was ordered, 60 calendar
days** — she said that twice and confirmed it directly. The IEP meeting date is left out of
the build entirely rather than guessed at, so nothing has to be unwound when she answers.

---

## 4. Is it always 60 days?

> Is 60 calendar days the rule everywhere you work, or does it change by district, by state,
> or by what kind of assessment it is?

**Why it matters:** decides whether 60 is a constant in the code or a number she can set per
assessment. Building it as a constant and discovering later that it varies means touching
every stored record.

**Status:** not yet asked. Raised 2026-09-11 alongside her request.

**Assumed meanwhile:** 60, fixed, because that is the only number she has named.

---

## 5. Is the list of nine components fixed, or does she add to it?

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

---

## 6. Can one student have more than one assessment over time?

> Over the years you have a student, do you ever assess them more than once — a triennial
> re-evaluation, say? Would you want to still see the old one after the new one is ordered?

**Why it matters:** decides one assessment record per student or many. It is the hardest of
the four to change later, because going from one to many has to split records that already
exist.

**Status:** not yet asked. Raised 2026-09-11.

**Assumed meanwhile:** nothing chosen yet. Triennial re-evaluations make "many" likely, but
this is the question most worth her actual answer before any store is written.

