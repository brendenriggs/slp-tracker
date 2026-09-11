# Assessment timelines, surface 1 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carol Ann can order an assessment on a student's page, see the date it is due 60
calendar days later, record a date against each of nine components, and close the assessment
herself when it is finished.

**Architecture:** A new `assessments` IndexedDB store holds one record per assessment, keyed
by `id` and indexed by `studentId`. The record carries its own copy of the nine components,
the way an objective carries its own fields. The due date is never stored — `SLP.derive`
computes it from `orderedOn`. The backup file's store requirement becomes version-aware so
her existing version 1 backup still restores. The only screen touched is the student detail
page; the Assessments tab and the student-list marker are separate plans.

**Tech Stack:** One self-contained `index.html`. No build step, no npm, no framework, no
network. Tests are classic scripts in `tests/`, run by `tests/run-tests.sh`, output TAP.

**Spec:** `docs/superpowers/specs/2026-09-11-assessment-timelines-design.md`

## Global Constraints

Copied from `docs/AUTONOMY.md` and the spec. Every task's requirements include these.

- **One self-contained HTML file, opened by double-click.** No build step, no npm, no
  bundler, no CDN, no framework, no network calls of any kind. The file *is* the source.
- **Never `alert`, `confirm` or `prompt`.** They freeze browser automation and hang test
  runs.
- **Every control that survives a render is identified by its `id`.** `doRender` restores
  scroll, focus, caret and selection by `id` alone. An input without an `id` silently loses
  the keyboard on every keystroke. Never solve this by refusing to re-render.
- **Controls anchor to the row they act on.** Nothing that acts on one row is appended at
  section level.
- **Exactly two objective field types, number and text.** A component date is a field on an
  assessment record, not an objective field. Do not add a third objective field type.
- **Quiet is not invisible.** Text must clear 4.5:1 against its background. The body font is
  15px, so there is no large-text exemption anywhere in this plan. `--warn` (#b7791f) is
  **3.64:1 and must never be used for text.** Assert the computed colour and the rendered
  size, never the class.
- **Colour never carries the state alone.** Every row states how it stands in words.
- **Test files share one global scope.** Prefix every new helper with `assess`.
- **`throws()` catches any throw, including a `TypeError` from a function that does not exist
  yet.** Every rejection test must assert the message names what was rejected.
- **Pin the clock, never rewrite dates into the past.** `w.SLP.ui.todayStr = () => '…'`.
- **Run the suite in the background.** A full pass takes over two minutes. No TAP output at
  all means a syntax error in the app file, not a hung harness.
- **Running the suite wipes the app database.** Restore from `tmp/slp-test-data.json`.
- **Commit after every task.** Never weaken a test to go green.

## File structure

| File | Responsibility |
|---|---|
| `index.html` §model (~line 531) | `presetAssessmentComponents()`, `assessment()` factory |
| `index.html` §db (~line 414) | `assessments` store in `SCHEMA`, `DB_VERSION` 1 → 2 |
| `index.html` §derive (~line 1224) | `assessmentDue()` — the only place 60 appears |
| `index.html` §backup (~line 1610) | `SCHEMA_VERSION` 1 → 2, `STORE_SINCE`, version-aware validate and apply |
| `index.html` §store (~line 675) | the assessment repository and its write paths |
| `index.html` §ui.students (~line 2253) | `renderAssessment`, appended by `renderDetail` |
| `index.html` `<style>` (~line 9) | `--warn-ink` token and the `.assess-*` rules |
| `tests/model.test.js` | preset shape, factory guard |
| `tests/db.test.js` | the store exists and round-trips |
| `tests/derive.test.js` | the 60-day arithmetic |
| `tests/backup.test.js` | version 1 file restores, version 2 file is still strict |
| `tests/assessments-store.test.js` | **new** — repository behaviour |
| `tests/assessments-ui.test.js` | **new** — the student page block |
| `tests/index.html` | two new `<script src>` tags |

---

### Task 1: The model — the nine components and the record

**Files:**
- Modify: `index.html` §model, inside the `SLP.model` IIFE
- Test: `tests/model.test.js`

**Interfaces:**
- Consumes: `uid`, `now` (already private to §model)
- Produces:
  - `SLP.model.presetAssessmentComponents() -> [{ key: string, label: string, date: null }]`, nine entries, her order
  - `SLP.model.assessment({ studentId, orderedOn, components? }) -> { id, studentId, orderedOn, components, finishedOn: null, createdAt, updatedAt }`, throws when `orderedOn` is not `YYYY-MM-DD`

- [ ] **Step 1: Write the failing tests**

Append to `tests/model.test.js`:

```js
test('the assessment preset is her nine components, in her order', async () => {
  const w = await loadApp();
  const comps = w.SLP.model.presetAssessmentComponents();
  eq(comps.map(c => c.key), [
    'backgroundHistory', 'classroomObservation', 'languageSample', 'narrativeSample',
    'formalAssessment', 'teacherInterview', 'assessmentWritten', 'assessmentUploaded',
    'assessmentBilled',
  ], 'her nine, in the order she wrote them');
  eq(comps[0].label, 'Background history', 'labelled in her words');
  eq(comps.every(c => c.date === null), true, 'nothing is done until she says so');
});

test('the preset is a fresh copy each time, so one record cannot edit another', async () => {
  const w = await loadApp();
  const a = w.SLP.model.presetAssessmentComponents();
  const b = w.SLP.model.presetAssessmentComponents();
  a[0].date = '2026-10-02';
  eq(b[0].date, null, 'the second copy is untouched');
});

test('an assessment carries its own copy of the components', async () => {
  const w = await loadApp();
  const as = w.SLP.model.assessment({ studentId: 's1', orderedOn: '2026-09-11' });
  eq(as.components.length, 9, 'the nine travel with the record');
  eq(as.finishedOn, null, 'a new assessment is open');
  eq(as.studentId, 's1', 'it belongs to the student');
  assert(as.id.startsWith('as_'), 'assessment ids are prefixed as_, got ' + as.id);
});

test('an assessment refuses to exist without the date it was ordered', async () => {
  const w = await loadApp();
  const e = await throws(() => w.SLP.model.assessment({ studentId: 's1', orderedOn: '' }),
                         'an empty order date must be rejected');
  assert(/ordered/i.test(e.message),
         'the message must name the order date, got: ' + e.message);
  const e2 = await throws(() => w.SLP.model.assessment({ studentId: 's1', orderedOn: '11/09/2026' }),
                          'a non-ISO date must be rejected');
  assert(/11\/09\/2026/.test(e2.message),
         'the message must quote what was rejected, got: ' + e2.message);
});
```

- [ ] **Step 2: Run the suite and watch these four fail**

Run in the background: `bash tests/run-tests.sh`

Expected: four `not ok` lines naming the new tests, failing on
`w.SLP.model.presetAssessmentComponents is not a function`. Read the summary line.

- [ ] **Step 3: Write the implementation**

In `index.html` §model, beside `presetTrials`, add:

```js
  // Her nine, in her order and her words, from the text thread of 2026-09-11. The list is
  // copied onto each assessment rather than read at render time: whether it is fixed is
  // still her question (docs/OPEN-QUESTIONS.md), and an assessment she has already reported
  // to Medicaid must keep rendering as she reported it, whatever the list becomes later.
  const ASSESSMENT_COMPONENTS = Object.freeze([
    ['backgroundHistory',    'Background history'],
    ['classroomObservation', 'Classroom observation'],
    ['languageSample',       'Language sample'],
    ['narrativeSample',      'Narrative sample'],
    ['formalAssessment',     'Formal assessment'],
    ['teacherInterview',     'Teacher interview'],
    ['assessmentWritten',    'Assessment written'],
    ['assessmentUploaded',   'Assessment uploaded'],
    ['assessmentBilled',     'Assessment billed'],
  ]);

  const presetAssessmentComponents = () =>
    ASSESSMENT_COMPONENTS.map(([key, label]) => ({ key, label, date: null }));

  // §derive has its own copy of this test. Model is loaded first and stays dependency-free,
  // so it keeps its own rather than reaching forward for one.
  const isDateStr = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
```

Add `presetAssessmentComponents` to the returned object beside `presetTrials`, and add the
factory beside `datapoint`:

```js
    // The whole feature hangs off this one date, so it is guarded here rather than in the
    // form: a record with no order date has no due date, and nothing downstream could tell
    // you why.
    assessment: ({ studentId, orderedOn, components = presetAssessmentComponents() }) => {
      if (!isDateStr(orderedOn)) {
        throw new Error('an assessment needs the date it was ordered, as YYYY-MM-DD: ' +
                        (orderedOn === '' || orderedOn == null ? '(blank)' : orderedOn));
      }
      return { id: uid('as'), studentId, orderedOn, components,
               finishedOn: null, createdAt: now(), updatedAt: now() };
    },
```

- [ ] **Step 4: Run the suite and confirm the four pass**

Run: `bash tests/run-tests.sh`
Expected: `# done 456 tests, 456 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/model.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: an assessment record that carries its own nine components"
```

---

### Task 2: The store — a place to keep them

**Files:**
- Modify: `index.html` §db — `SCHEMA` and `DB_VERSION`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: the `assessments` object store, keyPath `id`, one index on `studentId`.
  `SLP.db.STORES` now includes `'assessments'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/db.test.js`:

```js
test('assessments are a store of their own, findable by student', async () => {
  const w = await loadApp();
  assert(w.SLP.db.STORES.includes('assessments'), 'the app knows the assessments store');
  await w.SLP.db.put('assessments',
    { id: 'as_1', studentId: 's1', orderedOn: '2026-09-11', components: [], finishedOn: null });
  await w.SLP.db.put('assessments',
    { id: 'as_2', studentId: 's2', orderedOn: '2026-09-12', components: [], finishedOn: null });
  const mine = await w.SLP.db.getAllBy('assessments', 'studentId', 's1');
  eq(mine.map(a => a.id), ['as_1'], 'the studentId index finds only that student\'s');
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `bash tests/run-tests.sh`
Expected: `not ok … assessments are a store of their own` — the store does not exist.

- [ ] **Step 3: Write the implementation**

In `index.html` §db, add the store and bump the version. The `onupgradeneeded` handler
already creates any store not present and is idempotent, so it needs no edit:

```js
  const DB_VERSION = 2;

  // store name -> index definitions
  const SCHEMA = {
    students:   [],
    goals:      ['studentId'],
    objectives: ['goalId'],
    slots:      ['dayOfWeek'],
    sessions:   ['date', 'slotId'],
    attendance: ['sessionId', 'studentId'],
    notes:      ['sessionId', 'studentId'],
    datapoints: ['sessionId', 'studentId', 'objectiveId'],
    assessments:['studentId'],
    meta:       [],
  };
```

- [ ] **Step 4: Run the suite and confirm it passes**

Run: `bash tests/run-tests.sh`
Expected: `# done 457 tests, 457 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/db.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: an assessments store, indexed by student"
```

---

### Task 3: The arithmetic — 60 calendar days, computed and never stored

**Files:**
- Modify: `index.html` §derive
- Test: `tests/derive.test.js`

**Interfaces:**
- Consumes: `addDays(dateStr, n)`, already private to §derive and already doing local-date
  arithmetic. Do not write new date maths; a UTC parse shifts a day either side of a
  timezone and the whole calculation walks.
- Produces: `SLP.derive.assessmentDue(assessment, today) -> { dueOn, daysLeft, overdue, done, of }`.
  `today` is **required**, `'YYYY-MM-DD'`. `daysLeft` is signed; negative means overdue.

- [ ] **Step 1: Write the failing tests**

Append to `tests/derive.test.js`:

```js
function assessRecord(w, orderedOn, doneKeys = []) {
  const as = w.SLP.model.assessment({ studentId: 's1', orderedOn });
  for (const k of doneKeys) as.components.find(c => c.key === k).date = orderedOn;
  return as;
}

test('an assessment is due 60 calendar days after it was ordered', async () => {
  const w = await loadApp();
  const due = w.SLP.derive.assessmentDue(assessRecord(w, '2026-09-11'), '2026-09-11');
  eq(due.dueOn, '2026-11-10', 'ordered 11 Sep 2026 is due 10 Nov 2026');
  eq(due.daysLeft, 60, 'the whole 60 are still ahead of her on the day she orders it');
  eq(due.overdue, false, 'not overdue on day one');
});

test('the 60 days cross a year end and a leap day correctly', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.assessmentDue(assessRecord(w, '2026-11-15'), '2026-11-15').dueOn,
     '2027-01-14', 'November 15 runs into the next year');
  eq(w.SLP.derive.assessmentDue(assessRecord(w, '2028-01-15'), '2028-01-15').dueOn,
     '2028-03-15', 'a leap February is 29 days long');
});

test('daysLeft counts down and goes negative the day after it was due', async () => {
  const w = await loadApp();
  const as = assessRecord(w, '2026-09-11');          // due 2026-11-10
  eq(w.SLP.derive.assessmentDue(as, '2026-11-09').daysLeft, 1, 'the day before');
  eq(w.SLP.derive.assessmentDue(as, '2026-11-10').daysLeft, 0, 'the day itself');
  eq(w.SLP.derive.assessmentDue(as, '2026-11-10').overdue, false,
     'the due date is a day she still has, not a day she has missed');
  eq(w.SLP.derive.assessmentDue(as, '2026-11-11').daysLeft, -1, 'the day after');
  eq(w.SLP.derive.assessmentDue(as, '2026-11-11').overdue, true, 'now it is late');
});

test('the component count is derived from the dates, not from a flag', async () => {
  const w = await loadApp();
  const as = assessRecord(w, '2026-09-11', ['backgroundHistory', 'languageSample']);
  const due = w.SLP.derive.assessmentDue(as, '2026-09-20');
  eq(due.done, 2, 'two carry a date');
  eq(due.of, 9, 'out of her nine');
});
```

- [ ] **Step 2: Run the suite and watch all four fail**

Run: `bash tests/run-tests.sh`
Expected: four `not ok` lines, failing on `w.SLP.derive.assessmentDue is not a function`.

- [ ] **Step 3: Write the implementation**

In `index.html` §derive, beside the other date arithmetic:

```js
  // 60 calendar days, from the day the assessment was ordered — which is the day of the
  // IEP meeting, settled 2026-09-11. The number lives here and nowhere else, so if she ever
  // says it varies by district it becomes a field on the record with one call site to change.
  const ASSESSMENT_DAYS = 60;

  // Whole days between two local dates, without touching a clock. Subtracting timestamps
  // gets this wrong across a daylight-saving boundary, where a "day" is 23 or 25 hours;
  // both ends are read as UTC midnight instead, so a day is always a day.
  function dayNumber(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return Math.round(Date.UTC(y, mo - 1, d) / 86400000);
  }

  // `today` is required rather than defaulted. A default would read the real clock from
  // inside derive, which is exactly what makes a date function untestable — the suite pins
  // SLP.ui.todayStr instead and passes the result in.
  function assessmentDue(assessment, today) {
    if (!assessment) throw new Error('assessmentDue needs an assessment');
    if (!today) throw new Error('assessmentDue needs today\'s date, as YYYY-MM-DD');
    const dueOn = addDays(assessment.orderedOn, ASSESSMENT_DAYS);
    const daysLeft = dayNumber(dueOn) - dayNumber(today);
    const comps = assessment.components || [];
    return {
      dueOn,
      daysLeft,
      // The due date itself is a day she still has. Only the day after is late.
      overdue: daysLeft < 0,
      done: comps.filter(c => !!c.date).length,
      of: comps.length,
    };
  }
```

Add `assessmentDue` to the returned object.

- [ ] **Step 4: Run the suite and confirm it passes**

Run: `bash tests/run-tests.sh`
Expected: `# done 461 tests, 461 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/derive.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: the due date is 60 days of arithmetic, not a stored field"
```

---

### Task 4: The backup file — version the requirement rather than soften it

**Files:**
- Modify: `index.html` §backup — `SCHEMA_VERSION`, `STORE_SINCE`, `parseBackup`, `applyBackup`
- Test: `tests/backup.test.js`

**Interfaces:**
- Produces: `SLP.backup.SCHEMA_VERSION === 2`. `parseBackup` requires only the stores that
  existed at the version the file itself declares. `applyBackup` restores an absent store as
  empty.

**Why this task exists:** `parseBackup` currently requires every store in `db.STORES` to be
present. Task 2 added one, so Carol Ann's existing backup file would now be rejected with
"That backup is incomplete — the 'assessments' section is missing." That guard is what stops
a truncated download from leaving her with half a caseload. **Do not remove or weaken it.**

- [ ] **Step 1: Write the failing tests**

Append to `tests/backup.test.js`:

```js
// A version 1 file, exactly as her existing backup is shaped: every store the app had
// before assessments existed, and nothing else.
function assessV1File() {
  return JSON.stringify({
    schemaVersion: 1,
    appVersion: '1.11.0',
    exportedAt: '2026-09-01T12:00:00.000Z',
    data: {
      students: [{ id: 's1', name: 'Ada', grade: '3', school: '', background: '',
                   active: true }],
      goals: [], objectives: [], slots: [], sessions: [],
      attendance: [], notes: [], datapoints: [],
    },
  });
}

test('her existing version 1 backup still restores after assessments arrive', async () => {
  const w = await loadApp();
  const { counts } = w.SLP.backup.parseBackup(assessV1File());
  eq(counts.students, 1, 'the file reads');
  await w.SLP.backup.restoreFromText(assessV1File());
  const students = await w.SLP.db.getAll('students');
  eq(students.map(s => s.name), ['Ada'], 'her caseload came back');
  eq((await w.SLP.db.getAll('assessments')).length, 0,
     'a file written before assessments existed restores none, which is true of it');
});

test('a version 2 file missing a section is still rejected by name', async () => {
  const w = await loadApp();
  const broken = JSON.parse(assessV1File());
  broken.schemaVersion = 2;                       // claims to be new, but has no assessments
  const e = await throws(() => w.SLP.backup.parseBackup(JSON.stringify(broken)),
                         'a truncated version 2 file must be refused');
  assert(/assessments/.test(e.message),
         'the message must name the missing store, got: ' + e.message);
});

test('a version 2 file missing an older section is still rejected by name', async () => {
  const w = await loadApp();
  const broken = JSON.parse(assessV1File());
  broken.schemaVersion = 2;
  broken.data.assessments = [];
  delete broken.data.datapoints;                  // the guard must keep its teeth everywhere
  const e = await throws(() => w.SLP.backup.parseBackup(JSON.stringify(broken)),
                         'a truncated version 2 file must be refused');
  assert(/datapoints/.test(e.message),
         'the message must name the missing store, got: ' + e.message);
});

test('assessments survive an export and restore with their dates intact', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-10-02');
  const text = await w.SLP.backup.exportText();
  eq(JSON.parse(text).schemaVersion, 2, 'the file declares the version it was written at');
  await w.SLP.backup.restoreFromText(text);
  const [back] = await w.SLP.db.getAll('assessments');
  eq(back.orderedOn, '2026-09-11', 'the order date came back');
  eq(back.components.find(c => c.key === 'languageSample').date, '2026-10-02',
     'the component date came back exactly');
});
```

> The last test uses `SLP.store.orderAssessment` and `setComponentDate` from Task 5. If you
> are executing tasks in order, it will fail until Task 5 lands. Write it now anyway — it is
> the round-trip that proves the two halves agree — and confirm it goes green at the end of
> Task 5.

- [ ] **Step 2: Run the suite and watch them fail**

Run: `bash tests/run-tests.sh`
Expected: the first test fails on "That backup is incomplete — the "assessments" section is
missing." That message is the proof this task is necessary.

- [ ] **Step 3: Write the implementation**

In `index.html` §backup:

```js
  const SCHEMA_VERSION = 2;

  // Which schema version each store arrived in. A backup file is checked against the stores
  // that existed at the version the file itself declares, so a file she wrote before a store
  // existed restores cleanly — while a file claiming the current version is still required to
  // carry everything. Softening the check instead would turn "your file is damaged" into
  // "restored, minus whatever was missing", which is the one thing this section exists to
  // prevent. Every store not listed here has been there since version 1.
  const STORE_SINCE = { assessments: 2 };
  const storeSince = name => STORE_SINCE[name] || 1;
```

In `parseBackup`, replace the validation and counting loops:

```js
    for (const store of db.STORES) {
      if (store === 'meta') continue;
      if (storeSince(store) > parsed.schemaVersion) continue;   // not yet invented when this was written
      if (!Array.isArray(parsed.data[store])) {
        throw new Error('That backup is incomplete — the "' + store +
                        '" section is missing. Nothing was changed.');
      }
    }
    const counts = {};
    for (const store of db.STORES) {
      if (store === 'meta') continue;
      counts[store] = (parsed.data[store] || []).length;
    }
```

In `applyBackup`, tolerate the absent store:

```js
      const rows = parsed.data[store] || [];
```

- [ ] **Step 4: Run the suite**

Run: `bash tests/run-tests.sh`
Expected: `# done 465 tests, 464 passed, 1 failed`. The three version tests pass. The
round-trip test is the one failure, on `w.SLP.store.orderAssessment is not a function`, and
Task 5 closes it. Confirm that is the only failing line before moving on.

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/backup.test.js
git -C /home/brenden/dev/slp-tracker commit -m "fix: a backup is checked against the stores its own version had"
```

---

### Task 5: The repository — ordering, dating, finishing

**Files:**
- Modify: `index.html` §store
- Create: `tests/assessments-store.test.js`
- Modify: `tests/index.html` — one new `<script src>` tag

**Interfaces:**
- Consumes: `SLP.db`, `SLP.model.assessment`
- Produces, all on `SLP.store`:
  - `assessmentsForStudent(studentId) -> Promise<Assessment[]>`, newest `orderedOn` first
  - `activeAssessment(studentId) -> Promise<Assessment|null>` — the one with `finishedOn === null`
  - `orderAssessment(studentId, orderedOn) -> Promise<Assessment>` — throws if one is already open
  - `setComponentDate(assessmentId, key, date) -> Promise<Assessment>` — `date` is `'YYYY-MM-DD'` or `null`; throws on an unknown key or a malformed date
  - `finishAssessment(assessmentId, finishedOn) -> Promise<Assessment>`

- [ ] **Step 1: Write the failing tests**

Create `tests/assessments-store.test.js`:

```js
// Helpers in this file are prefixed `assess` — test files share one global scope, so a
// bare `seed()` here would silently overwrite another file's.
async function assessSeedStudent(w, name = 'Ada') {
  await w.SLP.store.saveStudent(w.SLP.model.student({ name }));
  const all = await w.SLP.db.getAll('students');
  return all.find(s => s.name === name);
}

test('ordering an assessment stores it against the student, open', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  eq(as.studentId, ada.id, 'it belongs to her');
  eq(as.finishedOn, null, 'a new assessment is open');
  eq(as.components.length, 9, 'it carries the nine');
  const active = await w.SLP.store.activeAssessment(ada.id);
  eq(active.id, as.id, 'and it is the active one');
});

test('a student with one open assessment cannot be given a second', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.orderAssessment(ada.id, '2026-10-01'),
                         'a second open assessment must be refused');
  assert(/already has an assessment/i.test(e.message),
         'the message must say why, got: ' + e.message);
});

test('finishing one frees the student for the next', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const first = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.finishAssessment(first.id, '2026-11-01');
  eq(await w.SLP.store.activeAssessment(ada.id), null, 'nothing is open now');
  const second = await w.SLP.store.orderAssessment(ada.id, '2027-09-11');
  eq((await w.SLP.store.activeAssessment(ada.id)).id, second.id, 'the new one is active');
  const all = await w.SLP.store.assessmentsForStudent(ada.id);
  eq(all.map(a => a.orderedOn), ['2027-09-11', '2026-09-11'], 'newest first, history kept');
});

test('she can finish an assessment with components still undated', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-20');
  const done = await w.SLP.store.finishAssessment(as.id, '2026-10-01');
  eq(done.finishedOn, '2026-10-01', 'it is closed');
  eq(w.SLP.derive.assessmentDue(done, '2026-10-01').done, 1,
     'and it still reports 1 of 9, rather than hiding the gap');
});

test('a component date is written, and clearing it writes null', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const dated = await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-10-02');
  eq(dated.components.find(c => c.key === 'languageSample').date, '2026-10-02', 'written');
  const cleared = await w.SLP.store.setComponentDate(as.id, 'languageSample', null);
  eq(cleared.components.find(c => c.key === 'languageSample').date, null,
     'cleared back to not-done; there is no separate flag to disagree with it');
});

test('an unknown component is refused by name', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.setComponentDate(as.id, 'lunchOrdered', '2026-10-02'),
                         'an unknown component must be refused');
  assert(/lunchOrdered/.test(e.message),
         'the message must name what was rejected, got: ' + e.message);
});

test('a malformed component date is refused rather than stored', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.setComponentDate(as.id, 'languageSample', '02/10/2026'),
                         'a non-ISO date must be refused');
  assert(/02\/10\/2026/.test(e.message),
         'the message must quote what was rejected, got: ' + e.message);
  const still = await w.SLP.db.get('assessments', as.id);
  eq(still.components.find(c => c.key === 'languageSample').date, null, 'nothing was stored');
});
```

Register it in `tests/index.html`, after `<script src="store.test.js"></script>`:

```html
<script src="assessments-store.test.js"></script>
```

- [ ] **Step 2: Run the suite and watch all seven fail**

Run: `bash tests/run-tests.sh`
Expected: seven `not ok` lines, failing on `w.SLP.store.orderAssessment is not a function`.

- [ ] **Step 3: Write the implementation**

In `index.html` §store:

```js
  // --- assessments ---------------------------------------------------------
  // One open assessment per student, and she is the one who closes it. Ordering is
  // refused rather than silently closing the open one: two assessments running for the
  // same child is not a state she has ever described, and a refusal she can read beats a
  // record that quietly changed underneath her.

  const isDateStr = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

  async function assessmentsForStudent(studentId) {
    const all = await db.getAllBy('assessments', 'studentId', studentId);
    return all.sort((a, b) => b.orderedOn.localeCompare(a.orderedOn));
  }

  async function activeAssessment(studentId) {
    const all = await assessmentsForStudent(studentId);
    return all.find(a => a.finishedOn === null) || null;
  }

  async function orderAssessment(studentId, orderedOn) {
    const open = await activeAssessment(studentId);
    if (open) {
      throw new Error('that student already has an assessment in progress, ordered ' +
                      open.orderedOn + ' — finish it before ordering another');
    }
    const as = m.assessment({ studentId, orderedOn });
    await db.put('assessments', as);
    return as;
  }

  async function loadAssessment(assessmentId) {
    const as = await db.get('assessments', assessmentId);
    if (!as) throw new Error('unknown assessment: ' + assessmentId);
    return as;
  }

  // The date IS the done state. There is deliberately no companion flag: a second field
  // would be a second source of truth for one fact, which is the bug the datapoint
  // `entered` flag exists to prevent, not an instance of it. A component date has no
  // pre-filled default, so its presence is never ambiguous.
  async function setComponentDate(assessmentId, key, date) {
    const as = await loadAssessment(assessmentId);
    const comp = as.components.find(c => c.key === key);
    if (!comp) throw new Error('unknown assessment component: ' + key);
    if (date !== null && !isDateStr(date)) {
      throw new Error('a component date must be YYYY-MM-DD or empty: ' + date);
    }
    comp.date = date;
    as.updatedAt = m.now();
    await db.put('assessments', as);
    return as;
  }

  // Closing with gaps is legal and stays visible: a component that does not apply to a
  // child would otherwise hold the record open forever with nothing she could press.
  async function finishAssessment(assessmentId, finishedOn) {
    const as = await loadAssessment(assessmentId);
    if (!isDateStr(finishedOn)) {
      throw new Error('finishing an assessment needs a date, as YYYY-MM-DD: ' + finishedOn);
    }
    as.finishedOn = finishedOn;
    as.updatedAt = m.now();
    await db.put('assessments', as);
    return as;
  }
```

Add all five to the section's returned object: `assessmentsForStudent`, `activeAssessment`,
`orderAssessment`, `setComponentDate`, `finishAssessment`.

- [ ] **Step 4: Run the suite and confirm**

Run: `bash tests/run-tests.sh`
Expected: all seven pass, **and** the Task 4 round-trip test now passes too.
`# done 472 tests, 472 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/assessments-store.test.js tests/index.html
git -C /home/brenden/dev/slp-tracker commit -m "feat: one open assessment a student, and she is the one who closes it"
```

---

### Task 6: The block on her page — reading it

**Files:**
- Modify: `index.html` §ui.students — add `renderAssessment`, call it from `renderDetail`
- Modify: `index.html` `<style>` — the `--warn-ink` token and `.assess-*` rules
- Create: `tests/assessments-ui.test.js`
- Modify: `tests/index.html` — one new `<script src>` tag

**Interfaces:**
- Consumes: `SLP.store.activeAssessment`, `SLP.store.assessmentsForStudent`,
  `SLP.derive.assessmentDue`, `SLP.ui.todayStr`, the `h` helper, `renderDetail`
- Produces: `renderAssessment(container, student)`, private to §ui.students and called by
  `renderDetail` as the **first** of the appended blocks, before `renderAttendance`.
  DOM contract that later tasks and the two later surfaces rely on:
  - `#assessment-block` — the `section.panel`
  - `#assessment-due` — the one line carrying the order date, the due date and the standing
  - `.assess-row[data-key="<componentKey>"]` — one per component
  - `#assess-count` — "2 of 9"
  - `#assessment-order-form` — shown only when the student has no open assessment

- [ ] **Step 1: Write the failing tests**

Create `tests/assessments-ui.test.js`:

```js
async function assessOpenStudent(w, studentId) {
  await w.SLP.ui.go({ tab: 'students', studentId });
  return w.document;
}
async function assessSeedWithOrder(w, orderedOn, name = 'Ada') {
  await w.SLP.store.saveStudent(w.SLP.model.student({ name }));
  const all = await w.SLP.db.getAll('students');
  const student = all.find(s => s.name === name);
  const as = await w.SLP.store.orderAssessment(student.id, orderedOn);
  return { student, as };
}
// The floor for 15px text. The body font is 15px, so nothing here gets the large-text
// exemption. Returns the WCAG contrast ratio of a computed colour against white.
function assessContrast(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05);
}

test('a student with no assessment is offered one, not shown an empty tracker', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assert(doc.querySelector('#assessment-order-form'), 'the order form is offered');
  assert(!doc.querySelector('.assess-row'), 'no component rows until one is ordered');
});

test('an open assessment shows when it was ordered and when it is due', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const line = doc.querySelector('#assessment-due').textContent;
  assert(/11 Sep 2026/.test(line), 'the order date is on the line, got: ' + line);
  assert(/10 Nov 2026/.test(line), 'the due date is on the line, got: ' + line);
  assert(/60 days/.test(line), 'and how long she has, got: ' + line);
  assert(!doc.querySelector('#assessment-order-form'),
         'no order form while one is open');
});

test('all nine components are listed, in her order, each with a date field', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const rows = Array.from(doc.querySelectorAll('.assess-row'));
  eq(rows.map(r => r.dataset.key), [
    'backgroundHistory', 'classroomObservation', 'languageSample', 'narrativeSample',
    'formalAssessment', 'teacherInterview', 'assessmentWritten', 'assessmentUploaded',
    'assessmentBilled',
  ], 'her nine, in her order');
  for (const r of rows) {
    const box = r.querySelector('input[type="checkbox"]');
    const date = r.querySelector('input[type="date"]');
    assert(box && box.id, 'every checkbox needs an id, missing on ' + r.dataset.key);
    assert(date && date.id, 'every date input needs an id, missing on ' + r.dataset.key);
  }
});

test('the count reads from the dates', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-15');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-18');
  const doc = await assessOpenStudent(w, student.id);
  eq(doc.querySelector('#assess-count').textContent.trim(), '2 of 9', 'two carry a date');
});

test('overdue is said in words, not only in colour', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-17';           // ordered 11 Sep, due 10 Nov
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const line = doc.querySelector('#assessment-due');
  assert(/7 days over/.test(line.textContent),
         'the state is in the text, got: ' + line.textContent);
});

test('the overdue colour is legible at the size it is actually drawn', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-17';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const el = doc.querySelector('#assessment-due .assess-standing');
  const style = w.getComputedStyle(el);
  const ratio = assessContrast(style.color);
  assert(ratio >= 4.5, 'overdue text must clear 4.5:1, got ' + ratio.toFixed(2) +
                       ' for ' + style.color);
  // A contrast floor cannot see a dropped rule: a stray comment once invalidated a whole
  // block and a 12px-wide black button sailed through at 21:1. Assert a size too.
  const box = el.getBoundingClientRect();
  assert(box.width > 40 && box.height > 10,
         'the overdue text must actually be drawn, got ' + box.width + 'x' + box.height);
});

test('due soon is legible too — --warn is 3.6:1 and must never be used for text', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-01';           // due 10 Nov, nine days out
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const el = doc.querySelector('#assessment-due .assess-standing');
  assert(/9 days/.test(el.textContent), 'said in words, got: ' + el.textContent);
  const ratio = assessContrast(w.getComputedStyle(el).color);
  assert(ratio >= 4.5, 'due-soon text must clear 4.5:1, got ' + ratio.toFixed(2));
});

test('a finished assessment leaves the tracker and becomes history', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-01';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.finishAssessment(as.id, '2026-10-30');
  const doc = await assessOpenStudent(w, student.id);
  assert(doc.querySelector('#assessment-order-form'),
         'she can order the next one');
  assert(!doc.querySelector('.assess-row'), 'the finished one is not still being tracked');
  const earlier = doc.querySelector('#assessment-earlier');
  assert(earlier && /1/.test(earlier.textContent),
         'but it is counted as history, got: ' + (earlier && earlier.textContent));
});
```

Register it in `tests/index.html`, after `<script src="students.test.js"></script>`:

```html
<script src="assessments-ui.test.js"></script>
```

- [ ] **Step 2: Run the suite and watch all eight fail**

Run: `bash tests/run-tests.sh`
Expected: eight `not ok` lines. The first fails on a null `#assessment-order-form`.

- [ ] **Step 3: Add the token and the styles**

In `index.html` `<style>`, beside the other tokens:

```css
    /* --warn (#b7791f) is 3.64:1 on white. That is fine for a filled mark and wrong for
       every word in this app, whose body font is 15px and so gets no large-text exemption.
       This is the same amber at ink weight, 5.9:1, for anything written rather than drawn. */
    --warn-ink: #8a5a00;
```

And the block's rules:

```css
  .assess-standing.is-soon { color: var(--warn-ink); font-weight: 600; }
  .assess-standing.is-over { color: var(--danger); font-weight: 600; }
  .assess-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .assess-row label { flex: 1; }
  .assess-count { color: var(--muted); text-align: right; }
```

- [ ] **Step 4: Write the renderer**

In `index.html` §ui.students, add `renderAssessment` beside the other renderers. It needs no
export — `renderDetail` is in the same section and calls it directly:

```js
  // "11 Sep 2026" — the form she reads a deadline in. An ISO string is what we store and
  // the wrong thing to put in front of her.
  const ASSESS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function assessHuman(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return d + ' ' + ASSESS_MONTHS[mo - 1] + ' ' + y;
  }

  // How it stands, in words. Colour reinforces this line; it never carries it alone —
  // the sentence has to survive greyscale, a screenshot, and eyes that do not separate
  // amber from red.
  function assessStanding(daysLeft) {
    if (daysLeft < 0) {
      const n = -daysLeft;
      return { text: n + (n === 1 ? ' day over' : ' days over'), cls: 'is-over' };
    }
    if (daysLeft === 0) return { text: 'due today', cls: 'is-over' };
    const text = daysLeft + (daysLeft === 1 ? ' day' : ' days');
    return { text, cls: daysLeft <= 14 ? 'is-soon' : '' };
  }

  async function renderAssessment(container, student) {
    const refresh = () => SLP.ui.render();
    const today = SLP.ui.todayStr();
    const active = await SLP.store.activeAssessment(student.id);
    const all = await SLP.store.assessmentsForStudent(student.id);
    const finished = all.filter(a => a.finishedOn !== null);

    const panel = h('section', { class: 'panel', id: 'assessment-block' },
      h('h2', { text: 'Assessment' }));

    if (active) {
      const due = SLP.derive.assessmentDue(active, today);
      const standing = assessStanding(due.daysLeft);
      panel.appendChild(h('p', { id: 'assessment-due' },
        h('span', { text: 'Ordered ' + assessHuman(active.orderedOn) + ' · due ' +
                          assessHuman(due.dueOn) + ' · ' }),
        h('span', { class: 'assess-standing ' + standing.cls, text: standing.text })));

      for (const comp of active.components) {
        panel.appendChild(assessComponentRow(active, comp, refresh));
      }
      panel.appendChild(h('p', { class: 'assess-count', id: 'assess-count',
                                 text: due.done + ' of ' + due.of }));
      panel.appendChild(assessFinishControl(active, refresh));
    } else {
      panel.appendChild(assessOrderForm(student, refresh));
    }

    if (finished.length) panel.appendChild(assessEarlier(finished));
    container.appendChild(panel);
  }
```

`assessComponentRow`, `assessFinishControl` and `assessOrderForm` are Task 7. For this task,
write the three as the read-only stubs below so the render is complete and the tests above
can pass; Task 7 gives them their behaviour.

```js
  // Read-only for now — Task 7 wires the handlers.
  function assessComponentRow(assessment, comp) {
    const base = 'assess-' + comp.key;
    return h('div', { class: 'assess-row', 'data-key': comp.key },
      h('input', { type: 'checkbox', id: base + '-done', checked: !!comp.date }),
      h('label', { for: base + '-done', text: comp.label }),
      h('input', { type: 'date', id: base + '-date', value: comp.date || '' }));
  }

  function assessFinishControl(assessment) {
    return h('button', { class: 'linkish', id: 'assess-finish', type: 'button',
                         text: 'Mark this assessment finished' });
  }

  function assessOrderForm(student) {
    return h('div', { class: 'row-form', id: 'assessment-order-form' },
      h('label', { for: 'assess-order-date', text: 'Ordered on' }),
      h('input', { type: 'date', id: 'assess-order-date', value: SLP.ui.todayStr() }),
      h('button', { class: 'primary', id: 'assess-order', type: 'button',
                    text: 'Order an assessment' }));
  }

  function assessEarlier(finished) {
    const label = finished.length === 1
      ? '1 earlier assessment' : finished.length + ' earlier assessments';
    return h('details', { id: 'assessment-earlier' },
      h('summary', { text: label }),
      ...finished.map(a => h('p', {
        text: 'Ordered ' + assessHuman(a.orderedOn) + ' · finished ' +
              assessHuman(a.finishedOn) + ' · ' +
              a.components.filter(c => c.date).length + ' of ' + a.components.length,
      })));
  }
```

- [ ] **Step 5: Call it from `renderDetail`**

In `renderDetail`, add the call **before** `renderAttendance`. It goes first among the
appended blocks because it is the only one carrying a deadline.

It is called **unguarded**, unlike its two neighbours. Those are guarded because
`ui.attendance` and `ui.aggregation` are defined in later sections of the file and may not
have loaded yet. `renderAssessment` is defined in this same section, so a guard here would
only hide a typo:

```js
    await renderAssessment(detail, student);
    if (SLP.ui.students.renderAttendance) {
```

- [ ] **Step 6: Run the suite and confirm all eight pass**

Run: `bash tests/run-tests.sh`
Expected: `# done 480 tests, 480 passed, 0 failed`

If the contrast tests fail, **do not lower the threshold.** Darken `--warn-ink` until it
clears and re-run.

- [ ] **Step 7: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/assessments-ui.test.js tests/index.html
git -C /home/brenden/dev/slp-tracker commit -m "feat: her assessment block says when it is due, in words"
```

---

### Task 7: The block on her page — using it

**Files:**
- Modify: `index.html` §ui.students — the four stubs from Task 6 gain their handlers
- Modify: `tests/assessments-ui.test.js`

**Interfaces:**
- Consumes: everything from Task 5 and Task 6
- Produces: no new names. The stubs `assessComponentRow`, `assessFinishControl` and
  `assessOrderForm` keep their signatures, plus a `refresh` argument.

- [ ] **Step 1: Write the failing tests**

Append to `tests/assessments-ui.test.js`:

```js
function assessClick(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}
function assessSetInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

test('ordering an assessment from her page opens one', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assessSetInput(doc.querySelector('#assess-order-date'), '2026-09-11');
  assessClick(doc.querySelector('#assess-order'));
  await w.SLP.ui.render();
  const as = await w.SLP.store.activeAssessment(ada.id);
  eq(as.orderedOn, '2026-09-11', 'the date she typed is the date stored');
  assert(w.document.querySelector('#assessment-due'), 'and the tracker replaced the form');
});

test('ticking a component stamps today, not a flag', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-languageSample-done'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, '2026-09-20',
     'the box wrote the date, and the date is the only record of it being done');
});

test('unticking clears the date back to nothing', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-languageSample-done'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, null, 'cleared');
});

test('typing the day it actually happened overrides the stamp', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  assessSetInput(doc.querySelector('#assess-languageSample-date'), '2026-09-15');
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, '2026-09-15',
     'she charts on paper and transcribes later, so the real date has to win');
  const box = w.document.querySelector('#assess-languageSample-done');
  eq(box.checked, true, 'and the box follows the date, because the date is the truth');
});

test('clearing the date field unticks the box', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessSetInput(doc.querySelector('#assess-languageSample-date'), '');
  await w.SLP.ui.render();
  eq((await w.SLP.db.get('assessments', as.id))
       .components.find(c => c.key === 'languageSample').date, null, 'cleared');
  eq(w.document.querySelector('#assess-languageSample-done').checked, false, 'and unticked');
});

test('she can finish it with components still undated', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-10-30';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-finish'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.finishedOn, '2026-10-30', 'closed on the day she said so');
  assert(w.document.querySelector('#assessment-order-form'), 'she can order the next');
  const earlier = w.document.querySelector('#assessment-earlier');
  assert(/1 of 9/.test(earlier.textContent),
         'the gap stays visible in the history, got: ' + earlier.textContent);
});

test('ordering with no date is refused without losing what she typed elsewhere', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assessSetInput(doc.querySelector('#assess-order-date'), '');
  assessClick(doc.querySelector('#assess-order'));
  await w.SLP.ui.render();
  eq(await w.SLP.store.activeAssessment(ada.id), null, 'nothing was created');
  assert(w.document.querySelector('.toast'), 'and she was told why');
});
```

- [ ] **Step 2: Run the suite and watch all seven fail**

Run: `bash tests/run-tests.sh`
Expected: seven `not ok` lines. The stubs render but do nothing.

- [ ] **Step 3: Wire the handlers**

Replace the three stubs in §ui.students:

```js
  // The checkbox is a shortcut for writing today's date; the date field is the fact. There
  // is no stored `done` flag for them to disagree about. Both controls carry an id because
  // every render tears #app down and doRender finds the focused element by id alone.
  function assessComponentRow(assessment, comp, refresh) {
    const base = 'assess-' + comp.key;
    const date = h('input', {
      type: 'date', id: base + '-date', value: comp.date || '',
      'on:change': async () => {
        const v = date.value || null;
        try {
          await SLP.store.setComponentDate(assessment.id, comp.key, v);
        } catch (e) {
          toast(e.message, 'warn');
        }
        await refresh();
      },
    });
    const box = h('input', {
      type: 'checkbox', id: base + '-done', checked: !!comp.date,
      'on:change': async () => {
        await SLP.store.setComponentDate(assessment.id, comp.key,
                                         box.checked ? SLP.ui.todayStr() : null);
        await refresh();
      },
    });
    return h('div', { class: 'assess-row', 'data-key': comp.key },
      box, h('label', { for: base + '-done', text: comp.label }), date);
  }

  // No confirmation dialog: alert/confirm/prompt freeze browser automation and hang the
  // test runs, and this is reversible anyway — finishing writes a date, it deletes nothing.
  function assessFinishControl(assessment, refresh) {
    return h('button', {
      class: 'linkish', id: 'assess-finish', type: 'button',
      text: 'Mark this assessment finished',
      'on:click': async () => {
        await SLP.store.finishAssessment(assessment.id, SLP.ui.todayStr());
        toast('Assessment finished.', 'info');
        await refresh();
      },
    });
  }

  function assessOrderForm(student, refresh) {
    const date = h('input', { type: 'date', id: 'assess-order-date',
                              value: SLP.ui.todayStr() });
    return h('div', { class: 'row-form', id: 'assessment-order-form' },
      h('label', { for: 'assess-order-date', text: 'Ordered on' }),
      date,
      h('button', {
        class: 'primary', id: 'assess-order', type: 'button', text: 'Order an assessment',
        'on:click': async () => {
          try {
            await SLP.store.orderAssessment(student.id, date.value);
          } catch (e) {
            toast(e.message, 'warn');
            return;
          }
          await refresh();
        },
      }));
  }
```

Update the three call sites in `renderAssessment` to pass `refresh`.

- [ ] **Step 4: Run the suite and confirm**

Run: `bash tests/run-tests.sh`
Expected: `# done 487 tests, 487 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/assessments-ui.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: tick it today, or type the day it really happened"
```

---

### Task 8: Verify it the way this app has to be verified, and release

**Files:**
- Create: `tmp/cdp-shot-assessment.js` (gitignored, copied from `tmp/cdp-shot-missed.js`)
- Modify: `index.html` — `SLP.version` and `SLP.changelog`
- Modify: `tests/changelog.test.js` if it pins the running version

**A green suite is blind to layout, scroll, timing and fixture size.** This task is not
optional and is not satisfied by the suite passing.

- [ ] **Step 1: Copy the working driver**

Copy `tmp/cdp-shot-missed.js` to `tmp/cdp-shot-assessment.js`. Give it **its own port** and
**kill its process group**, not the pid node holds. Killing the pid leaves the browser alive
and still listening, so the next run connects to the *previous* browser — profile, database
and all — while its own Chrome silently fails to bind. Three runs of one driver once seeded
49, then 98, then 147 students while every log line still said 49.

- [ ] **Step 2: Seed her real caseload, not six**

Seed **49 students** with `tmp/gen-seed.js`, check what it emits against the current
vocabulary first, and **print the row count from the page and read it**. A control that
renders fine in a six-student fixture lands off-screen in her data; two features have shipped
past both a green suite and a screenshot this way.

Order an assessment on a **mid-list** student, date some components, and capture only after
the readiness marker is set — `--screenshot` fires at `load`, which precedes the IndexedDB
seeding and the render, so a cold capture comes out blank.

- [ ] **Step 3: Capture and look at four states**

At 1280 wide and again at 760:

1. A student with no assessment — the order form alone.
2. An open assessment, some components dated, comfortably inside the 60 days.
3. An open assessment nine days out — the amber standing.
4. An open assessment a week overdue — the red standing, plus one finished assessment
   below it so the history disclosure is visible.

Capture at the scroll position she would actually be at for a mid-list student, which is not
scroll 0. Collect them into one contact sheet under `tmp/`, with anything you were unsure
about called out at the top. Make the visual call yourself rather than deferring it.

- [ ] **Step 4: Check the one thing the suite cannot**

Put the amber standing and the attendance grid's `--warn` amber side by side. They are now
two different ambers with two different jobs — a mark and a word. Confirm that reads as
deliberate rather than as a mistake. If it does not, say so in the contact sheet; do not
quietly change the grid, which is outside this plan's scope.

- [ ] **Step 5: Bump the version and write the changelog entry**

In `index.html`, set `window.SLP = { version: '1.12.0' };` and add the top entry to
`SLP.changelog`. Every line is a sentence about her work, never a commit subject:

```js
  { version: '1.12.0', date: '2026-09-11', notes: [
      'A student’s page can now track an assessment. Put in the date it was ordered and ' +
        'the page works out the date it has to be finished, 60 calendar days later, and ' +
        'says how long you have left.',
      'Each of the nine parts — background history, classroom observation, language ' +
        'sample, narrative sample, formal assessment, teacher interview, assessment ' +
        'written, uploaded and billed — keeps the date you did it, not just a tick, ' +
        'because those are the dates you have to report.',
      'Tick a part to stamp today, or type the day it actually happened if you are ' +
        'catching up later.',
      'You decide when an assessment is finished, even if a part did not apply. What was ' +
        'left undated stays visible in the record.',
  ] },
```

- [ ] **Step 6: Run the suite one final time, in full**

Run: `bash tests/run-tests.sh`
Expected: `0 failed`. Read the summary line; do not infer it from the absence of errors.
`tests/changelog.test.js` pins the running version, so a version bump without a changelog
entry fails there.

- [ ] **Step 7: Commit and push**

```bash
git -C /home/brenden/dev/slp-tracker add index.html tests/changelog.test.js
git -C /home/brenden/dev/slp-tracker commit -m "feat: an assessment knows when it is due, v1.12.0"
git -C /home/brenden/dev/slp-tracker push
```

**Do not promote.** Giving Carol Ann the URL is Brenden's act alone, and
`tmp/note-for-her.md` stays unsent. See `docs/DELIVERY.md`.

- [ ] **Step 8: Restore the local database**

The suite runs wiped it. Restore from `tmp/slp-test-data.json` through the backup UI.
Settled; do not re-raise it.

---

## Not in this plan

- **The Assessments tab.** Surface 2, its own plan.
- **The student-list marker.** Surface 3, its own plan.
- **Anything on Today.** Ruled out by Brenden on 2026-09-11.
- **The missed-chip colour disagreement** between the attendance grid and Today. Known, open,
  and deliberately untouched here. This plan introduces `--warn-ink` for text, which is the
  token that disagreement should eventually converge to.
