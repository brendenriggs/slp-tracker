# Assessment timelines — design

**Date:** 2026-09-11 · **Status:** approved by Brenden; surfaces to be built one at a time
**Origin:** a text thread from the SLP this app is built for, relayed by Brenden on
2026-09-11. She asked for a way to know when an assessment is due, and to record the date
she completed each part of it, because Medicaid makes her report those dates.

---

## The problem, in her words

Kept verbatim, because the nine component names and the framing are the requirement:

> could you add something to the website to help me with assessment timelines
>
> Something simple like I put in the date of the IEP meeting and it calculates when I need
> to have the assessment done? I know it's probably something very simple that I could do
> myself, but it would just be nice to have that exist.
>
> So for example, I just ordered an assessment for a student and I have 60 calendar days to
> complete it. So I would love to just type in the date of the student. The students
> assessment got ordered and it spit out when I need to have the assessment completed.
>
> And then it would be cool if I could then track each component of the assessment and kind
> of just check it off whenever it's complete
>
> Like -background history -classroom observation -language sample, -narrative sample,
> -formal assessment, -teacher interview, -assessment written, -assessment uploaded, -
> assessment billed
>
> Cause now I have to report the dates I do all of these things to Medicaid
>
> Which is fucking dumb

Three separate requests live in that, and they are not the same size. A **due date** from a
date she types. A **component tracker** that stores nine dates. And, implied by "it would be
nice to have that exist" rather than stated, a place that answers **which assessments are
due** without her opening students one at a time.

## The one contradiction, and how it was resolved

Her first message anchors the calculation to **the IEP meeting date** and her later ones to
**the order date**. Those read as two different clocks. Brenden resolved it on 2026-09-11:
**the order always happens at the IEP meeting, so it is one date and one due date.** Her two
descriptions were the same event named twice, not two deadlines.

This closes question 3 in `docs/OPEN-QUESTIONS.md`, which is deleted there.

## Decisions taken

| Question | Decision |
|---|---|
| What starts the clock? | **One date**, the day the assessment was ordered, which is the day of the IEP meeting. |
| How long? | **60 calendar days, static.** Not configurable, not per district. Brenden, 2026-09-11: "static 60 for now." |
| Checkmark or date? | **A date.** She reports the dates to Medicaid, so a checkbox alone would lose the thing she asked for. |
| How does she enter one? | **A checkbox and an editable date on the same row.** Ticking stamps today; she corrects the date when the work happened earlier. |
| One assessment per student, or many? | **Many over time, exactly one active.** Finished ones stay readable on the student's page. |
| What closes an assessment? | **She does, by pressing a button.** Not the ninth date. |
| Where does it show? | **The student's page**, a **marker in the student list**, and **its own tab**. Built in that order. |
| Does it show on Today? | **No.** Brenden, 2026-09-11: "don't show due assessments on the today page. that should be in it's own dedicated page." |
| What does the tab list? | **Open assessments only, soonest due first.** Finished ones live on the student's page. |

## Why she closes it herself

The ninth component is "assessment billed", so completing all nine looks like the natural
end of the record. It was rejected as the closing rule for one reason: a component that does
not apply to a particular child would hold the assessment open forever, and nothing she
could press would let her out of it.

Closing with gaps is therefore legal and is recorded as what it is — finished on a date,
with however many of the nine carrying dates. The count is not hidden behind the closure.

## The model

A new `assessments` store, keyed by `id`, indexed by `studentId`. The record:

```js
{
  id: 'as_…',
  studentId: 's_…',
  orderedOn: '2026-09-11',      // the IEP meeting, the day it was ordered
  components: [                  // ordered, copied onto the record at creation
    { key: 'backgroundHistory',   label: 'Background history',   date: '2026-10-02' },
    { key: 'classroomObservation',label: 'Classroom observation',date: null },
    …
  ],
  finishedOn: null,              // a date once she closes it; null while active
  createdAt: '…', updatedAt: '…',
}
```

**The component list is copied onto each record, not read from a constant.** This follows
`objective.fields` exactly, which is seeded by `presetTrials()` and then belongs to the
record. It matters here for a specific reason: Carol Ann has not said whether the nine are
fixed, and it is question 5 in `docs/OPEN-QUESTIONS.md`. If the list ever grows, an
assessment she already reported to Medicaid must still render as she reported it. A constant
read at render time would rewrite her history; a copy cannot.

The preset is `presetAssessmentComponents()`, beside `presetTrials()`, holding her nine in
her order and her words:

| key | label |
|---|---|
| `backgroundHistory` | Background history |
| `classroomObservation` | Classroom observation |
| `languageSample` | Language sample |
| `narrativeSample` | Narrative sample |
| `formalAssessment` | Formal assessment |
| `teacherInterview` | Teacher interview |
| `assessmentWritten` | Assessment written |
| `assessmentUploaded` | Assessment uploaded |
| `assessmentBilled` | Assessment billed |

### The date is the only truth

There is no stored `done` flag. A component is complete **if and only if** `date` is a date
string. The checkbox is a rendering of that fact and a shortcut for setting it:

- Ticking writes today's date, through the stubbable `SLP.ui.todayStr`.
- Unticking writes `null`.
- Typing or picking a date writes that date, and the box ticks itself.
- Clearing the date field writes `null`, and the box unticks itself.

This is deliberately *not* the `entered` flag from `datapoint`. That flag exists because a
pre-filled default is indistinguishable from a typed value, and the app must not count one
as the other. A component date has no default — it is null or it is a day that happened —
so a second field would be two sources of truth for one fact, which is the bug the `entered`
flag was invented to prevent, not an instance of it.

### One active per student

`finishedOn === null` is what makes an assessment active. The student page offers
**Order an assessment** only when the student has no active one; while one is active it
offers **Mark this assessment finished** instead. There is no path to two open assessments
for one child, so no rule is needed for reconciling them.

**Assumption recorded:** she never has two assessments running for the same child at once.
Nothing she wrote suggests she does, and the single-door invariant is cheap to relax later
and expensive to introduce after records exist that violate it.

## What is derived, never stored

`SLP.derive` owns the arithmetic, per the section's own rule that nothing computed is
stored. `dueOn` is **not** a field on the record — storing it would let it drift from
`orderedOn` after an edit, and it is one line of arithmetic.

```js
assessmentDue(assessment, today)   // { dueOn, daysLeft, overdue, done, of }
```

- `dueOn` is `addDays(orderedOn, 60)`. Ordered 11 Sep 2026 is due 10 Nov 2026.
- `addDays` already exists in `derive` and does **local**-date arithmetic, which is the
  reason to reuse it rather than write new date maths: a UTC parse shifts a day either side
  of a timezone and the whole calculation walks.
- `addDays` is currently module-private. It gains no export; `assessmentDue` is the export,
  so the arithmetic has one caller and one name.
- `daysLeft` is signed. Negative means overdue, and `overdue` is the plain boolean for the
  view so no view has to know that a negative number means late.
- `done` and `of` are the component counts, so "2 of 9" is computed once.

`today` is a **required** parameter, and every caller passes `SLP.ui.todayStr()`. A default
would read the real clock from inside `derive`, which is what makes a date function
untestable; requiring it keeps the clock stubbable, which `docs/AUTONOMY.md` names as the
preferred way to test anything date-dependent.

## Storage, and the backup file this would otherwise break

Adding the store itself is cheap. `SCHEMA` gains `assessments: ['studentId']`, `DB_VERSION`
goes 1 → 2, and the `onupgradeneeded` handler is already additive and idempotent — it
creates any store not already present, so it needs no edit at all.

**The break is in restore, and it is real.** `parseBackup` requires every store the app
knows about to be present in the file:

```js
for (const store of db.STORES) {
  if (store === 'meta') continue;
  if (!Array.isArray(parsed.data[store])) {
    throw new Error('That backup is incomplete — the "' + store + '" section is missing…');
  }
}
```

Add a store and Carol Ann's existing backup file stops restoring, with a message telling her
that her own good file is incomplete. That guard is load-bearing — it is what stops a
truncated download from leaving her with half a caseload — so it must not be softened into
"restore whatever is there".

**The fix is to version the requirement.** `SCHEMA_VERSION` goes 1 → 2, and a store declares
the schema version it arrived in:

```js
const STORE_SINCE = { assessments: 2 };   // every other store is 1
```

`parseBackup` then requires only the stores that existed at the version **the file itself
declares**. A version 1 file restores with no assessments, which is a true statement about
it. A version 2 file missing any section is still rejected exactly as before, so the
truncated-file guard keeps its teeth on every file written from here on.

`applyBackup` needs the same treatment: a store absent from an older file restores as empty
rather than throwing on `rows.length`.

## The three surfaces

Built and shipped **one at a time**, in this order. Each is complete and useful alone.

### 1. The student page block — first

A `section.panel` in `renderDetail`, placed with the other appended blocks and before
`removeBlock`, which stays last deliberately.

```
Assessment
Ordered 11 Sep 2026 · due 10 Nov 2026 · 19 days left
────────────────────────────────────────────────────
[x] Background history        [2026-10-02]
[x] Classroom observation     [2026-10-08]
[ ] Language sample           [          ]
[ ] Narrative sample          [          ]
[ ] Formal assessment         [          ]
[ ] Teacher interview         [          ]
[ ] Assessment written        [          ]
[ ] Assessment uploaded       [          ]
[ ] Assessment billed         [          ]
                                        2 of 9
              [ Mark this assessment finished ]

Earlier assessments (1)                        ▾
```

With no active assessment, the block collapses to a single **Order an assessment** control
with a date field defaulting to today.

**Every input carries an `id`.** `docs/AUTONOMY.md` is explicit that this is load-bearing
and not decoration: each render tears `#app` down and rebuilds it, and `doRender` restores
focus, caret and selection by `id` alone. Eighteen controls without ids is eighteen controls
that silently lose the keyboard on every keystroke. The ids are derived from the component
key, which is stable and unique within a record.

### 2. The Assessments tab — second

A fifth entry in `TABS`, and a `SECTION: ui.assessments`. Open assessments only, soonest due
first, overdue at the top because the sort puts it there rather than because of a special
case.

```
ASSESSMENTS

  Ava R.      ordered 06 Jul  due 04 Sep   7 days over   2 of 9
  Priya S.    ordered 01 Aug  due 30 Sep   19 days       5 of 9
  Marcus T.   ordered 23 Oct  due 22 Dec   102 days      0 of 9

  [ + Order an assessment ]
```

A row navigates to that student's page, which is where the work is done. The tab lists and
sorts; it does not duplicate the editor.

The tab's **Order an assessment** control needs a student, which the student page gets for
free from the route. It opens a form with a student picker and a date defaulting to today,
and students who already have an active assessment are absent from that picker rather than
offered and then refused — the one-active invariant is enforced by what she can choose, not
by an error after she chooses.

### 3. The student list marker — third

A due date beside the student in the caseload list, so she can scan who has an assessment
running without opening anyone. Nothing but a date and its urgency.

## Saying "overdue" without relying on colour

`docs/AUTONOMY.md` has two rules that bite here, and a live defect that proves both.

**Colour alone must not carry the state.** Every row says how it stands in words —
"7 days over", "19 days" — so the fact survives being read in greyscale, by someone who does
not distinguish the hues, and in a screenshot. Colour reinforces; it never informs.

**The floors are real and `--warn` does not clear them.** `--warn` is about 3.6:1 on white,
under the 4.5:1 needed for 12px text. The same problem is already open elsewhere in the app:
the attendance grid draws a miss in `--warn` amber while Today's chip for the same fact falls
through to `--muted` grey. So the urgency styling here **picks tokens that clear the floor at
the size actually used**, and the tests assert the **computed colour and the rendered size**,
not the class. A class assertion passes against a rule that styles nothing, and an assertion
on contrast alone passed a 12px-wide black button at 21:1.

This design does not fix the existing missed-chip disagreement. It must not introduce a
third opinion about what amber means either, so whatever token it lands on is the one those
should converge to.

## Testing

House style throughout, per `docs/AUTONOMY.md` and the harness notes.

- **Watch every test fail first.** `throws()` catches any throw, including a `TypeError`
  from a function that does not exist yet, so every rejection test asserts that the
  **message names what was rejected**. `tests/backup.test.js:152-168` is the convention.
- **Prefix new helpers per feature.** Test files share one global scope, so a bare `seed()`
  in a new file silently overwrites another file's.
- **Pin the clock rather than rewriting dates into the past.** `SLP.ui.todayStr = () =>
  '2026-10-31'`. Dates in the future are the entire subject here, so moving test data
  backwards to avoid the clock would destroy the coverage.

What has to be covered:

| Area | What it must prove |
|---|---|
| `assessmentDue` | 11 Sep 2026 + 60 days is 10 Nov 2026; it crosses a month end, a leap day, and a year end correctly; `daysLeft` goes negative and `overdue` flips on the right day. |
| The date-is-truth rule | Ticking writes today's date, not a flag; unticking writes null; clearing the date field unticks; typing a date ticks. |
| One active per student | With an active assessment there is no order control; with none there is no finish control. |
| Closing with gaps | Finishing at 7 of 9 is allowed, stores `finishedOn`, and the record keeps reporting 7 of 9. |
| The copied list | A finished record renders the labels it was created with, even after the preset changes. |
| Backup, version 1 file | A file declaring `schemaVersion: 1` and carrying no `assessments` section restores, with no assessments and nothing else lost. |
| Backup, version 2 file | A file declaring `schemaVersion: 2` with the `assessments` section missing is still rejected, and the message names the store. |
| Backup round trip | Export and restore preserves the component dates exactly. |

**Beyond the suite**, because a green suite is blind to layout, scroll, timing and fixture
size: seed at her real caseload of **49 students**, not six. Render the student page with an
active assessment and measure the block with `getBoundingClientRect()`; screenshot it at the
scroll position she would actually be at, which for a mid-list student is not scroll 0.
`tmp/cdp-shot-missed.js` is the working driver to copy, and each run needs its own port and
its process group killed, or the next run connects to the previous browser and quietly
reports the wrong fixture.

## Still open, and hers to answer

Both stay in `docs/OPEN-QUESTIONS.md` and neither blocks this build.

- **Is the list of nine fixed, or does she add to it?** Built as fixed. The copy-onto-record
  shape above is what makes the answer cheap either way.
- **Does 60 ever vary by district, state or assessment type?** Built as a constant, which is
  the only number she has named. It becomes a field on the record if she says it varies, and
  `assessmentDue` is the single place that reads it.

## Explicitly not in scope

- **No change to Today.** Ruled out by Brenden directly.
- **No second clock.** The IEP meeting date is the order date; nothing stores it twice.
- **No new objective field type.** `docs/AUTONOMY.md` allows exactly two, number and text.
  A component date is a field on an assessment record, not an objective field, so the
  constraint is untouched and must stay that way.
- **No notification, reminder or nag.** The tab is the place she looks.
