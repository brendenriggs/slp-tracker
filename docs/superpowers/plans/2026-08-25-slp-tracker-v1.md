# SLP Session Tracker V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build steps 2–6 of the design's build order — a working session tracker a
school SLP can use for real: caseload, weekly schedule, keyboard-first batch transcription
of paper notes, and per-objective progress aggregation, in one double-clickable HTML file.

**Architecture:** One self-contained file, `slp-tracker.html`, whose single `<script>`
block is divided into clearly-bannered namespace modules hanging off `window.SLP`
(`db`, `model`, `store`, `derive`, `backup`, `ui.*`, `boot`). IndexedDB is the source of
truth; every write goes through `SLP.store`, which materializes sessions lazily. Tests
live in `tests/` and never ship: a shell runner drives headless Chrome, which loads the
**real** `slp-tracker.html` in an iframe and asserts against its live namespace and DOM.

**Tech Stack:** Vanilla ES2020 JavaScript, IndexedDB, File System Access API, inline SVG
for charts. No framework, no bundler, no npm, no dependencies of any kind. Headless
Google Chrome as the test harness (dev-time only).

**Spec:** `docs/superpowers/specs/2026-08-24-slp-session-tracker-design.md`
**Probe result:** `docs/superpowers/specs/2026-08-25-storage-probe-result.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim
from the spec.

- **"Runs as a raw HTML file … No build step, no server, no install. Double-click to
  open."** The shipped artifact is exactly one file: `slp-tracker.html`. It is also the
  *source*. There is no generation step, no concatenation, no minification.
- **No network calls of any kind.** No CDN, no fonts, no telemetry, no API calls. If a
  task's code contains `fetch`, `XMLHttpRequest`, `<link href="http`, or `<script src="http`,
  that task is wrong.
- **"Student IEP data is FERPA-protected … Data stays on the district machine."** Nothing
  leaves the file. No third-party services.
- **"She is never at a computer during a session."** This is a transcription app for batch
  back-fill from paper, keyboard-first — not live capture.
- **"A pre-filled default is not data entry."** A field tracks whether its value was
  *entered* or merely *pre-filled*. Attendance must not auto-mark from a default, and the
  `charted` counter must not count defaults.
- **"Progress is measured only within a single objective, over time. Never across
  objectives."** No normalization, no cross-objective comparison, no shared scales.
- **Exactly two field types: `number` and `text`.** Not three. Resist a third.
- **"Absent … only needs to be fast."** One tap plus a keyboard shortcut. No free-text
  parsing, never infer absence from typed text.
- **Storage is evictable.** `persist()` was denied on her machine. Backup is manual and
  load-bearing; build it on the File System Access handle, not a download.
- **Browser storage is keyed to the shared `file://` origin, not the file path.** Verified
  2026-08-25. Shipping an updated file does not wipe her data.

---

## File Structure

| Path | Ships? | Responsibility |
|---|---|---|
| `slp-tracker.html` | **yes — this is the deliverable** | The entire app. One `<style>`, one `<script>`, sectioned by banner comments. |
| `tests/run-tests.sh` | no | Launches headless Chrome against the harness, prints TAP, exits nonzero on failure. |
| `tests/index.html` | no | Micro test framework + iframe loader for the real app. |
| `tests/*.test.js` | no | Test suites, registered via `test(name, fn)`. |
| `docs/superpowers/plans/` | no | This plan. |

### Sections inside `slp-tracker.html`

The file is ordered so that each section only depends on those above it. Every section
opens with a banner comment of exactly this shape so it can be found by grep:

```js
// ============================================================
// SECTION: db — IndexedDB access. Knows stores, not meaning.
// ============================================================
```

| Section | Depends on | Responsibility |
|---|---|---|
| `db` | — | Open/upgrade, generic CRUD, `clearAll`, `bulkPut`. Knows store names, nothing about SLP concepts. |
| `model` | — | Entity constructors, ids, field defaults, **the entered-vs-pre-filled rule**, ratio. Pure functions, no IO. |
| `store` | `db`, `model` | Repository + write paths. Session materialization. The only code that writes. |
| `derive` | `model` | Attendance derivation, charted counter, chart series, mastery. Pure functions. |
| `backup` | `db`, `model` | Export/import JSON, File System Access handle, last-backup tracking. |
| `ui.shell` | all | Tab router, header, keyboard map. |
| `ui.schedule` | `store` | Weekly grid. |
| `ui.students` | `store`, `derive` | Caseload, goals, objectives, field editor, history, charts. |
| `ui.today` | `store`, `derive` | The transcription grid. |
| `boot` | all | Wire up on `DOMContentLoaded`. |

`model` and `derive` being pure and IO-free is what makes the load-bearing rules cheap to
test exhaustively. Keep them that way.

---

## Data Model

IndexedDB database `slp-tracker`, version `1`. Every store uses `keyPath: 'id'` with
string ids of the form `<prefix>_<timestamp36><random>`.

```
students     {id, name, grade, school, active, background, createdAt, updatedAt}
goals        {id, studentId, text, order, createdAt, updatedAt}          idx: studentId
objectives   {id, goalId, text, order, fields[], createdAt, updatedAt}   idx: goalId
slots        {id, dayOfWeek, startTime, endTime, studentIds[], location, createdAt}
sessions     {id, date, slotId, startTime, endTime, location, roster[], createdAt}
                                                                          idx: date
attendance   {id, sessionId, studentId, status, participation, isMakeup, updatedAt}
                                                          idx: sessionId, idx: studentId
notes        {id, sessionId, studentId, text, updatedAt}   idx: sessionId, idx: studentId
datapoints   {id, sessionId, studentId, objectiveId, values{}, updatedAt}
                                          idx: sessionId, idx: studentId, idx: objectiveId
meta         {id:'meta', schemaVersion, lastBackupAt, backupFileHandle}
```

**FieldDef** (inside `objectives.fields`):

```js
{ id: 'f_xxx', label: 'Trials completed', type: 'number'|'text', default: 4|null,
  role: 'achieved'|'target'|null }
```

`role` is what carries preset semantics (spec §4: *"The presets carry the semantics, not a
separate configuration step"*). The trials preset emits one `achieved` field and one
`target` field; a ratio is derivable **only** when the objective has exactly one of each.
Custom fields have `role: null` and chart as independent lines.

**Values** (inside `datapoints.values`), keyed by field id:

```js
{ f_xxx: { value: 3, entered: true }, f_yyy: { value: 4, entered: false } }
```

`entered: false` means *pre-filled and untouched*. This flag is the whole ballgame — see
Task 3.

**Status values:** `attendance.status` ∈ `present | absent | excused | cancelled`;
`participation` ∈ `scheduled | added`. Derived-only third state `none` (*not charted yet*)
is never stored — its meaning is "no attendance row and no entered data."

---

## Task 1: Test harness, app skeleton, and the smoke test

Nothing can be tested until a runner exists. This task builds the runner, the empty app
shell it loads, and proves the loop works end to end — red, then green.

**Files:**
- Create: `tests/run-tests.sh`
- Create: `tests/index.html`
- Create: `tests/smoke.test.js`
- Create: `slp-tracker.html`
- Modify: `.gitignore` (add `tests/.chrome-profile/`, `tests/chrome.log`)

**Interfaces:**
- Consumes: nothing.
- Produces: the global test API used by every later task —
  `test(name, async fn)`, `assert(cond, msg)`, `eq(actual, expected, msg)`,
  `throws(async fn, msg)`, and `loadApp()` → `Promise<Window>` returning the iframe's
  `contentWindow` with a **freshly wiped database**, whose `SLP` namespace is the app
  under test. Also produces `window.SLP` inside the app with `SLP.version`.

**Why an iframe and not extracting the script:** extracting and re-evaluating the script
would be a build step and could drift from what ships. Loading the real file means the
artifact under test is byte-identical to the artifact she double-clicks. Chrome blocks
cross-`file://` DOM access by default, so the runner passes
`--allow-file-access-from-files`. That flag is test-only and changes nothing about the
app, which never touches another file.

- [ ] **Step 1: Write the runner script**

Create `tests/run-tests.sh`:

```bash
#!/usr/bin/env bash
# Runs the test suite in headless Chrome against the real slp-tracker.html.
# Usage: bash tests/run-tests.sh
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$HERE/.chrome-profile"
LOG="$HERE/chrome.log"
CHROME="${CHROME:-google-chrome}"

rm -rf "$PROFILE" "$LOG"
mkdir -p "$PROFILE"

timeout -s KILL 120 "$CHROME" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --allow-file-access-from-files \
  --user-data-dir="$PROFILE" \
  --enable-logging --log-file="$LOG" --v=0 \
  "file://$HERE/index.html" >/dev/null 2>&1

if [ ! -f "$LOG" ]; then
  echo "FATAL: chrome produced no log. Is \$CHROME ($CHROME) installed?"
  exit 2
fi

# Chrome logs console lines as: [...] "TAP: ...", source: file://...
grep -o 'TAP: [^"]*' "$LOG" | sed 's/^TAP: //'

if ! grep -q 'TAP: # done' "$LOG"; then
  echo "FATAL: suite did not finish (crash, hang, or syntax error). Full log: $LOG"
  exit 2
fi

if grep -q 'TAP: not ok' "$LOG"; then
  exit 1
fi
exit 0
```

- [ ] **Step 2: Write the micro test framework**

Create `tests/index.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>SLP tracker tests</title>
<body>
<iframe id="app-frame" style="width:1200px;height:800px;border:1px solid #ccc"></iframe>
<script>
// --- tiny TAP framework -------------------------------------------------
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }
function out(s) { console.log('TAP: ' + s); }

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || 'not equal') + ' — expected ' + b + ', got ' + a);
}
async function throws(fn, msg) {
  try { await fn(); } catch (e) { return e; }
  throw new Error(msg || 'expected a throw, got none');
}

// --- app loader ---------------------------------------------------------
// Wipes the database, then loads a fresh copy of the real app file.
function wipeDatabase() {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase('slp-tracker');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function loadApp() {
  return wipeDatabase().then(() => new Promise((resolve, reject) => {
    const frame = document.getElementById('app-frame');
    const timer = setTimeout(() => reject(new Error('app load timed out')), 10000);
    frame.onload = () => {
      clearTimeout(timer);
      const w = frame.contentWindow;
      (w.SLP && w.SLP.ready ? w.SLP.ready : Promise.resolve()).then(() => resolve(w));
    };
    // cache-bust so each load re-executes the app from scratch
    frame.src = '../slp-tracker.html?t=' + Date.now();
  }));
}

// --- runner -------------------------------------------------------------
(async () => {
  let passed = 0, failed = 0, n = 0;
  for (const t of TESTS) {
    n++;
    try {
      await t.fn();
      passed++;
      out('ok ' + n + ' - ' + t.name);
    } catch (e) {
      failed++;
      out('not ok ' + n + ' - ' + t.name);
      out('#   ' + (e && e.message ? e.message : String(e)));
      if (e && e.stack) out('#   ' + e.stack.split('\n')[1]);
    }
  }
  out('# done ' + n + ' tests, ' + passed + ' passed, ' + failed + ' failed');
  window.close();
})();
</script>
<script src="smoke.test.js"></script>
</body>
```

Note the ordering trap: the runner IIFE reads `TESTS` at the top of its async body, but
the `<script src>` tags below execute *before* the first `await`. Registration therefore
completes before the loop starts. Keep test-file `<script>` tags **after** the framework
script and add one line per new suite as later tasks create them.

- [ ] **Step 3: Write the failing smoke test**

Create `tests/smoke.test.js`:

```js
test('app exposes its namespace and version', async () => {
  const w = await loadApp();
  assert(w.SLP, 'window.SLP is missing from the app');
  eq(typeof w.SLP.version, 'string', 'SLP.version should be a string');
});

test('app makes no network requests', async () => {
  const w = await loadApp();
  const html = w.document.documentElement.outerHTML;
  assert(!/src\s*=\s*["']https?:/i.test(html), 'app references a remote script');
  assert(!/href\s*=\s*["']https?:/i.test(html), 'app references a remote stylesheet');
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bash tests/run-tests.sh`
Expected: FAIL — `not ok 1 - app exposes its namespace and version` with
`window.SLP is missing from the app` (the app file does not exist yet, so the iframe loads
nothing). Exit code 1.

- [ ] **Step 5: Create the minimal app file**

Create `slp-tracker.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLP Session Tracker</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #666; --line: #d8d8d8;
    --accent: #2b6cb0; --warn: #b7791f; --danger: #c53030; --ok: #2f855a;
    --field: #ffffff; --row: #fafafa;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  #app { max-width: 1100px; margin: 0 auto; padding: 0 16px 64px; }
</style>
</head>
<body>
<div id="app"></div>
<script>
// ============================================================
// SLP Session Tracker — one file, no build step, no network.
// Sections below are ordered by dependency; each only uses those above it.
// ============================================================
window.SLP = { version: '0.1.0' };

// ============================================================
// SECTION: boot — wire everything up.
// ============================================================
SLP.ready = Promise.resolve();
</script>
</body>
</html>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — `ok 1`, `ok 2`, `# done 2 tests, 2 passed, 0 failed`. Exit code 0.

- [ ] **Step 7: Prove the harness reports failure honestly**

Temporarily change `eq(typeof w.SLP.version, 'string', …)` to
`eq(typeof w.SLP.version, 'number', …)` and re-run. Expected: `not ok 1` and exit code 1.
Then revert the change and re-run to confirm green again. A test runner that cannot fail
is worse than none.

- [ ] **Step 8: Ignore test scratch output**

Add to `.gitignore`:

```
tests/.chrome-profile/
tests/chrome.log
```

- [ ] **Step 9: Commit**

```bash
git add tests/run-tests.sh tests/index.html tests/smoke.test.js slp-tracker.html .gitignore
git commit -m "test: headless-Chrome harness that tests the real app file"
```

---

## Task 2: The `db` section — IndexedDB access

**Files:**
- Modify: `slp-tracker.html` (add the `db` section above `boot`)
- Create: `tests/db.test.js`
- Modify: `tests/index.html` (add `<script src="db.test.js"></script>`)

**Interfaces:**
- Consumes: `SLP` namespace from Task 1.
- Produces:
  - `SLP.db.STORES` → `string[]`, the store names in a stable order.
  - `SLP.db.open()` → `Promise<IDBDatabase>` (memoized).
  - `SLP.db.put(store, obj)` → `Promise<obj>`
  - `SLP.db.get(store, id)` → `Promise<obj|undefined>`
  - `SLP.db.getAll(store)` → `Promise<obj[]>`
  - `SLP.db.getAllBy(store, indexName, value)` → `Promise<obj[]>`
  - `SLP.db.del(store, id)` → `Promise<void>`
  - `SLP.db.bulkPut(store, objs)` → `Promise<void>` (one transaction)
  - `SLP.db.clearAll()` → `Promise<void>` (every store, one transaction)

- [ ] **Step 1: Write the failing tests**

Create `tests/db.test.js`:

```js
test('db round-trips an object', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  const got = await w.SLP.db.get('students', 's1');
  eq(got.name, 'Ada', 'stored student should come back');
});

test('db.get returns undefined for a missing id', async () => {
  const w = await loadApp();
  eq(await w.SLP.db.get('students', 'nope'), undefined, 'missing id');
});

test('db.getAllBy reads through an index', async () => {
  const w = await loadApp();
  await w.SLP.db.put('goals', { id: 'g1', studentId: 's1', text: 'A', order: 0 });
  await w.SLP.db.put('goals', { id: 'g2', studentId: 's1', text: 'B', order: 1 });
  await w.SLP.db.put('goals', { id: 'g3', studentId: 's2', text: 'C', order: 0 });
  const mine = await w.SLP.db.getAllBy('goals', 'studentId', 's1');
  eq(mine.map(g => g.id).sort(), ['g1', 'g2'], 'index should filter by studentId');
});

test('db.del removes a record', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  await w.SLP.db.del('students', 's1');
  eq(await w.SLP.db.get('students', 's1'), undefined, 'deleted student');
});

test('db.bulkPut writes many in one transaction', async () => {
  const w = await loadApp();
  await w.SLP.db.bulkPut('students', [
    { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' },
  ]);
  eq((await w.SLP.db.getAll('students')).length, 3, 'all three written');
});

test('db.clearAll empties every store', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  await w.SLP.db.put('sessions', { id: 'x1', date: '2026-09-01' });
  await w.SLP.db.clearAll();
  eq((await w.SLP.db.getAll('students')).length, 0, 'students cleared');
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'sessions cleared');
});

test('every declared store exists in the database', async () => {
  const w = await loadApp();
  const db = await w.SLP.db.open();
  for (const s of w.SLP.db.STORES) {
    assert(db.objectStoreNames.contains(s), 'missing object store: ' + s);
  }
});

test('data written by one app load is visible to the next', async () => {
  const w1 = await loadApp();
  await w1.SLP.db.put('students', { id: 'persist1', name: 'Ada' });
  // loadApp() wipes the DB, so reload the frame directly instead.
  const frame = document.getElementById('app-frame');
  await new Promise(res => { frame.onload = res; frame.src = '../slp-tracker.html?t=' + Date.now(); });
  const w2 = frame.contentWindow;
  await w2.SLP.ready;
  const got = await w2.SLP.db.get('students', 'persist1');
  eq(got && got.name, 'Ada', 'data should survive a reload');
});
```

- [ ] **Step 2: Register the suite**

In `tests/index.html`, after the smoke tag:

```html
<script src="db.test.js"></script>
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bash tests/run-tests.sh`
Expected: FAIL — every db test errors with `Cannot read properties of undefined (reading 'put')`.

- [ ] **Step 4: Implement the `db` section**

In `slp-tracker.html`, insert immediately after the `window.SLP = ...` line:

```js
// ============================================================
// SECTION: db — IndexedDB access. Knows stores, not meaning.
// ============================================================
SLP.db = (() => {
  const DB_NAME = 'slp-tracker';
  const DB_VERSION = 1;

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
    meta:       [],
  };
  const STORES = Object.keys(SCHEMA);

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, indexes] of Object.entries(SCHEMA)) {
          const os = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: 'id' });
          for (const idx of indexes) {
            if (!os.indexNames.contains(idx)) os.createIndex(idx, idx, { unique: false });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });
    return dbPromise;
  }

  // Wraps one transaction; resolves with `result` once the transaction commits,
  // so callers never read a value that failed to persist.
  async function tx(storeNames, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
      result = fn(t);
      if (result && typeof result.then === 'function') {
        reject(new Error('transaction callbacks must be synchronous'));
      }
    });
  }

  return {
    STORES,
    open,

    async put(store, obj) {
      await tx(store, 'readwrite', t => { t.objectStore(store).put(obj); });
      return obj;
    },

    async get(store, id) {
      const box = { value: undefined };
      await tx(store, 'readonly', t => {
        const r = t.objectStore(store).get(id);
        r.onsuccess = () => { box.value = r.result; };
      });
      return box.value;
    },

    async getAll(store) {
      const box = { value: [] };
      await tx(store, 'readonly', t => {
        const r = t.objectStore(store).getAll();
        r.onsuccess = () => { box.value = r.result || []; };
      });
      return box.value;
    },

    async getAllBy(store, indexName, value) {
      const box = { value: [] };
      await tx(store, 'readonly', t => {
        const r = t.objectStore(store).index(indexName).getAll(value);
        r.onsuccess = () => { box.value = r.result || []; };
      });
      return box.value;
    },

    async del(store, id) {
      await tx(store, 'readwrite', t => { t.objectStore(store).delete(id); });
    },

    async bulkPut(store, objs) {
      await tx(store, 'readwrite', t => {
        const os = t.objectStore(store);
        for (const o of objs) os.put(o);
      });
    },

    async clearAll() {
      await tx(STORES, 'readwrite', t => {
        for (const s of STORES) t.objectStore(s).clear();
      });
    },
  };
})();
```

The `{ value }` box pattern repeated in `get`/`getAll`/`getAllBy` is deliberate: each
method captures its request's result and lets `tx()` resolve only once the transaction
commits, so a caller never reads a value that failed to persist.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — `# done 10 tests, 10 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/db.test.js tests/index.html
git commit -m "feat: IndexedDB access layer with transaction-commit semantics"
```

---

## Task 3: The `model` section — entities and the entered-vs-pre-filled rule

This is the task where a silent bug costs her real data. Spec §4's callout is implemented
here and tested exhaustively. Everything in this section is a pure function: no IO, no
`await`, no DOM.

**Files:**
- Modify: `slp-tracker.html` (add the `model` section after `db`)
- Create: `tests/model.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `SLP.model.uid(prefix)` → `string`
  - `SLP.model.now()` → ISO string
  - `SLP.model.student({name, grade, school, background})` → student object
  - `SLP.model.goal({studentId, text, order})` → goal object
  - `SLP.model.objective({goalId, text, order, fields})` → objective object
  - `SLP.model.field({label, type, default, role})` → FieldDef
  - `SLP.model.presetTrials()` → `FieldDef[]` — achieved, target, notes
  - `SLP.model.slot({dayOfWeek, startTime, endTime, studentIds, location})` → slot
  - `SLP.model.session({date, slotId, startTime, endTime, location, roster})` → session
  - `SLP.model.attendance({sessionId, studentId, status, participation, isMakeup})`
  - `SLP.model.note({sessionId, studentId, text})`
  - `SLP.model.seedValues(objective)` → values object, all `entered: false`
  - `SLP.model.datapoint({sessionId, studentId, objective})` → datapoint with seeded values
  - `SLP.model.setValue(dp, objective, fieldId, raw)` → the same dp, mutated
  - `SLP.model.hasEnteredData(dp)` → `boolean`
  - `SLP.model.ratio(objective, dp)` → `{achieved, target, pct}` or `null`
  - `SLP.model.displayText(text, studentName)` → `string` with `STUDENT` substituted

- [ ] **Step 1: Write the failing tests for the pre-filled rule**

Create `tests/model.test.js`:

```js
// A minimal objective used across these tests: the default trials preset.
function trialsObjective(w) {
  return w.SLP.model.objective({
    goalId: 'g1', text: 'STUDENT will identify common objects', order: 0,
    fields: w.SLP.model.presetTrials(),
  });
}
function fieldByRole(obj, role) { return obj.fields.find(f => f.role === role); }

test('presetTrials produces exactly one achieved, one target, and a text note', async () => {
  const w = await loadApp();
  const fields = w.SLP.model.presetTrials();
  eq(fields.filter(f => f.role === 'achieved').length, 1, 'one achieved field');
  eq(fields.filter(f => f.role === 'target').length, 1, 'one target field');
  eq(fields.filter(f => f.type === 'text').length, 1, 'one text field');
  eq(fieldByRole({ fields }, 'target').default, 4, 'target defaults to 4');
});

test('only two field types exist', async () => {
  const w = await loadApp();
  for (const f of w.SLP.model.presetTrials()) {
    assert(f.type === 'number' || f.type === 'text', 'unexpected field type: ' + f.type);
  }
});

test('seeded values are pre-filled, never entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const values = w.SLP.model.seedValues(obj);
  const target = fieldByRole(obj, 'target');
  eq(values[target.id].value, 4, 'target seeded from its default');
  eq(values[target.id].entered, false, 'a seeded default is NOT entered');
});

test('a fresh datapoint with only defaults has no entered data', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  eq(w.SLP.model.hasEnteredData(dp), false,
     'defaults alone must never count as data entry');
});

test('typing a value marks it entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const achieved = fieldByRole(obj, 'achieved');
  w.SLP.model.setValue(dp, obj, achieved.id, '3');
  eq(dp.values[achieved.id].value, 3, 'number fields coerce to Number');
  eq(dp.values[achieved.id].entered, true, 'typed value is entered');
  eq(w.SLP.model.hasEnteredData(dp), true, 'datapoint now has entered data');
});

test('typing the SAME value as the default still counts as entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const target = fieldByRole(obj, 'target');
  eq(dp.values[target.id].value, 4, 'precondition: default is 4');
  w.SLP.model.setValue(dp, obj, target.id, '4');
  eq(dp.values[target.id].entered, true,
     'she confirmed the target by typing it — that is an observation');
});

test('clearing a field reverts it to the pre-filled default, not entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const target = fieldByRole(obj, 'target');
  w.SLP.model.setValue(dp, obj, target.id, '2');
  eq(dp.values[target.id].entered, true, 'precondition: entered');
  w.SLP.model.setValue(dp, obj, target.id, '');
  eq(dp.values[target.id].value, 4, 'cleared field returns to its default');
  eq(dp.values[target.id].entered, false, 'cleared field is no longer an observation');
  eq(w.SLP.model.hasEnteredData(dp), false, 'and the datapoint is untouched again');
});

test('entering zero counts as entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const achieved = fieldByRole(obj, 'achieved');
  w.SLP.model.setValue(dp, obj, achieved.id, '0');
  eq(dp.values[achieved.id].value, 0, 'zero is a real value');
  eq(dp.values[achieved.id].entered, true, 'zero trials completed is an observation');
});

test('whitespace-only text is not entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const notes = obj.fields.find(f => f.type === 'text');
  w.SLP.model.setValue(dp, obj, notes.id, '   ');
  eq(dp.values[notes.id].entered, false, 'blank text is not an observation');
});

test('a non-numeric string in a number field is rejected, leaving the field untouched', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  const achieved = fieldByRole(obj, 'achieved');
  w.SLP.model.setValue(dp, obj, achieved.id, 'abc');
  eq(dp.values[achieved.id].entered, false, 'garbage must not become an observation');
  eq(dp.values[achieved.id].value, null, 'achieved has no default, so it stays null');
});

test('a text field with no default seeds to empty string', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const values = w.SLP.model.seedValues(obj);
  const notes = obj.fields.find(f => f.type === 'text');
  eq(values[notes.id].value, '', 'text seeds to empty string');
  eq(values[notes.id].entered, false, 'and is not entered');
});
```

- [ ] **Step 2: Write the failing tests for ratio and display text**

Append to `tests/model.test.js`:

```js
test('ratio is derived only from a matched achieved/target pair', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  w.SLP.model.setValue(dp, obj, fieldByRole(obj, 'achieved').id, '3');
  const r = w.SLP.model.ratio(obj, dp);
  eq(r.achieved, 3, 'achieved');
  eq(r.target, 4, 'target comes from the pre-filled default');
  eq(r.pct, 75, 'percentage');
});

test('ratio is null when the achieved value was never entered', async () => {
  const w = await loadApp();
  const obj = trialsObjective(w);
  const dp = w.SLP.model.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  eq(w.SLP.model.ratio(obj, dp), null,
     'a pre-filled target alone is not a measurement');
});

test('ratio is null for custom fields with no roles', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const obj = m.objective({
    goalId: 'g1', text: 'x', order: 0,
    fields: [m.field({ label: 'Utterances', type: 'number' })],
  });
  const dp = m.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  m.setValue(dp, obj, obj.fields[0].id, '12');
  eq(m.ratio(obj, dp), null, 'unpaired numbers chart on their own scale');
});

test('ratio is null when target is zero', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const obj = m.objective({
    goalId: 'g1', text: 'x', order: 0,
    fields: [
      m.field({ label: 'Got', type: 'number', role: 'achieved' }),
      m.field({ label: 'Of', type: 'number', role: 'target', default: 0 }),
    ],
  });
  const dp = m.datapoint({ sessionId: 'x', studentId: 's1', objective: obj });
  m.setValue(dp, obj, obj.fields[0].id, '3');
  eq(m.ratio(obj, dp), null, 'never divide by zero');
});

test('STUDENT is substituted with the student name for display', async () => {
  const w = await loadApp();
  eq(w.SLP.model.displayText('STUDENT will identify STUDENT’s objects', 'Ada'),
     'Ada will identify Ada’s objects', 'every occurrence replaced');
});

test('displayText leaves text without the placeholder alone', async () => {
  const w = await loadApp();
  eq(w.SLP.model.displayText('Will identify objects', 'Ada'),
     'Will identify objects', 'unchanged');
});

test('uid produces unique prefixed ids', async () => {
  const w = await loadApp();
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(w.SLP.model.uid('s'));
  eq(ids.size, 500, 'no collisions');
  assert([...ids].every(id => id.startsWith('s_')), 'ids carry their prefix');
});
```

- [ ] **Step 3: Register the suite and run to verify failure**

Add `<script src="model.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — 18 model tests error with `Cannot read properties of undefined (reading 'objective')`.

- [ ] **Step 4: Implement the `model` section**

In `slp-tracker.html`, after the `db` section:

```js
// ============================================================
// SECTION: model — entity shapes and the entered-vs-pre-filled rule.
// Pure functions only. No IO, no DOM, no await.
// ============================================================
SLP.model = (() => {
  let counter = 0;
  const uid = prefix =>
    prefix + '_' + Date.now().toString(36) + (counter++).toString(36) +
    Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();

  const field = ({ label, type = 'number', default: def = null, role = null }) => ({
    id: uid('f'), label, type, default: type === 'number' ? def : null, role,
  });

  // The preset carries the semantics: role pairing is what makes a ratio derivable.
  const presetTrials = () => [
    field({ label: 'Trials completed', type: 'number', default: null, role: 'achieved' }),
    field({ label: 'Trials # goal', type: 'number', default: 4, role: 'target' }),
    field({ label: 'Notes', type: 'text' }),
  ];

  function seedValues(objective) {
    const values = {};
    for (const f of objective.fields) {
      values[f.id] = {
        value: f.type === 'number' ? (f.default === undefined ? null : f.default) : '',
        entered: false,   // a pre-filled default is NOT data entry
      };
    }
    return values;
  }

  function defaultFor(f) {
    return f.type === 'number' ? (f.default === undefined ? null : f.default) : '';
  }

  // The one rule the whole app leans on. `raw` is always what the input element holds.
  function setValue(dp, objective, fieldId, raw) {
    const f = objective.fields.find(x => x.id === fieldId);
    if (!f) return dp;
    const cell = dp.values[fieldId] || (dp.values[fieldId] = { value: defaultFor(f), entered: false });
    const str = raw == null ? '' : String(raw);

    if (str.trim() === '') {
      // Cleared: fall back to the pre-filled default and stop counting as an observation.
      cell.value = defaultFor(f);
      cell.entered = false;
      return dp;
    }
    if (f.type === 'number') {
      const n = Number(str);
      if (!Number.isFinite(n)) return dp;   // reject garbage, change nothing
      cell.value = n;
      cell.entered = true;                  // typing the default value is still an observation
      return dp;
    }
    cell.value = str;
    cell.entered = true;
    return dp;
  }

  const hasEnteredData = dp =>
    !!dp && Object.values(dp.values || {}).some(c => c.entered === true);

  function ratio(objective, dp) {
    const a = objective.fields.filter(f => f.role === 'achieved');
    const t = objective.fields.filter(f => f.role === 'target');
    if (a.length !== 1 || t.length !== 1) return null;
    const av = dp.values[a[0].id], tv = dp.values[t[0].id];
    if (!av || !tv) return null;
    if (!av.entered) return null;                  // a pre-filled target alone measures nothing
    if (typeof av.value !== 'number' || typeof tv.value !== 'number') return null;
    if (!tv.value) return null;                    // never divide by zero
    return { achieved: av.value, target: tv.value,
             pct: Math.round((av.value / tv.value) * 100) };
  }

  const displayText = (text, studentName) =>
    String(text || '').split('STUDENT').join(studentName || 'STUDENT');

  return {
    uid, now, field, presetTrials, seedValues, setValue, hasEnteredData, ratio, displayText,

    student: ({ name, grade = '', school = '', background = '' }) => ({
      id: uid('s'), name, grade, school, background,
      active: true, createdAt: now(), updatedAt: now(),
    }),
    goal: ({ studentId, text, order = 0 }) => ({
      id: uid('g'), studentId, text, order, createdAt: now(), updatedAt: now(),
    }),
    objective: ({ goalId, text, order = 0, fields = presetTrials() }) => ({
      id: uid('o'), goalId, text, order, fields, createdAt: now(), updatedAt: now(),
    }),
    slot: ({ dayOfWeek, startTime, endTime, studentIds = [], location = '' }) => ({
      id: uid('sl'), dayOfWeek, startTime, endTime, studentIds, location, createdAt: now(),
    }),
    session: ({ date, slotId = null, startTime, endTime, location = '', roster = [] }) => ({
      id: uid('se'), date, slotId, startTime, endTime, location, roster, createdAt: now(),
    }),
    attendance: ({ sessionId, studentId, status, participation = 'scheduled', isMakeup = false }) => ({
      id: uid('at'), sessionId, studentId, status, participation, isMakeup, updatedAt: now(),
    }),
    note: ({ sessionId, studentId, text = '' }) => ({
      id: uid('n'), sessionId, studentId, text, updatedAt: now(),
    }),
    datapoint: ({ sessionId, studentId, objective }) => ({
      id: uid('dp'), sessionId, studentId, objectiveId: objective.id,
      values: seedValues(objective), updatedAt: now(),
    }),
  };
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all model tests green, `0 failed`.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/model.test.js tests/index.html
git commit -m "feat: entity model and the entered-vs-pre-filled rule"
```

---

## Task 4: The `store` section — repositories and lazy session materialization

**Files:**
- Modify: `slp-tracker.html` (add the `store` section after `model`)
- Create: `tests/store.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.db.*`, `SLP.model.*`.
- Produces:
  - `SLP.store.listStudents({activeOnly = false})` → `Promise<student[]>` sorted by name
  - `SLP.store.saveStudent(s)`, `SLP.store.setStudentActive(id, active)`
  - `SLP.store.goalsFor(studentId)`, `SLP.store.objectivesFor(goalId)`
  - `SLP.store.objectivesForStudent(studentId)` → `Promise<[{goal, objectives}]>`
  - `SLP.store.saveGoal(g)`, `SLP.store.saveObjective(o)`, `SLP.store.deleteObjective(id)`
  - `SLP.store.listSlots()` → sorted by day then start time
  - `SLP.store.saveSlot(sl)`, `SLP.store.deleteSlot(id)`
  - `SLP.store.planForDate(dateStr)` → `Promise<PlanEntry[]>`, **read-only, materializes nothing**
  - `SLP.store.ensureSession(dateStr, slot)` → `Promise<session>` — creates on first write
  - `SLP.store.recordValue({dateStr, slot, studentId, objectiveId, fieldId, raw})` → `Promise<datapoint>`
  - `SLP.store.setAttendance({dateStr, slot, studentId, status})` → `Promise<attendance>`
  - `SLP.store.saveNote({dateStr, slot, studentId, text})` → `Promise<note>`
  - `SLP.store.addStudentToSession(sessionId, studentId)`, `removeStudentFromSession(sessionId, studentId)`

  `PlanEntry` = `{slot, session|null, students:[student], attendance:{studentId: row},
  notes:{studentId: row}, datapoints:{studentId: {objectiveId: dp}}, objectives:{studentId: [{goal, objectives}]}}`

- [ ] **Step 1: Write the failing tests for materialize-on-write**

Create `tests/store.test.js`:

```js
async function seedCaseload(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3' });
  const bo = m.student({ name: 'Bo', grade: '3' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will identify objects' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will name 4 objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id] });
  await st.saveSlot(slot);
  return { ada, bo, goal, obj, slot };
}

// 2026-09-07 is a Monday (dayOfWeek 1).
const MONDAY = '2026-09-07';

test('browsing a day materializes nothing', async () => {
  const w = await loadApp();
  await seedCaseload(w);
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan.length, 1, 'one slot on the schedule that day');
  eq(plan[0].session, null, 'reading a day must not create a session');
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'no session rows written');
});

test('a day with no matching slot yields an empty plan', async () => {
  const w = await loadApp();
  await seedCaseload(w);
  const plan = await w.SLP.store.planForDate('2026-09-08'); // Tuesday
  eq(plan.length, 0, 'nothing scheduled');
});

test('the first write materializes exactly one session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const sessions = await w.SLP.db.getAll('sessions');
  eq(sessions.length, 1, 'one session materialized');
  eq(sessions[0].date, MONDAY, 'session snapshots its date');
  eq(sessions[0].startTime, '09:00', 'session snapshots its time');
  eq(sessions[0].roster.length, 2, 'session snapshots its roster');
});

test('a second write reuses the same session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '4' });
  eq((await w.SLP.db.getAll('sessions')).length, 1, 'still one session');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'still one datapoint');
});

test('editing the schedule never rewrites a past session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  slot.startTime = '10:30';
  slot.studentIds = [ada.id];
  await w.SLP.store.saveSlot(slot);
  const s = (await w.SLP.db.getAll('sessions'))[0];
  eq(s.startTime, '09:00', 'the session keeps the time it actually ran at');
  eq(s.roster.length, 2, 'and the roster it actually had');
});
```

- [ ] **Step 2: Write the failing tests for the attendance rule**

Append to `tests/store.test.js`:

```js
test('entering data marks the student present', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].attendance[ada.id].status, 'present', 'attendance derives from data entry');
});

test('a pre-filled default alone never marks anyone present', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const targetId = obj.fields.find(f => f.role === 'target').id;
  // Simulate the UI writing back the untouched pre-filled target.
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId: targetId, raw: '' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  assert(!plan[0].attendance[ada.id],
         'an untouched default must not create an attendance row');
});

test('clearing the last entered value removes the derived present mark', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  assert(!plan[0].attendance[ada.id] || plan[0].attendance[ada.id].status !== 'present',
         'undoing her only entry should undo the derived attendance');
});

test('an explicit absent mark survives later data entry', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  await w.SLP.store.setAttendance({ dateStr: MONDAY, slot, studentId: ada.id, status: 'absent' });
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].attendance[ada.id].status, 'absent',
     'an explicit mark is hers, not the app’s to overwrite');
});

test('marking absent materializes a session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedCaseload(w);
  await w.SLP.store.setAttendance({ dateStr: MONDAY, slot, studentId: ada.id, status: 'absent' });
  eq((await w.SLP.db.getAll('sessions')).length, 1, 'absence is a record worth keeping');
});

test('a note marks the student present and materializes a session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedCaseload(w);
  await w.SLP.store.saveNote({ dateStr: MONDAY, slot, studentId: ada.id, text: 'good day' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].notes[ada.id].text, 'good day', 'note saved');
  eq(plan[0].attendance[ada.id].status, 'present', 'a note is data entry');
});

test('adding a student affects only that session', async () => {
  const w = await loadApp();
  const { ada, bo, obj, slot } = await seedCaseload(w);
  const cy = w.SLP.model.student({ name: 'Cy', grade: '4' });
  await w.SLP.store.saveStudent(cy);
  const session = await w.SLP.store.ensureSession(MONDAY, slot);
  await w.SLP.store.addStudentToSession(session.id, cy.id);

  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].students.map(s => s.name).sort(), ['Ada', 'Bo', 'Cy'], 'Cy is in this session');
  eq(plan[0].attendance[cy.id].participation, 'added', 'and is chipped as added');

  const nextWeek = await w.SLP.store.planForDate('2026-09-14');
  eq(nextWeek[0].students.map(s => s.name).sort(), ['Ada', 'Bo'],
     'next week’s slot is untouched');
});

test('deactivating a student keeps their history', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.setStudentActive(ada.id, false);
  eq((await w.SLP.store.listStudents({ activeOnly: true })).map(s => s.name), ['Bo'],
     'inactive students drop off the caseload');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'but their data survives');
});

test('students list is sorted by name', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  for (const n of ['Zoe', 'Ada', 'Mo']) await w.SLP.store.saveStudent(m.student({ name: n }));
  eq((await w.SLP.store.listStudents({})).map(s => s.name), ['Ada', 'Mo', 'Zoe'], 'sorted');
});

test('slots are sorted by day then start time', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  await st.saveSlot(m.slot({ dayOfWeek: 3, startTime: '09:00', endTime: '09:30' }));
  await st.saveSlot(m.slot({ dayOfWeek: 1, startTime: '13:00', endTime: '13:30' }));
  await st.saveSlot(m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30' }));
  eq((await st.listSlots()).map(s => s.dayOfWeek + '@' + s.startTime),
     ['1@09:00', '1@13:00', '3@09:00'], 'schedule reading order');
});
```

- [ ] **Step 3: Register the suite and run to verify failure**

Add `<script src="store.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — store tests error with `Cannot read properties of undefined (reading 'saveStudent')`.

- [ ] **Step 4: Implement the `store` section**

In `slp-tracker.html`, after the `model` section:

```js
// ============================================================
// SECTION: store — repositories and write paths.
// Sessions materialize on write, never on read.
// ============================================================
SLP.store = (() => {
  const db = SLP.db, m = SLP.model;
  const byName = (a, b) => a.name.localeCompare(b.name);

  // 'YYYY-MM-DD' -> 0..6, parsed as a local date so it never shifts a day by timezone.
  function dayOfWeek(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).getDay();
  }

  async function findSession(dateStr, slotId) {
    const onDate = await db.getAllBy('sessions', 'date', dateStr);
    return onDate.find(s => s.slotId === slotId) || null;
  }

  async function ensureSession(dateStr, slot) {
    const existing = await findSession(dateStr, slot.id);
    if (existing) return existing;
    const session = m.session({
      date: dateStr, slotId: slot.id, startTime: slot.startTime,
      endTime: slot.endTime, location: slot.location,
      roster: [...slot.studentIds],       // snapshot, not a reference
    });
    await db.put('sessions', session);
    return session;
  }

  async function rowFor(store, sessionId, studentId) {
    const rows = await db.getAllBy(store, 'sessionId', sessionId);
    return rows.find(r => r.studentId === studentId) || null;
  }

  // Attendance derives from data entry, but never overrides an explicit mark.
  async function deriveAttendance(session, studentId) {
    const existing = await rowFor('attendance', session.id, studentId);
    if (existing && existing.status !== 'present') return existing;   // hers, leave it

    const dps = (await db.getAllBy('datapoints', 'sessionId', session.id))
      .filter(d => d.studentId === studentId);
    const note = await rowFor('notes', session.id, studentId);
    const touched = dps.some(m.hasEnteredData) || !!(note && note.text.trim());

    if (touched) {
      const row = existing || m.attendance({
        sessionId: session.id, studentId, status: 'present',
        participation: session.roster.includes(studentId) ? 'scheduled' : 'added',
      });
      row.status = 'present';
      row.updatedAt = m.now();
      await db.put('attendance', row);
      return row;
    }
    // Nothing entered any more — withdraw a mark the app itself derived.
    if (existing) await db.del('attendance', existing.id);
    return null;
  }

  return {
    // --- caseload ---
    async listStudents({ activeOnly = false } = {}) {
      const all = await db.getAll('students');
      return all.filter(s => !activeOnly || s.active).sort(byName);
    },
    saveStudent: s => db.put('students', Object.assign(s, { updatedAt: m.now() })),
    async setStudentActive(id, active) {
      const s = await db.get('students', id);
      if (!s) return null;
      s.active = active; s.updatedAt = m.now();
      return db.put('students', s);
    },

    // --- goals and objectives ---
    async goalsFor(studentId) {
      return (await db.getAllBy('goals', 'studentId', studentId))
        .sort((a, b) => a.order - b.order);
    },
    async objectivesFor(goalId) {
      return (await db.getAllBy('objectives', 'goalId', goalId))
        .sort((a, b) => a.order - b.order);
    },
    async objectivesForStudent(studentId) {
      const goals = await this.goalsFor(studentId);
      const out = [];
      for (const goal of goals) out.push({ goal, objectives: await this.objectivesFor(goal.id) });
      return out;
    },
    saveGoal: g => db.put('goals', Object.assign(g, { updatedAt: m.now() })),
    saveObjective: o => db.put('objectives', Object.assign(o, { updatedAt: m.now() })),
    deleteObjective: id => db.del('objectives', id),

    // --- schedule ---
    async listSlots() {
      return (await db.getAll('slots')).sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    },
    saveSlot: sl => db.put('slots', sl),
    deleteSlot: id => db.del('slots', id),

    ensureSession,

    // --- the day view ---
    // Read-only. Materializes nothing, so browsing a future day keeps tracking the template.
    async planForDate(dateStr) {
      const dow = dayOfWeek(dateStr);
      const slots = (await this.listSlots()).filter(s => s.dayOfWeek === dow);
      const students = await db.getAll('students');
      const byId = Object.fromEntries(students.map(s => [s.id, s]));
      const adHoc = (await db.getAllBy('sessions', 'date', dateStr)).filter(s => !s.slotId);
      const entries = [];

      const build = async (slot, session) => {
        const roster = session ? session.roster : slot.studentIds;
        const entry = {
          slot, session,
          students: roster.map(id => byId[id]).filter(Boolean).sort(byName),
          attendance: {}, notes: {}, datapoints: {}, objectives: {},
        };
        if (session) {
          for (const a of await db.getAllBy('attendance', 'sessionId', session.id)) {
            entry.attendance[a.studentId] = a;
          }
          for (const n of await db.getAllBy('notes', 'sessionId', session.id)) {
            entry.notes[n.studentId] = n;
          }
          for (const d of await db.getAllBy('datapoints', 'sessionId', session.id)) {
            (entry.datapoints[d.studentId] || (entry.datapoints[d.studentId] = {}))[d.objectiveId] = d;
          }
        }
        for (const s of entry.students) {
          entry.objectives[s.id] = await this.objectivesForStudent(s.id);
        }
        return entry;
      };

      for (const slot of slots) entries.push(await build(slot, await findSession(dateStr, slot.id)));
      for (const session of adHoc) {
        entries.push(await build(
          { id: null, dayOfWeek: dow, startTime: session.startTime,
            endTime: session.endTime, studentIds: session.roster, location: session.location },
          session));
      }
      return entries.sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
    },

    // --- write paths (each materializes, then re-derives attendance) ---
    async recordValue({ dateStr, slot, studentId, objectiveId, fieldId, raw }) {
      const session = await ensureSession(dateStr, slot);
      const objective = await db.get('objectives', objectiveId);
      if (!objective) throw new Error('unknown objective: ' + objectiveId);
      const existing = (await db.getAllBy('datapoints', 'sessionId', session.id))
        .find(d => d.studentId === studentId && d.objectiveId === objectiveId);
      const dp = existing || m.datapoint({ sessionId: session.id, studentId, objective });
      m.setValue(dp, objective, fieldId, raw);
      dp.updatedAt = m.now();
      await db.put('datapoints', dp);
      await deriveAttendance(session, studentId);
      return dp;
    },

    async setAttendance({ dateStr, slot, studentId, status }) {
      const session = await ensureSession(dateStr, slot);
      const existing = await rowFor('attendance', session.id, studentId);
      const row = existing || m.attendance({
        sessionId: session.id, studentId, status,
        participation: session.roster.includes(studentId) ? 'scheduled' : 'added',
      });
      row.status = status;
      row.updatedAt = m.now();
      await db.put('attendance', row);
      return row;
    },

    async saveNote({ dateStr, slot, studentId, text }) {
      const session = await ensureSession(dateStr, slot);
      const existing = await rowFor('notes', session.id, studentId);
      const row = existing || m.note({ sessionId: session.id, studentId });
      row.text = text;
      row.updatedAt = m.now();
      await db.put('notes', row);
      await deriveAttendance(session, studentId);
      return row;
    },

    async addStudentToSession(sessionId, studentId) {
      const session = await db.get('sessions', sessionId);
      if (!session || session.roster.includes(studentId)) return session;
      session.roster.push(studentId);
      await db.put('sessions', session);
      await db.put('attendance', m.attendance({
        sessionId, studentId, status: 'present', participation: 'added',
      }));
      return session;
    },

    async removeStudentFromSession(sessionId, studentId) {
      const session = await db.get('sessions', sessionId);
      if (!session) return null;
      session.roster = session.roster.filter(id => id !== studentId);
      await db.put('sessions', session);
      for (const store of ['attendance', 'notes', 'datapoints']) {
        for (const row of await db.getAllBy(store, 'sessionId', sessionId)) {
          if (row.studentId === studentId) await db.del(store, row.id);
        }
      }
      return session;
    },
  };
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all store tests green.

Note on the `addStudentToSession` test: it expects `participation: 'added'`. If the
attendance row is created with `status: 'present'` before any data entry, that is correct
and deliberate — pulling someone into a session is itself an explicit act, unlike a
pre-filled default.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/store.test.js tests/index.html
git commit -m "feat: repositories, lazy session materialization, derived attendance"
```

---

## Task 5: The `derive` section — charted counter, series, mastery

**Files:**
- Modify: `slp-tracker.html` (add `derive` after `store`)
- Create: `tests/derive.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.model.*`.
- Produces:
  - `SLP.derive.studentState(entry, studentId)` → `'present' | 'absent' | 'excused' | 'cancelled' | 'none'`
  - `SLP.derive.chartedCount(plan)` → `{charted, total}`
  - `SLP.derive.series(objective, rows)` → `[{fieldId, label, kind:'pct'|'raw', points:[{date, value}]}]`
    where `rows` is `[{date, dp}]` in chronological order
  - `SLP.derive.mastery(objective, rows, {window = 3})` → `{met, of, window, mastered}` or `null`

- [ ] **Step 1: Write the failing tests**

Create `tests/derive.test.js`:

```js
function objWithPair(w) {
  const m = w.SLP.model;
  return m.objective({ goalId: 'g', text: 'x', order: 0, fields: m.presetTrials() });
}
function dpWith(w, obj, achieved, target) {
  const m = w.SLP.model;
  const dp = m.datapoint({ sessionId: 'se', studentId: 's', objective: obj });
  m.setValue(dp, obj, obj.fields.find(f => f.role === 'achieved').id, String(achieved));
  if (target != null) m.setValue(dp, obj, obj.fields.find(f => f.role === 'target').id, String(target));
  return dp;
}

test('a student with nothing entered reads as not-yet-charted', async () => {
  const w = await loadApp();
  const entry = { attendance: {}, notes: {}, datapoints: {} };
  eq(w.SLP.derive.studentState(entry, 's1'), 'none', 'third visible state');
});

test('an explicit absence reads as absent', async () => {
  const w = await loadApp();
  const entry = { attendance: { s1: { status: 'absent' } }, notes: {}, datapoints: {} };
  eq(w.SLP.derive.studentState(entry, 's1'), 'absent', 'explicit mark wins');
});

test('charted counter ignores students with only pre-filled defaults', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const untouched = w.SLP.model.datapoint({ sessionId: 'se', studentId: 's1', objective: obj });
  const plan = [{
    students: [{ id: 's1' }, { id: 's2' }],
    attendance: {}, notes: {},
    datapoints: { s1: { [obj.id]: untouched } },
  }];
  eq(w.SLP.derive.chartedCount(plan), { charted: 0, total: 2 },
     'a pre-filled default must not report itself complete');
});

test('charted counter counts entered data and explicit absences', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const plan = [{
    students: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    attendance: { s2: { status: 'absent' } }, notes: {},
    datapoints: { s1: { [obj.id]: dpWith(w, obj, 3) } },
  }];
  eq(w.SLP.derive.chartedCount(plan), { charted: 2, total: 3 },
     'entered data and a logged absence both count as charted');
});

test('charted counter sums across slots', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const plan = [
    { students: [{ id: 'a' }], attendance: {}, notes: {},
      datapoints: { a: { [obj.id]: dpWith(w, obj, 1) } } },
    { students: [{ id: 'b' }, { id: 'c' }], attendance: {}, notes: {}, datapoints: {} },
  ];
  eq(w.SLP.derive.chartedCount(plan), { charted: 1, total: 3 }, 'summed');
});

test('a paired objective charts as a percentage', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const rows = [
    { date: '2026-09-07', dp: dpWith(w, obj, 2) },
    { date: '2026-09-14', dp: dpWith(w, obj, 3) },
  ];
  const series = w.SLP.derive.series(obj, rows);
  eq(series.length, 1, 'one line for the pair');
  eq(series[0].kind, 'pct', 'charted as percentage');
  eq(series[0].points.map(p => p.value), [50, 75], 'percentages over time');
});

test('unpaired number fields each chart on their own scale', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const obj = m.objective({ goalId: 'g', text: 'x', order: 0, fields: [
    m.field({ label: 'Utterances', type: 'number' }),
    m.field({ label: 'Prompts', type: 'number' }),
  ]});
  const dp = m.datapoint({ sessionId: 'se', studentId: 's', objective: obj });
  m.setValue(dp, obj, obj.fields[0].id, '12');
  m.setValue(dp, obj, obj.fields[1].id, '3');
  const series = w.SLP.derive.series(obj, [{ date: '2026-09-07', dp }]);
  eq(series.map(s => s.label), ['Utterances', 'Prompts'], 'one line each');
  eq(series.every(s => s.kind === 'raw'), true, 'no normalization, ever');
});

test('text fields never chart', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const series = w.SLP.derive.series(obj, [{ date: '2026-09-07', dp: dpWith(w, obj, 3) }]);
  assert(!series.some(s => s.label === 'Notes'), 'free text is not a measurement');
});

test('pre-filled-only sessions contribute no points', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const untouched = w.SLP.model.datapoint({ sessionId: 'se', studentId: 's', objective: obj });
  eq(w.SLP.derive.series(obj, [{ date: '2026-09-07', dp: untouched }])[0].points, [],
     'an untouched session is not a data point');
});

test('mastery counts sessions meeting criterion within the window', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const rows = [
    { date: '2026-09-07', dp: dpWith(w, obj, 2) }, // 2/4 - miss
    { date: '2026-09-14', dp: dpWith(w, obj, 4) }, // 4/4 - met
    { date: '2026-09-21', dp: dpWith(w, obj, 3) }, // 3/4 - met
  ];
  eq(w.SLP.derive.mastery(obj, rows), { met: 2, of: 3, window: 3, mastered: false },
     'met criterion in 2 of the last 3');
});

test('mastery is reached when the whole window meets criterion', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const rows = ['2026-09-07', '2026-09-14', '2026-09-21']
    .map(date => ({ date, dp: dpWith(w, obj, 4) }));
  eq(w.SLP.derive.mastery(obj, rows).mastered, true, 'three consecutive sessions');
});

test('mastery only looks at the most recent window', async () => {
  const w = await loadApp();
  const obj = objWithPair(w);
  const rows = [
    { date: '2026-09-01', dp: dpWith(w, obj, 4) },
    { date: '2026-09-07', dp: dpWith(w, obj, 1) },
    { date: '2026-09-14', dp: dpWith(w, obj, 1) },
    { date: '2026-09-21', dp: dpWith(w, obj, 1) },
  ];
  eq(w.SLP.derive.mastery(obj, rows).met, 0, 'old wins do not linger');
});

test('mastery is null for an objective with no criterion pair', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const obj = m.objective({ goalId: 'g', text: 'x', order: 0,
    fields: [m.field({ label: 'Utterances', type: 'number' })] });
  const dp = m.datapoint({ sessionId: 'se', studentId: 's', objective: obj });
  m.setValue(dp, obj, obj.fields[0].id, '9');
  eq(m && w.SLP.derive.mastery(obj, [{ date: '2026-09-07', dp }]), null,
     'no pair, no criterion, no mastery claim');
});
```

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="derive.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — derive tests error with `Cannot read properties of undefined (reading 'studentState')`.

- [ ] **Step 3: Implement the `derive` section**

In `slp-tracker.html`, after the `store` section:

```js
// ============================================================
// SECTION: derive — everything computed, nothing stored.
// Progress is measured within one objective over time. Never across objectives.
// ============================================================
SLP.derive = (() => {
  const m = SLP.model;

  // Has she actually charted this student in this slot?
  function touched(entry, studentId) {
    const note = entry.notes[studentId];
    if (note && note.text && note.text.trim()) return true;
    const dps = entry.datapoints[studentId] || {};
    return Object.values(dps).some(m.hasEnteredData);
  }

  function studentState(entry, studentId) {
    const a = entry.attendance[studentId];
    if (a && a.status !== 'present') return a.status;   // absent / excused / cancelled
    if (a && a.status === 'present') return 'present';
    return touched(entry, studentId) ? 'present' : 'none';
  }

  function chartedCount(plan) {
    let charted = 0, total = 0;
    for (const entry of plan) {
      for (const s of entry.students) {
        total++;
        if (studentState(entry, s.id) !== 'none') charted++;
      }
    }
    return { charted, total };
  }

  function pair(objective) {
    const a = objective.fields.filter(f => f.role === 'achieved');
    const t = objective.fields.filter(f => f.role === 'target');
    return (a.length === 1 && t.length === 1) ? { achieved: a[0], target: t[0] } : null;
  }

  function series(objective, rows) {
    const p = pair(objective);
    if (p) {
      const points = [];
      for (const { date, dp } of rows) {
        const r = m.ratio(objective, dp);
        if (r) points.push({ date, value: r.pct, label: r.achieved + ' / ' + r.target });
      }
      return [{ fieldId: p.achieved.id, label: objective.fields.find(f => f.role === 'achieved').label,
                kind: 'pct', points }];
    }
    return objective.fields
      .filter(f => f.type === 'number')
      .map(f => ({
        fieldId: f.id, label: f.label, kind: 'raw',
        points: rows
          .filter(({ dp }) => dp.values[f.id] && dp.values[f.id].entered)
          .map(({ date, dp }) => ({ date, value: dp.values[f.id].value,
                                    label: String(dp.values[f.id].value) })),
      }));
  }

  // Her goal text says "in 3 out of 4 trials across three sessions" — the pair is the
  // criterion, so meeting it is simply achieved >= target.
  function mastery(objective, rows, { window = 3 } = {}) {
    if (!pair(objective)) return null;
    const measured = rows
      .map(({ dp }) => m.ratio(objective, dp))
      .filter(Boolean);
    if (!measured.length) return { met: 0, of: 0, window, mastered: false };
    const recent = measured.slice(-window);
    const met = recent.filter(r => r.achieved >= r.target).length;
    return { met, of: recent.length, window, mastered: recent.length === window && met === window };
  }

  return { studentState, chartedCount, series, mastery, pair };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all derive tests green.

- [ ] **Step 5: Commit**

```bash
git add slp-tracker.html tests/derive.test.js tests/index.html
git commit -m "feat: charted counter, per-objective series, mastery"
```

---

## Task 6: The `backup` section — export, restore, and the reusable file handle

The probe found `persist()` **denied**: her storage is evictable and "Clear browsing data"
wipes it. This section carries the entire safety burden. Per the probe result, the primary
path is the **File System Access handle** — she picks a file once (ideally inside her
Google Drive for Desktop folder) and every later press writes straight back to it with no
prompt. The download is the fallback for when the API is unavailable.

**Files:**
- Modify: `slp-tracker.html` (add `backup` after `derive`)
- Create: `tests/backup.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.db.*`, `SLP.model.*`.
- Produces:
  - `SLP.backup.exportObject()` → `Promise<{schemaVersion, exportedAt, appVersion, data}>`
  - `SLP.backup.exportText()` → `Promise<string>` (pretty JSON)
  - `SLP.backup.filename()` → `slp-data-YYYY-MM-DD.json`
  - `SLP.backup.download()` → `Promise<void>` — fallback path via a Blob URL
  - `SLP.backup.hasFileApi()` → `boolean`
  - `SLP.backup.pickBackupFile()` → `Promise<boolean>` — `showSaveFilePicker`, stores the handle
  - `SLP.backup.writeToHandle()` → `Promise<'ok'|'no-handle'|'denied'>`
  - `SLP.backup.backupNow()` → `Promise<{via:'handle'|'download'}>`
  - `SLP.backup.restoreFromText(text)` → `Promise<{restored:{store:count}}>` — throws on invalid
  - `SLP.backup.status()` → `Promise<{lastBackupAt, hasHandle, staleDays}>`

**Critical property:** restore must be all-or-nothing from the caller's point of view —
validate the *entire* payload before touching the database, so a truncated or foreign file
can never leave her with half a caseload.

- [ ] **Step 1: Write the failing tests**

Create `tests/backup.test.js`:

```js
async function seedForBackup(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will identify objects' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will name 4 objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await st.saveSlot(slot);
  await st.recordValue({ dateStr: '2026-09-07', slot, studentId: ada.id,
                         objectiveId: obj.id,
                         fieldId: obj.fields.find(f => f.role === 'achieved').id, raw: '3' });
  return { ada, goal, obj, slot };
}

test('export includes every store and a schema version', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  eq(typeof dump.schemaVersion, 'number', 'schema version present');
  assert(dump.exportedAt, 'export timestamp present');
  for (const s of w.SLP.db.STORES) {
    assert(Array.isArray(dump.data[s]), 'missing store in export: ' + s);
  }
  eq(dump.data.students.length, 1, 'the student is in the dump');
  eq(dump.data.datapoints.length, 1, 'the datapoint is in the dump');
});

test('the export filename is dated', async () => {
  const w = await loadApp();
  assert(/^slp-data-\d{4}-\d{2}-\d{2}\.json$/.test(w.SLP.backup.filename()),
         'got: ' + w.SLP.backup.filename());
});

test('export text is valid JSON', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const text = await w.SLP.backup.exportText();
  const parsed = JSON.parse(text);
  eq(parsed.data.students.length, 1, 'round-trips through JSON');
});

test('restore replaces everything with the backup contents', async () => {
  const w = await loadApp();
  const { ada } = await seedForBackup(w);
  const text = await w.SLP.backup.exportText();

  // Diverge from the backup: add a student, delete the original.
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Later Addition' }));
  await w.SLP.db.del('students', ada.id);

  await w.SLP.backup.restoreFromText(text);
  const names = (await w.SLP.store.listStudents({})).map(s => s.name);
  eq(names, ['Ada'], 'restore is a replace, not a merge');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'her data came back');
});

test('a full export/restore cycle preserves the entered flag', async () => {
  const w = await loadApp();
  const { obj } = await seedForBackup(w);
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();
  await w.SLP.backup.restoreFromText(text);
  const dp = (await w.SLP.db.getAll('datapoints'))[0];
  const achievedId = obj.fields.find(f => f.role === 'achieved').id;
  const targetId = obj.fields.find(f => f.role === 'target').id;
  eq(dp.values[achievedId].entered, true, 'her observation survived the round trip');
  eq(dp.values[targetId].entered, false,
     'and the pre-filled target did NOT become one');
});

test('restore rejects a file that is not JSON, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  await throws(() => w.SLP.backup.restoreFromText('this is not json'),
               'should reject non-JSON');
  eq((await w.SLP.store.listStudents({})).length, 1, 'existing data untouched');
});

test('restore rejects a foreign JSON file, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  await throws(() => w.SLP.backup.restoreFromText('{"hello":"world"}'),
               'should reject a file that is not an SLP backup');
  eq((await w.SLP.store.listStudents({})).length, 1, 'existing data untouched');
});

test('restore rejects a backup with a store missing, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  delete dump.data.datapoints;
  await throws(() => w.SLP.backup.restoreFromText(JSON.stringify(dump)),
               'should reject a truncated backup');
  eq((await w.SLP.db.getAll('datapoints')).length, 1,
     'a half-written file must never half-restore');
});

test('restore rejects a newer schema version than this app understands', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  dump.schemaVersion = 999;
  await throws(() => w.SLP.backup.restoreFromText(JSON.stringify(dump)),
               'should refuse a backup from a future version');
});

test('backup status reports staleness', async () => {
  const w = await loadApp();
  const before = await w.SLP.backup.status();
  eq(before.lastBackupAt, null, 'never backed up yet');
  eq(before.hasHandle, false, 'no file picked yet');

  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date(Date.now() - 5 * 86400000).toISOString(), backupFileHandle: null });
  const after = await w.SLP.backup.status();
  eq(after.staleDays, 5, 'five days since the last backup');
});

test('writeToHandle reports no-handle before a file is picked', async () => {
  const w = await loadApp();
  eq(await w.SLP.backup.writeToHandle(), 'no-handle', 'nothing to write to yet');
});

test('the File System Access API is detected', async () => {
  const w = await loadApp();
  eq(w.SLP.backup.hasFileApi(), typeof w.showSaveFilePicker === 'function',
     'detection matches reality in this browser');
});
```

**Why no test drives `showSaveFilePicker`:** it requires a real user gesture and opens an
OS dialog, which headless Chrome cannot satisfy. The probe already proved the pick →
write → re-read → reuse-without-prompt cycle works on her actual machine; re-proving it
here is not possible and not needed. What *is* testable — and tested above — is
everything on either side of the dialog. Manual verification is Step 6.

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="backup.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — backup tests error with `Cannot read properties of undefined (reading 'exportObject')`.

- [ ] **Step 3: Implement the `backup` section**

In `slp-tracker.html`, after the `derive` section:

```js
// ============================================================
// SECTION: backup — the safety net.
// persist() was DENIED on her machine: storage is evictable and
// "Clear browsing data" wipes it. This section is load-bearing.
// ============================================================
SLP.backup = (() => {
  const db = SLP.db, m = SLP.model;
  const SCHEMA_VERSION = 1;

  const pad = n => String(n).padStart(2, '0');
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function meta() {
    return (await db.get('meta', 'meta')) ||
      { id: 'meta', schemaVersion: SCHEMA_VERSION, lastBackupAt: null, backupFileHandle: null };
  }

  async function exportObject() {
    const data = {};
    for (const store of db.STORES) {
      // The handle is a live browser object; it must not travel inside a JSON file.
      data[store] = store === 'meta' ? [] : await db.getAll(store);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: SLP.version,
      exportedAt: m.now(),
      data,
    };
  }

  const exportText = async () => JSON.stringify(await exportObject(), null, 2);
  const filename = () => 'slp-data-' + today() + '.json';

  async function markBackedUp() {
    const meta_ = await meta();
    meta_.lastBackupAt = m.now();
    await db.put('meta', meta_);
  }

  const hasFileApi = () => typeof window.showSaveFilePicker === 'function';

  async function pickBackupFile() {
    if (!hasFileApi()) return false;
    const handle = await window.showSaveFilePicker({
      suggestedName: filename(),
      types: [{ description: 'SLP backup', accept: { 'application/json': ['.json'] } }],
    });
    const meta_ = await meta();
    meta_.backupFileHandle = handle;   // structured-cloneable; survives restart
    await db.put('meta', meta_);
    return true;
  }

  async function writeToHandle() {
    const meta_ = await meta();
    const handle = meta_.backupFileHandle;
    if (!handle) return 'no-handle';
    if (handle.queryPermission) {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (perm !== 'granted') return 'denied';
    }
    const writable = await handle.createWritable();
    await writable.write(await exportText());
    await writable.close();
    await markBackedUp();
    return 'ok';
  }

  async function download() {
    const blob = new Blob([await exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await markBackedUp();
  }

  async function backupNow() {
    const via = await writeToHandle();
    if (via === 'ok') return { via: 'handle' };
    await api.download();     // through the exported object, so it stays a testable seam
    return { via: 'download' };
  }

  // Validate the WHOLE payload before touching the database. A truncated or foreign
  // file must never leave her with half a caseload.
  async function restoreFromText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not valid JSON — it may be damaged or the wrong file.');
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      throw new Error('That does not look like an SLP Session Tracker backup.');
    }
    if (typeof parsed.schemaVersion !== 'number') {
      throw new Error('That backup has no schema version — it is not an SLP backup.');
    }
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      throw new Error('That backup was written by a newer version of the app (v' +
                      parsed.schemaVersion + '). Use the newer app file to open it.');
    }
    for (const store of db.STORES) {
      if (store === 'meta') continue;
      if (!Array.isArray(parsed.data[store])) {
        throw new Error('That backup is incomplete — the "' + store +
                        '" section is missing. Nothing was changed.');
      }
    }

    const keepMeta = await meta();           // the file handle is local, not part of the backup
    await db.clearAll();
    const restored = {};
    for (const store of db.STORES) {
      if (store === 'meta') continue;
      const rows = parsed.data[store];
      if (rows.length) await db.bulkPut(store, rows);
      restored[store] = rows.length;
    }
    await db.put('meta', keepMeta);
    return { restored };
  }

  async function status() {
    const meta_ = await meta();
    const staleDays = meta_.lastBackupAt
      ? Math.floor((Date.now() - new Date(meta_.lastBackupAt).getTime()) / 86400000)
      : null;
    return { lastBackupAt: meta_.lastBackupAt, hasHandle: !!meta_.backupFileHandle, staleDays };
  }

  const api = { exportObject, exportText, filename, download, hasFileApi, pickBackupFile,
                writeToHandle, backupNow, restoreFromText, status, SCHEMA_VERSION };
  return api;
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all backup tests green.

- [ ] **Step 5: Commit**

```bash
git add slp-tracker.html tests/backup.test.js tests/index.html
git commit -m "feat: manual backup on a reusable file handle, with all-or-nothing restore"
```

- [ ] **Step 6: Manually verify the file-picker path once**

The headless suite cannot open an OS dialog, so verify this by hand exactly once, on
Brenden's machine — **not hers** (spec constraint: do not run anything on her machine
without asking).

1. Open `slp-tracker.html` in Chrome by double-clicking it.
2. In the console: `await SLP.store.saveStudent(SLP.model.student({name:'Test Kid'}))`
3. `await SLP.backup.pickBackupFile()` — pick a location, accept the dialog.
4. `await SLP.backup.writeToHandle()` — expect `'ok'`. Open the file; confirm `Test Kid`.
5. **Quit Chrome entirely**, reopen the file, and run `await SLP.backup.writeToHandle()`
   again. Expect `'ok'` **with no dialog** — this is the property the probe found and the
   whole ergonomic argument rests on it.
6. Note the result in the plan's task list. If step 5 prompts, the "one button, no dialog"
   claim is wrong and the UI in Task 11 must say "Back up (may ask permission)".

---

## Task 7: The `ui.shell` section — DOM helpers, tab router, and boot

Every later view plugs into this. It is small on purpose: three tabs, one render function,
no framework.

**Files:**
- Modify: `slp-tracker.html` (add `ui` scaffolding + boot; extend `<style>`)
- Create: `tests/shell.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.*`.
- Produces:
  - `SLP.ui.h(tag, attrs, ...children)` → `HTMLElement`. `attrs` supports `class`, `text`,
    `html`, `value`, `on:<event>` handlers, `data-*`, and any plain attribute.
  - `SLP.ui.clear(el)`, `SLP.ui.$(sel)`, `SLP.ui.$$(sel)`
  - `SLP.ui.route` → `{tab, date, studentId}` (current route, read-only)
  - `SLP.ui.go(patch)` → `Promise<void>` — merges into the route and re-renders
  - `SLP.ui.render()` → `Promise<void>` — re-renders the current route
  - `SLP.ui.views` → `{today, schedule, students}`, each `async (root) => void`
  - `SLP.ui.toast(msg, kind)` → shows a transient message; `kind` ∈ `info|ok|warn|error`
  - `SLP.ready` → `Promise` resolving after the first render (already referenced by the harness)
  - `SLP.ui.todayStr()` → `'YYYY-MM-DD'` in local time

- [ ] **Step 1: Write the failing tests**

Create `tests/shell.test.js`:

```js
test('the app boots into the Today tab', async () => {
  const w = await loadApp();
  eq(w.SLP.ui.route.tab, 'today', 'Today is where the work happens');
  const active = w.document.querySelector('.tab.active');
  eq(active.dataset.tab, 'today', 'and the Today tab is marked active');
});

test('the app boots to today’s date', async () => {
  const w = await loadApp();
  eq(w.SLP.ui.route.date, w.SLP.ui.todayStr(), 'defaults to today');
});

test('clicking a tab switches views', async () => {
  const w = await loadApp();
  w.document.querySelector('.tab[data-tab="schedule"]').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.tab, 'schedule', 'route updated');
  assert(w.document.querySelector('#view-schedule'), 'schedule view rendered');
  assert(!w.document.querySelector('#view-today'), 'today view torn down');
});

test('go() merges into the route without clobbering the rest', async () => {
  const w = await loadApp();
  await w.SLP.ui.go({ tab: 'students', studentId: 'abc' });
  await w.SLP.ui.go({ tab: 'today' });
  eq(w.SLP.ui.route.studentId, 'abc', 'unrelated route state is preserved');
});

test('h() builds elements with text, classes, and handlers', async () => {
  const w = await loadApp();
  let clicked = 0;
  const el = w.SLP.ui.h('button', { class: 'x y', text: 'Hi', 'data-k': '1',
                                    'on:click': () => clicked++ });
  eq(el.tagName, 'BUTTON', 'tag');
  eq(el.textContent, 'Hi', 'text');
  eq(el.className, 'x y', 'class');
  eq(el.dataset.k, '1', 'data attribute');
  el.click();
  eq(clicked, 1, 'handler wired');
});

test('h() escapes text rather than parsing it as HTML', async () => {
  const w = await loadApp();
  const el = w.SLP.ui.h('div', { text: '<img src=x onerror=alert(1)>' });
  eq(el.children.length, 0, 'pasted IEP text must never become markup');
  eq(el.textContent, '<img src=x onerror=alert(1)>', 'shown verbatim');
});

test('h() nests children', async () => {
  const w = await loadApp();
  const { h } = w.SLP.ui;
  const el = h('div', { class: 'p' }, h('span', { text: 'a' }), 'plain', h('b', { text: 'c' }));
  eq(el.textContent, 'aplainc', 'children in order');
});

test('todayStr is local-time, not UTC', async () => {
  const w = await loadApp();
  const d = new Date();
  const expected = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  eq(w.SLP.ui.todayStr(), expected, 'a date must never shift by timezone');
});

test('toast shows and names its kind', async () => {
  const w = await loadApp();
  w.SLP.ui.toast('saved', 'ok');
  const t = w.document.querySelector('.toast');
  assert(t, 'toast element present');
  eq(t.textContent, 'saved', 'message');
  assert(t.classList.contains('toast-ok'), 'kind applied');
});
```

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="shell.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `Cannot read properties of undefined (reading 'route')`.

- [ ] **Step 3: Add the shell styles**

In `slp-tracker.html`, append inside `<style>`:

```css
header.app-header {
  position: sticky; top: 0; z-index: 10; background: var(--bg);
  border-bottom: 1px solid var(--line); padding: 10px 0 0;
}
.app-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.tabs { display: flex; gap: 4px; }
.tab {
  appearance: none; border: 1px solid var(--line); border-bottom: none;
  background: var(--row); color: var(--muted); cursor: pointer;
  padding: 7px 16px; border-radius: 6px 6px 0 0; font: inherit;
}
.tab.active { background: var(--bg); color: var(--fg); font-weight: 600;
              box-shadow: inset 0 2px 0 var(--accent); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.view { padding-top: 18px; }
.muted { color: var(--muted); }
.empty { color: var(--muted); padding: 28px 0; }
.toast {
  position: fixed; right: 16px; bottom: 16px; z-index: 50;
  padding: 9px 14px; border-radius: 6px; border: 1px solid var(--line);
  background: var(--bg); box-shadow: 0 2px 10px rgba(0,0,0,.12);
}
.toast-ok { border-color: var(--ok); color: var(--ok); }
.toast-warn { border-color: var(--warn); color: var(--warn); }
.toast-error { border-color: var(--danger); color: var(--danger); }
button.primary {
  background: var(--accent); color: #fff; border: 1px solid var(--accent);
  border-radius: 6px; padding: 7px 14px; font: inherit; cursor: pointer;
}
button.plain {
  background: var(--bg); color: var(--fg); border: 1px solid var(--line);
  border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer;
}
input[type="text"], input[type="number"], input[type="time"], textarea, select {
  font: inherit; color: var(--fg); background: var(--field);
  border: 1px solid var(--line); border-radius: 5px; padding: 5px 7px;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 4: Implement the shell and boot**

Replace the placeholder `boot` section in `slp-tracker.html` with:

```js
// ============================================================
// SECTION: ui.shell — DOM helpers, tab router, boot.
// ============================================================
SLP.ui = (() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;                    // never innerHTML: her text is data
      else if (k === 'html') el.innerHTML = v;                 // only for app-authored markup
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on:')) el.addEventListener(k.slice(3), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const pad = n => String(n).padStart(2, '0');
  function todayStr(d = new Date()) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  const route = { tab: 'today', date: todayStr(), studentId: null };
  const views = {};                                 // filled in by later sections

  let toastTimer = null;
  function toast(msg, kind = 'info') {
    const old = $('.toast');
    if (old) old.remove();
    clearTimeout(toastTimer);
    const t = h('div', { class: 'toast toast-' + kind, text: msg, role: 'status' });
    document.body.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  const TABS = [
    ['today', 'Today'],
    ['students', 'Students'],
    ['schedule', 'Schedule'],
  ];

  async function render() {
    const app = $('#app');
    clear(app);
    app.appendChild(
      h('header', { class: 'app-header' },
        h('p', { class: 'app-title', text: 'SLP Session Tracker' }),
        h('nav', { class: 'tabs' },
          TABS.map(([id, label]) =>
            h('button', {
              class: 'tab' + (route.tab === id ? ' active' : ''),
              'data-tab': id, type: 'button',
              'on:click': () => go({ tab: id }),
            }, label)))));

    const root = h('div', { class: 'view', id: 'view-' + route.tab });
    app.appendChild(root);
    const view = views[route.tab];
    if (view) await view(root);
    else root.appendChild(h('p', { class: 'empty', text: 'Nothing here yet.' }));
  }

  async function go(patch) {
    Object.assign(route, patch);
    await render();
  }

  return { $, $$, clear, h, route, go, render, views, toast, todayStr };
})();

// ============================================================
// SECTION: boot — wire everything up.
// ============================================================
SLP.ready = (async () => {
  await SLP.db.open();
  await SLP.ui.render();
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all shell tests green. The `clicking a tab switches views` test passes
because no view is registered yet and the container id still changes.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/shell.test.js tests/index.html
git commit -m "feat: app shell, tab router, DOM helpers"
```

---

## Task 8: Schedule view — set it in September, forget it

She needs a caseload and a weekly grid before anything else is usable (spec §10 step 3).
The caseload editor lives here too, because a slot cannot be filled before students exist.

**Files:**
- Modify: `slp-tracker.html` (add `ui.schedule` before `boot`; extend `<style>`)
- Create: `tests/schedule.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.*`, `SLP.ui.h/go/toast`.
- Produces: `SLP.ui.views.schedule = async (root) => void`, rendering:
  - `#caseload-editor` — add a student (name, grade, school), list with an active toggle
  - `#week-grid` — Monday–Friday columns, one card per slot
  - `#slot-form` — day, start, end, location, student checkboxes
  - Slot cards carry `data-slot-id`; student checkboxes carry `data-student-id`

- [ ] **Step 1: Write the failing tests**

Create `tests/schedule.test.js`:

```js
async function openSchedule(w) {
  await w.SLP.ui.go({ tab: 'schedule' });
  return w.document;
}
function fill(doc, sel, value) {
  const el = doc.querySelector(sel);
  assert(el, 'no element for ' + sel);
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
  return el;
}

test('schedule view shows an empty state before anything exists', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  assert(doc.querySelector('#caseload-editor'), 'caseload editor present');
  assert(doc.querySelector('#week-grid'), 'week grid present');
  assert(/no students/i.test(doc.querySelector('#caseload-list').textContent),
         'says the caseload is empty');
});

test('adding a student puts them on the caseload', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', 'Ada Byron');
  fill(doc, '#new-student-grade', '3');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  assert(/Ada Byron/.test(doc.querySelector('#caseload-list').textContent), 'listed');
  eq((await w.SLP.store.listStudents({})).length, 1, 'and persisted');
});

test('adding a student with a blank name is refused', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', '   ');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).length, 0, 'nothing saved');
});

test('deactivating a student removes them from the caseload list but keeps the record', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const doc = await openSchedule(w);
  doc.querySelector('.student-row[data-student-name="Ada"] .toggle-active').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({ activeOnly: true })).length, 0, 'off the caseload');
  eq((await w.SLP.db.getAll('students')).length, 1, 'record survives');
});

test('creating a slot places it in the right day column', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openSchedule(w);

  fill(doc, '#slot-day', '2');            // Tuesday
  fill(doc, '#slot-start', '10:15');
  fill(doc, '#slot-end', '10:45');
  doc.querySelector('.slot-student[data-student-id="' + ada.id + '"]').click();
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();

  const tuesday = doc.querySelector('.day-column[data-day="2"]');
  assert(/10:15/.test(tuesday.textContent), 'slot lands on Tuesday');
  assert(/Ada/.test(tuesday.textContent), 'with its student');
  eq(doc.querySelectorAll('.day-column[data-day="1"] .slot-card').length, 0, 'Monday empty');
});

test('a slot with no students is refused', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#slot-day', '1');
  fill(doc, '#slot-start', '09:00');
  fill(doc, '#slot-end', '09:30');
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'a slot with nobody in it is not a session');
});

test('a slot ending before it starts is refused', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openSchedule(w);
  fill(doc, '#slot-day', '1');
  fill(doc, '#slot-start', '11:00');
  fill(doc, '#slot-end', '10:00');
  doc.querySelector('.slot-student[data-student-id="' + ada.id + '"]').click();
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'refused');
});

test('slots are listed in time order within a day', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveSlot(m.slot({ dayOfWeek: 1, startTime: '13:00', endTime: '13:30',
                                      studentIds: [ada.id] }));
  await w.SLP.store.saveSlot(m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                                      studentIds: [ada.id] }));
  const doc = await openSchedule(w);
  const times = Array.from(doc.querySelectorAll('.day-column[data-day="1"] .slot-time'))
    .map(el => el.textContent.trim());
  eq(times[0].startsWith('09:00'), true, 'earliest first, got: ' + times.join(', '));
});

test('deleting a slot removes it from the grid', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await w.SLP.store.saveSlot(slot);
  const doc = await openSchedule(w);
  doc.querySelector('.slot-card[data-slot-id="' + slot.id + '"] .delete-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'slot gone');
});

test('only active students are offered when building a slot', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const gone = m.student({ name: 'Moved Away' });
  gone.active = false;
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveStudent(gone);
  const doc = await openSchedule(w);
  const offered = Array.from(doc.querySelectorAll('.slot-student')).map(el => el.textContent);
  eq(offered.some(t => /Moved Away/.test(t)), false, 'inactive students are not scheduled');
});
```

Note the `delete-slot` test uses a direct click with **no `confirm()`** — per the harness
rules, browser dialogs freeze automation. Slot deletion is undo-able by re-adding and
destroys no session history (sessions snapshot their own roster), so it needs no
confirmation. Deleting *charted student data* does need one; that appears in Task 10 and
is implemented as an inline two-step control, never `window.confirm`.

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="schedule.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `no element for #caseload-editor`.

- [ ] **Step 3: Add schedule styles**

Append inside `<style>`:

```css
.panel { border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 22px; }
.panel h2 { font-size: 14px; margin: 0 0 10px; text-transform: uppercase;
            letter-spacing: .04em; color: var(--muted); }
.row-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.student-row { display: flex; gap: 10px; align-items: center; padding: 5px 0;
               border-bottom: 1px solid var(--line); }
.student-row:last-child { border-bottom: none; }
.student-row .grow { flex: 1; }
.week { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.day-column { border: 1px solid var(--line); border-radius: 8px; padding: 8px; min-height: 120px; }
.day-name { font-weight: 600; font-size: 13px; margin-bottom: 8px; }
.slot-card { border: 1px solid var(--line); border-radius: 6px; padding: 7px;
             margin-bottom: 7px; background: var(--row); }
.slot-time { font-weight: 600; font-size: 13px; }
.slot-roster { font-size: 13px; color: var(--muted); }
.slot-student { display: inline-flex; gap: 5px; align-items: center; margin-right: 10px; }
.linkish { background: none; border: none; color: var(--accent); cursor: pointer;
           font: inherit; padding: 0; text-decoration: underline; }
.danger-link { color: var(--danger); }
```

- [ ] **Step 4: Implement `ui.schedule`**

Insert before the `boot` section:

```js
// ============================================================
// SECTION: ui.schedule — caseload and the weekly template.
// The template is not history: editing it never rewrites a past session.
// ============================================================
(() => {
  const { h, go, toast } = SLP.ui;
  const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday']];

  const draft = { studentIds: new Set() };   // survives re-render within the tab

  async function caseloadPanel() {
    const students = await SLP.store.listStudents({});
    const active = students.filter(s => s.active);

    const list = h('div', { id: 'caseload-list' });
    if (!active.length) {
      list.appendChild(h('p', { class: 'muted', text: 'No students on the caseload yet.' }));
    }
    for (const s of active) {
      list.appendChild(
        h('div', { class: 'student-row', 'data-student-id': s.id, 'data-student-name': s.name },
          h('span', { class: 'grow', text: s.name + (s.grade ? ' · grade ' + s.grade : '') }),
          h('button', {
            class: 'linkish toggle-active', type: 'button', text: 'Remove from caseload',
            'on:click': async () => {
              await SLP.store.setStudentActive(s.id, false);
              toast(s.name + ' removed from the caseload. Their history is kept.', 'ok');
              await SLP.ui.render();
            },
          })));
    }
    const inactive = students.filter(s => !s.active);
    if (inactive.length) {
      list.appendChild(h('p', { class: 'muted', id: 'inactive-note',
        text: inactive.length + ' former student' + (inactive.length > 1 ? 's' : '') +
              ' kept for their history.' }));
    }

    const name = h('input', { type: 'text', id: 'new-student-name', placeholder: 'Student name' });
    const grade = h('input', { type: 'text', id: 'new-student-grade', placeholder: 'Grade',
                               style: 'width:70px' });
    const school = h('input', { type: 'text', id: 'new-student-school', placeholder: 'School' });

    return h('section', { class: 'panel', id: 'caseload-editor' },
      h('h2', { text: 'Caseload' }),
      list,
      h('div', { class: 'row-form', style: 'margin-top:10px' },
        name, grade, school,
        h('button', {
          class: 'primary', id: 'add-student', type: 'button', text: 'Add student',
          'on:click': async () => {
            if (!name.value.trim()) { toast('A student needs a name.', 'warn'); return; }
            await SLP.store.saveStudent(SLP.model.student({
              name: name.value.trim(), grade: grade.value.trim(), school: school.value.trim(),
            }));
            await SLP.ui.render();
          },
        })));
  }

  async function slotForm(students) {
    const day = h('select', { id: 'slot-day' },
      DAYS.map(([v, label]) => h('option', { value: v, text: label })));
    const start = h('input', { type: 'time', id: 'slot-start', value: '09:00' });
    const end = h('input', { type: 'time', id: 'slot-end', value: '09:30' });
    const location = h('input', { type: 'text', id: 'slot-location', placeholder: 'Room (optional)' });

    const picker = h('div', { id: 'slot-students', style: 'margin:10px 0' },
      students.length
        ? students.map(s => {
            const box = h('input', { type: 'checkbox', 'data-student-id': s.id });
            box.checked = draft.studentIds.has(s.id);
            box.addEventListener('change', () => {
              box.checked ? draft.studentIds.add(s.id) : draft.studentIds.delete(s.id);
            });
            return h('label', { class: 'slot-student', 'data-student-id': s.id }, box, s.name);
          })
        : h('span', { class: 'muted', text: 'Add students above first.' }));

    return h('section', { class: 'panel', id: 'slot-form' },
      h('h2', { text: 'Add a recurring slot' }),
      h('div', { class: 'row-form' }, day, start, 'to', end, location),
      picker,
      h('button', {
        class: 'primary', id: 'add-slot', type: 'button', text: 'Add slot',
        'on:click': async () => {
          const ids = [...draft.studentIds];
          if (!ids.length) { toast('Put at least one student in the slot.', 'warn'); return; }
          if (!start.value || !end.value) { toast('A slot needs a start and end time.', 'warn'); return; }
          if (end.value <= start.value) { toast('The end time must be after the start.', 'warn'); return; }
          await SLP.store.saveSlot(SLP.model.slot({
            dayOfWeek: Number(day.value), startTime: start.value, endTime: end.value,
            studentIds: ids, location: location.value.trim(),
          }));
          draft.studentIds.clear();
          await SLP.ui.render();
        },
      }));
  }

  async function weekGrid(students) {
    const byId = Object.fromEntries(students.map(s => [s.id, s]));
    const slots = await SLP.store.listSlots();
    return h('section', { class: 'panel', id: 'week-grid' },
      h('h2', { text: 'Weekly schedule' }),
      h('div', { class: 'week' },
        DAYS.map(([dow, label]) =>
          h('div', { class: 'day-column', 'data-day': dow },
            h('div', { class: 'day-name', text: label }),
            slots.filter(s => s.dayOfWeek === dow).map(slot =>
              h('div', { class: 'slot-card', 'data-slot-id': slot.id },
                h('div', { class: 'slot-time',
                           text: slot.startTime + '–' + slot.endTime +
                                 (slot.location ? ' · ' + slot.location : '') }),
                h('div', { class: 'slot-roster',
                           text: slot.studentIds.map(id => byId[id] && byId[id].name)
                                   .filter(Boolean).join(', ') || '(no students)' }),
                h('button', {
                  class: 'linkish danger-link delete-slot', type: 'button', text: 'Delete',
                  'on:click': async () => {
                    await SLP.store.deleteSlot(slot.id);
                    toast('Slot deleted. Sessions already charted are untouched.', 'ok');
                    await SLP.ui.render();
                  },
                })))))));
  }

  SLP.ui.views.schedule = async (root) => {
    const students = await SLP.store.listStudents({ activeOnly: true });
    root.appendChild(await caseloadPanel());
    root.appendChild(await weekGrid(await SLP.store.listStudents({})));
    root.appendChild(await slotForm(students));
  };
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all schedule tests green.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/schedule.test.js tests/index.html
git commit -m "feat: schedule view with caseload editor and weekly grid"
```

---

## Task 9: Students view — goals, objectives, and field definitions

Spec §10 step 4. This is where she pastes IEP text once, and where the field system is
configured. Aggregation (history and charts) is added to this same view in Task 12; keep
the render function structured so that section can slot in without a rewrite.

**Files:**
- Modify: `slp-tracker.html` (add `ui.students` before `boot`; extend `<style>`)
- Create: `tests/students.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.*`, `SLP.model.*`, `SLP.ui.*`.
- Produces:
  - `SLP.ui.views.students = async (root) => void`
  - Renders `#student-search`, `#student-list` (rows with `data-student-id`), and when
    `route.studentId` is set, `#student-detail` containing `.goal-block[data-goal-id]`,
    `.objective-block[data-objective-id]`, and `.field-row[data-field-id]`.
  - `SLP.ui.students.fieldEditor(objective, onChange)` → element (exported for reuse in
    Task 10's "add ad hoc objective" path; keep it a named function, not an inline closure).

- [ ] **Step 1: Write the failing tests for goals and objectives**

Create `tests/students.test.js`:

```js
async function openStudents(w, studentId = null) {
  await w.SLP.ui.go({ tab: 'students', studentId });
  return w.document;
}
function setInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

test('students view lists the caseload', async () => {
  const w = await loadApp();
  for (const n of ['Zoe', 'Ada']) await w.SLP.store.saveStudent(w.SLP.model.student({ name: n }));
  const doc = await openStudents(w);
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada', 'Zoe'], 'alphabetical');
});

test('search filters the caseload', async () => {
  const w = await loadApp();
  for (const n of ['Ada', 'Bo', 'Cy']) await w.SLP.store.saveStudent(w.SLP.model.student({ name: n }));
  const doc = await openStudents(w);
  setInput(doc.querySelector('#student-search'), 'b');
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Bo'], 'case-insensitive substring match');
});

test('selecting a student opens their detail', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openStudents(w);
  doc.querySelector('.student-row[data-student-id="' + ada.id + '"] .open-student').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.studentId, ada.id, 'route carries the selection');
  assert(doc.querySelector('#student-detail'), 'detail rendered');
});

test('pasting a goal saves it verbatim', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openStudents(w, ada.id);
  const GOAL = 'By 05/2027, STUDENT will identify common objects when described, ' +
               'in 3 out of 4 trials across three consecutive sessions.';
  setInput(doc.querySelector('#new-goal-text'), GOAL);
  doc.querySelector('#add-goal').click();
  await w.SLP.ui.render();
  const goals = await w.SLP.store.goalsFor(ada.id);
  eq(goals.length, 1, 'goal saved');
  eq(goals[0].text, GOAL, 'stored exactly as pasted, placeholder and all');
});

test('goal text displays with STUDENT substituted', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveGoal(m.goal({ studentId: ada.id, text: 'STUDENT will improve' }));
  const doc = await openStudents(w, ada.id);
  const shown = doc.querySelector('.goal-block .goal-text').textContent;
  eq(shown.includes('Ada will improve'), true, 'name substituted for display');
  eq(shown.includes('STUDENT'), false, 'placeholder never shown to her');
});

test('a blank goal is refused', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openStudents(w, ada.id);
  setInput(doc.querySelector('#new-goal-text'), '  ');
  doc.querySelector('#add-goal').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.goalsFor(ada.id)).length, 0, 'nothing saved');
});

test('editing goal text in place persists', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'original' });
  await w.SLP.store.saveGoal(goal);
  const doc = await openStudents(w, ada.id);
  const box = doc.querySelector('.goal-block[data-goal-id="' + goal.id + '"] .goal-edit');
  setInput(box, 'revised text');
  box.dispatchEvent(new w.Event('blur', { bubbles: true }));
  await w.SLP.ui.render();
  eq((await w.SLP.store.goalsFor(ada.id))[0].text, 'revised text', 'saved on blur');
});

test('a new objective starts with the trials preset', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await w.SLP.store.saveGoal(goal);
  const doc = await openStudents(w, ada.id);
  setInput(doc.querySelector('.goal-block[data-goal-id="' + goal.id + '"] .new-objective-text'),
           'STUDENT will name 4 objects');
  doc.querySelector('.goal-block[data-goal-id="' + goal.id + '"] .add-objective').click();
  await w.SLP.ui.render();
  const objs = await w.SLP.store.objectivesFor(goal.id);
  eq(objs.length, 1, 'objective saved');
  eq(objs[0].fields.map(f => f.label),
     ['Trials completed', 'Trials # goal', 'Notes'], 'default preset applied');
  eq(objs[0].fields.find(f => f.role === 'target').default, 4, 'target default of 4');
});
```

- [ ] **Step 2: Write the failing tests for the field editor**

Append to `tests/students.test.js`:

```js
async function seedObjective(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will name objects' });
  await st.saveObjective(obj);
  return { ada, goal, obj };
}
const objSel = obj => '.objective-block[data-objective-id="' + obj.id + '"]';

test('the field editor lists an objective’s fields with their types', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const doc = await openStudents(w, ada.id);
  const rows = Array.from(doc.querySelectorAll(objSel(obj) + ' .field-row'));
  eq(rows.length, 3, 'three fields from the preset');
  eq(rows.map(r => r.querySelector('.field-type').value),
     ['number', 'number', 'text'], 'types shown');
});

test('the type selector offers exactly two types', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const doc = await openStudents(w, ada.id);
  const opts = Array.from(doc.querySelectorAll(objSel(obj) + ' .field-type option'))
    .map(o => o.value);
  eq(opts, ['number', 'text'], 'exactly two field types — resist a third');
});

test('renaming a field persists and keeps its id', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const fieldId = obj.fields[0].id;
  const doc = await openStudents(w, ada.id);
  const input = doc.querySelector(objSel(obj) + ' .field-row[data-field-id="' + fieldId +
                                  '"] .field-label');
  setInput(input, 'Correct responses');
  input.dispatchEvent(new w.Event('blur', { bubbles: true }));
  await w.SLP.ui.render();
  const saved = (await w.SLP.store.objectivesFor(obj.goalId))[0];
  eq(saved.fields[0].label, 'Correct responses', 'renamed');
  eq(saved.fields[0].id, fieldId,
     'the id must survive a rename or every past datapoint orphans its value');
});

test('changing a number field default persists', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const target = obj.fields.find(f => f.role === 'target');
  const doc = await openStudents(w, ada.id);
  const input = doc.querySelector(objSel(obj) + ' .field-row[data-field-id="' + target.id +
                                  '"] .field-default');
  setInput(input, '5');
  input.dispatchEvent(new w.Event('blur', { bubbles: true }));
  await w.SLP.ui.render();
  eq((await w.SLP.store.objectivesFor(obj.goalId))[0].fields.find(f => f.role === 'target').default,
     5, 'default updated');
});

test('a text field offers no default input', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const notes = obj.fields.find(f => f.type === 'text');
  const doc = await openStudents(w, ada.id);
  const row = doc.querySelector(objSel(obj) + ' .field-row[data-field-id="' + notes.id + '"]');
  eq(row.querySelector('.field-default'), null, 'text fields have no default');
});

test('adding a custom field appends it with no role', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const doc = await openStudents(w, ada.id);
  setInput(doc.querySelector(objSel(obj) + ' .new-field-label'), 'Prompts given');
  doc.querySelector(objSel(obj) + ' .add-field').click();
  await w.SLP.ui.render();
  const saved = (await w.SLP.store.objectivesFor(obj.goalId))[0];
  eq(saved.fields.length, 4, 'field appended');
  eq(saved.fields[3].label, 'Prompts given', 'with her label');
  eq(saved.fields[3].role, null, 'custom fields carry no preset semantics');
});

test('removing a field removes it from the objective', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const notes = obj.fields.find(f => f.type === 'text');
  const doc = await openStudents(w, ada.id);
  doc.querySelector(objSel(obj) + ' .field-row[data-field-id="' + notes.id + '"] .remove-field')
     .click();
  await w.SLP.ui.render();
  const saved = (await w.SLP.store.objectivesFor(obj.goalId))[0];
  eq(saved.fields.length, 2, 'field removed');
  assert(!saved.fields.some(f => f.id === notes.id), 'the right one');
});

test('deleting an objective removes it', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const doc = await openStudents(w, ada.id);
  doc.querySelector(objSel(obj) + ' .delete-objective').click();   // arms the confirm
  await w.SLP.ui.render();
  doc.querySelector(objSel(obj) + ' .confirm-delete-objective').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.objectivesFor(obj.goalId)).length, 0, 'objective deleted');
});

test('objective deletion needs the second click', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedObjective(w);
  const doc = await openStudents(w, ada.id);
  doc.querySelector(objSel(obj) + ' .delete-objective').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.objectivesFor(obj.goalId)).length, 1,
     'one click only arms it — this destroys collected data');
});
```

- [ ] **Step 3: Register the suite and run to verify failure**

Add `<script src="students.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `#student-list` not found.

- [ ] **Step 4: Add students-view styles**

Append inside `<style>`:

```css
.split { display: grid; grid-template-columns: 250px 1fr; gap: 20px; align-items: start; }
.goal-block { border: 1px solid var(--line); border-radius: 8px; padding: 12px;
              margin-bottom: 16px; }
.goal-text { font-size: 14px; margin: 0 0 8px; }
.goal-edit { width: 100%; min-height: 62px; resize: vertical; }
.objective-block { border-left: 3px solid var(--accent); padding: 8px 0 8px 12px;
                   margin: 12px 0 12px 6px; }
.objective-text { font-size: 14px; margin: 0 0 8px; }
.field-row { display: flex; gap: 8px; align-items: center; padding: 3px 0; }
.field-label { flex: 1; min-width: 120px; }
.field-default { width: 70px; }
.field-role { font-size: 12px; color: var(--muted); min-width: 62px; }
.clamp { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
         overflow: hidden; cursor: pointer; }
.clamp.open { -webkit-line-clamp: unset; }
```

- [ ] **Step 5: Implement `ui.students`**

Insert before the `boot` section:

```js
// ============================================================
// SECTION: ui.students — goals, objectives, field definitions.
// Task 12 adds history and charts to renderDetail().
// ============================================================
(() => {
  const { h, toast } = SLP.ui;
  const m = SLP.model;
  const ui = { search: '', armedDelete: null };

  // Exported: Task 10 reuses this for ad hoc objective tweaks.
  function fieldEditor(objective, onChange) {
    const wrap = h('div', { class: 'field-editor' });

    for (const f of objective.fields) {
      const label = h('input', { type: 'text', class: 'field-label', value: f.label });
      label.addEventListener('blur', async () => {
        const v = label.value.trim();
        if (!v || v === f.label) return;
        f.label = v;                       // id is untouched: past datapoints keep their values
        await onChange();
      });

      const type = h('select', { class: 'field-type' },
        h('option', { value: 'number', text: 'number' }),
        h('option', { value: 'text', text: 'text' }));
      type.value = f.type;
      type.addEventListener('change', async () => {
        f.type = type.value;
        if (f.type === 'text') { f.default = null; f.role = null; }
        await onChange();
      });

      const row = h('div', { class: 'field-row', 'data-field-id': f.id }, label, type);

      if (f.type === 'number') {
        const def = h('input', { type: 'number', class: 'field-default',
                                 placeholder: 'default',
                                 value: f.default === null || f.default === undefined ? '' : f.default });
        def.addEventListener('blur', async () => {
          const raw = def.value.trim();
          const next = raw === '' ? null : Number(raw);
          if (raw !== '' && !Number.isFinite(next)) { def.value = f.default ?? ''; return; }
          if (next === f.default) return;
          f.default = next;
          await onChange();
        });
        row.appendChild(def);
      }
      if (f.role) row.appendChild(h('span', { class: 'field-role', text: f.role }));

      row.appendChild(h('button', {
        class: 'linkish danger-link remove-field', type: 'button', text: 'remove',
        'on:click': async () => {
          objective.fields = objective.fields.filter(x => x.id !== f.id);
          await onChange();
        },
      }));
      wrap.appendChild(row);
    }

    const newLabel = h('input', { type: 'text', class: 'new-field-label',
                                  placeholder: 'New field name' });
    const newType = h('select', { class: 'new-field-type' },
      h('option', { value: 'number', text: 'number' }),
      h('option', { value: 'text', text: 'text' }));
    wrap.appendChild(h('div', { class: 'row-form', style: 'margin-top:6px' },
      newLabel, newType,
      h('button', {
        class: 'plain add-field', type: 'button', text: 'Add field',
        'on:click': async () => {
          const label = newLabel.value.trim();
          if (!label) { toast('A field needs a name.', 'warn'); return; }
          objective.fields.push(m.field({ label, type: newType.value }));
          await onChange();
        },
      })));
    return wrap;
  }

  function objectiveBlock(student, objective, refresh) {
    const save = async () => { await SLP.store.saveObjective(objective); await refresh(); };
    const armed = ui.armedDelete === objective.id;

    const text = h('textarea', { class: 'goal-edit objective-edit', value: objective.text });
    text.addEventListener('blur', async () => {
      const v = text.value.trim();
      if (!v || v === objective.text) return;
      objective.text = v;
      await save();
    });

    return h('div', { class: 'objective-block', 'data-objective-id': objective.id },
      h('p', { class: 'objective-text',
               text: m.displayText(objective.text, student.name) }),
      text,
      fieldEditor(objective, save),
      armed
        ? h('div', { class: 'row-form', style: 'margin-top:6px' },
            h('span', { class: 'muted',
                        text: 'Delete this objective and everything charted against it?' }),
            h('button', {
              class: 'plain danger-link confirm-delete-objective', type: 'button',
              text: 'Yes, delete',
              'on:click': async () => {
                await SLP.store.deleteObjective(objective.id);
                ui.armedDelete = null;
                toast('Objective deleted.', 'ok');
                await refresh();
              },
            }),
            h('button', {
              class: 'plain cancel-delete-objective', type: 'button', text: 'Keep it',
              'on:click': async () => { ui.armedDelete = null; await refresh(); },
            }))
        : h('button', {
            class: 'linkish danger-link delete-objective', type: 'button', text: 'Delete objective',
            'on:click': async () => { ui.armedDelete = objective.id; await refresh(); },
          }));
  }

  function goalBlock(student, goal, objectives, refresh) {
    const edit = h('textarea', { class: 'goal-edit', value: goal.text });
    edit.addEventListener('blur', async () => {
      const v = edit.value.trim();
      if (!v || v === goal.text) return;
      goal.text = v;
      await SLP.store.saveGoal(goal);
      await refresh();
    });

    const newObj = h('textarea', { class: 'goal-edit new-objective-text',
                                   placeholder: 'Paste the objective text…' });

    return h('section', { class: 'goal-block', 'data-goal-id': goal.id },
      h('p', { class: 'goal-text clamp', text: m.displayText(goal.text, student.name),
               'on:click': e => e.currentTarget.classList.toggle('open') }),
      edit,
      objectives.map(o => objectiveBlock(student, o, refresh)),
      h('div', { style: 'margin-top:10px' },
        newObj,
        h('button', {
          class: 'plain add-objective', type: 'button', text: 'Add objective',
          'on:click': async () => {
            const t = newObj.value.trim();
            if (!t) { toast('Paste the objective text first.', 'warn'); return; }
            await SLP.store.saveObjective(m.objective({
              goalId: goal.id, text: t, order: objectives.length,
            }));
            await refresh();
          },
        })));
  }

  async function renderDetail(container, student) {
    const refresh = () => SLP.ui.render();
    const detail = h('div', { id: 'student-detail' },
      h('h2', { text: student.name + (student.grade ? ' · grade ' + student.grade : '') }));

    const blocks = await SLP.store.objectivesForStudent(student.id);
    if (!blocks.length) {
      detail.appendChild(h('p', { class: 'muted',
        text: 'No goals yet. Paste the IEP goal below — you only do this once.' }));
    }
    for (const { goal, objectives } of blocks) {
      detail.appendChild(goalBlock(student, goal, objectives, refresh));
    }

    const newGoal = h('textarea', { class: 'goal-edit', id: 'new-goal-text',
                                    placeholder: 'Paste the IEP goal text…' });
    detail.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Add a goal' }),
      newGoal,
      h('button', {
        class: 'primary', id: 'add-goal', type: 'button', text: 'Add goal',
        'on:click': async () => {
          const t = newGoal.value.trim();
          if (!t) { toast('Paste the goal text first.', 'warn'); return; }
          await SLP.store.saveGoal(m.goal({ studentId: student.id, text: t,
                                            order: blocks.length }));
          await refresh();
        },
      })));

    // Task 12 appends the history and progress sections here.
    if (SLP.ui.students.renderAggregation) {
      await SLP.ui.students.renderAggregation(detail, student);
    }
    container.appendChild(detail);
  }

  SLP.ui.views.students = async (root) => {
    const students = await SLP.store.listStudents({ activeOnly: true });
    const q = ui.search.trim().toLowerCase();
    const shown = q ? students.filter(s => s.name.toLowerCase().includes(q)) : students;

    const search = h('input', { type: 'text', id: 'student-search', placeholder: 'Search…',
                                value: ui.search });
    search.addEventListener('input', async () => { ui.search = search.value; await SLP.ui.render(); });

    const list = h('div', { id: 'student-list' },
      shown.length ? null : h('p', { class: 'muted', text: 'No matching students.' }),
      shown.map(s =>
        h('div', { class: 'student-row', 'data-student-id': s.id, 'data-student-name': s.name },
          h('button', {
            class: 'linkish open-student grow', type: 'button', text: s.name,
            'on:click': () => SLP.ui.go({ studentId: s.id }),
          }))));

    const detail = h('div');
    const selected = shown.find(s => s.id === SLP.ui.route.studentId) ||
                     students.find(s => s.id === SLP.ui.route.studentId);
    if (selected) await renderDetail(detail, selected);
    else detail.appendChild(h('p', { class: 'empty', text: 'Pick a student to see their goals.' }));

    root.appendChild(h('div', { class: 'split' },
      h('div', {}, search, list),
      detail));
  };

  SLP.ui.students = { fieldEditor };
})();
```

Note: keep the `search` input's focus behaviour in mind — re-rendering on every keystroke
blurs it. If the manual check in Task 14 finds typing in the search box drops focus after
one character, change the `input` handler to filter the list in place rather than calling
`SLP.ui.render()`. The tests above pass either way.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all students tests green.

- [ ] **Step 7: Commit**

```bash
git add slp-tracker.html tests/students.test.js tests/index.html
git commit -m "feat: students view with goals, objectives, and the two-type field editor"
```

---

## Task 10: Today view, part 1 — the transcription grid

Spec §10 step 5, the heart of the app. This task builds the render: date navigation, slots
expanded by default, student → goal → objective rows, and the layout discipline that keeps
60 words of IEP boilerplate from burying the input boxes. Entry, autosave, and absence come
in Task 11.

**Remember what this screen is:** she is not at a computer during a session. She is
transcribing a stack of paper afterwards. Every decision here serves *tab-through speed
for a whole day*, not per-session polish.

**Files:**
- Modify: `slp-tracker.html` (add `ui.today` before `boot`; extend `<style>`)
- Create: `tests/today-render.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.planForDate`, `SLP.derive.*`, `SLP.model.displayText`, `SLP.ui.*`.
- Produces:
  - `SLP.ui.views.today = async (root) => void`
  - `SLP.ui.today.shiftDate(dateStr, days)` → `'YYYY-MM-DD'` (local-time arithmetic)
  - DOM contract used by Task 11's tests:
    `#date-label`, `#prev-day`, `#next-day`, `#jump-today`, `#charted-count`,
    `.slot-section[data-slot-id]`, `.student-block[data-student-id]`,
    `.objective-row[data-objective-id]`, `.value-input[data-field-id]`,
    `.note-input`, `.absent-toggle`, `.state-chip`

- [ ] **Step 1: Write the failing tests**

Create `tests/today-render.test.js`:

```js
const MON = '2026-09-07';   // a Monday

async function seedDay(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id,
    text: 'By 05/2027, STUDENT will demonstrate improved receptive language skills, ' +
          'as measured by data collection, in 3 out of 4 trials across three sessions.' });
  await st.saveGoal(goal);
  const o1 = m.objective({ goalId: goal.id, text: 'STUDENT will identify common objects when described' });
  const o2 = m.objective({ goalId: goal.id, text: 'STUDENT will follow two-step directions' });
  await st.saveObjective(o1); await st.saveObjective(o2);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, bo, goal, o1, o2, slot };
}
async function openDay(w, date = MON) {
  await w.SLP.ui.go({ tab: 'today', date });
  return w.document;
}

test('today view shows the date and its slots', async () => {
  const w = await loadApp();
  const { slot } = await seedDay(w);
  const doc = await openDay(w);
  assert(/Monday/.test(doc.querySelector('#date-label').textContent), 'day name shown');
  assert(/September 7, 2026/.test(doc.querySelector('#date-label').textContent), 'date shown');
  const section = doc.querySelector('.slot-section[data-slot-id="' + slot.id + '"]');
  assert(section, 'slot rendered');
  assert(/09:00/.test(section.textContent), 'slot time shown');
  assert(/Room 4/.test(section.textContent), 'location shown');
});

test('slots are expanded by default', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w);
  assert(doc.querySelector('.student-block'),
         'she is filling all of them in, not hunting for one');
});

test('every student in the slot gets a block, alphabetically', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w);
  eq(Array.from(doc.querySelectorAll('.student-block')).map(b => b.dataset.studentName),
     ['Ada', 'Bo'], 'both students');
});

test('a student’s objectives each get a row with their fields', async () => {
  const w = await loadApp();
  const { ada, o1 } = await seedDay(w);
  const doc = await openDay(w);
  const block = doc.querySelector('.student-block[data-student-id="' + ada.id + '"]');
  eq(block.querySelectorAll('.objective-row').length, 2, 'two objectives');
  const row = block.querySelector('.objective-row[data-objective-id="' + o1.id + '"]');
  eq(row.querySelectorAll('.value-input').length, 3, 'three fields from the preset');
});

test('the target field is pre-filled from its default', async () => {
  const w = await loadApp();
  const { ada, o1 } = await seedDay(w);
  const doc = await openDay(w);
  const targetId = o1.fields.find(f => f.role === 'target').id;
  const input = doc.querySelector('.student-block[data-student-id="' + ada.id + '"] ' +
    '.objective-row[data-objective-id="' + o1.id + '"] .value-input[data-field-id="' + targetId + '"]');
  eq(input.value, '4', 'pre-filled for speed');
  eq(input.dataset.entered, 'false', 'but flagged as not an observation');
});

test('the goal is shown once per student, not once per objective', async () => {
  const w = await loadApp();
  const { ada } = await seedDay(w);
  const doc = await openDay(w);
  const block = doc.querySelector('.student-block[data-student-id="' + ada.id + '"]');
  eq(block.querySelectorAll('.goal-line').length, 1, 'one goal line for two objectives');
});

test('goal and objective text is substituted and clamped to one line', async () => {
  const w = await loadApp();
  const { ada } = await seedDay(w);
  const doc = await openDay(w);
  const block = doc.querySelector('.student-block[data-student-id="' + ada.id + '"]');
  const goalLine = block.querySelector('.goal-line');
  assert(/Ada will demonstrate/.test(goalLine.textContent), 'STUDENT substituted');
  assert(goalLine.classList.contains('clamp'), 'truncated by default');
  goalLine.click();
  assert(goalLine.classList.contains('open'), 'expands on click');
});

test('a student with no objectives still gets a note box', async () => {
  const w = await loadApp();
  const { bo } = await seedDay(w);
  const doc = await openDay(w);
  const block = doc.querySelector('.student-block[data-student-id="' + bo.id + '"]');
  eq(block.querySelectorAll('.objective-row').length, 0, 'no objectives');
  assert(block.querySelector('.note-input'), 'she still needs somewhere to write');
});

test('prev and next move one day', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w);
  doc.querySelector('#next-day').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.date, '2026-09-08', 'forward one day');
  doc.querySelector('#prev-day').click();
  await w.SLP.ui.render();
  doc.querySelector('#prev-day').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.date, '2026-09-06', 'back one day');
});

test('jump-to-today returns to today', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w, '2026-01-01');
  doc.querySelector('#jump-today').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.date, w.SLP.ui.todayStr(), 'back to today');
});

test('date arithmetic crosses a month boundary without shifting by timezone', async () => {
  const w = await loadApp();
  eq(w.SLP.ui.today.shiftDate('2026-08-31', 1), '2026-09-01', 'forward over month end');
  eq(w.SLP.ui.today.shiftDate('2026-09-01', -1), '2026-08-31', 'backward over month start');
  eq(w.SLP.ui.today.shiftDate('2026-12-31', 1), '2027-01-01', 'across a year');
  eq(w.SLP.ui.today.shiftDate('2028-02-28', 1), '2028-02-29', 'leap day');
});

test('a day with nothing scheduled says so', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w, '2026-09-08');   // Tuesday
  assert(/nothing scheduled/i.test(doc.querySelector('#view-today').textContent),
         'empty day is explicit, not blank');
});

test('the charted counter starts at zero of the day’s students', async () => {
  const w = await loadApp();
  await seedDay(w);
  const doc = await openDay(w);
  eq(doc.querySelector('#charted-count').textContent.trim(), '0 of 2 charted',
     'she can see what she still owes');
});

test('every student starts in the not-yet-charted state', async () => {
  const w = await loadApp();
  const { ada } = await seedDay(w);
  const doc = await openDay(w);
  const chip = doc.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip');
  eq(chip.dataset.state, 'none', 'a visible third state');
  assert(/not charted/i.test(chip.textContent), 'and it says so');
});

test('browsing the day materialized nothing', async () => {
  const w = await loadApp();
  await seedDay(w);
  await openDay(w);
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'reading is not writing');
});
```

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="today-render.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `#date-label` not found.

- [ ] **Step 3: Add Today-view styles**

Append inside `<style>`. The fixed input column is the layout rule that matters: her
tab-through rhythm must be identical for every student regardless of goal-text length.

```css
.day-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
.day-bar .grow { flex: 1; }
#date-label { font-size: 17px; font-weight: 600; }
#charted-count { color: var(--muted); font-variant-numeric: tabular-nums; }
.slot-section { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; }
.slot-head { display: flex; gap: 10px; align-items: center; padding: 9px 12px;
             background: var(--row); border-bottom: 1px solid var(--line);
             border-radius: 8px 8px 0 0; font-weight: 600; }
.student-block { padding: 11px 12px; border-bottom: 1px solid var(--line); }
.student-block:last-child { border-bottom: none; }
.student-block.is-absent .objective-row { opacity: .4; }
.student-head { display: flex; gap: 9px; align-items: baseline; }
.student-name { font-weight: 600; }
.state-chip { font-size: 12px; padding: 1px 8px; border-radius: 999px;
              border: 1px solid var(--line); color: var(--muted); }
.state-chip[data-state="present"] { color: var(--ok); border-color: var(--ok); }
.state-chip[data-state="absent"] { color: var(--danger); border-color: var(--danger); }
.added-chip { font-size: 12px; padding: 1px 8px; border-radius: 999px;
              border: 1px solid var(--accent); color: var(--accent); }
.goal-line { font-size: 13px; color: var(--muted); margin: 5px 0 8px; }

/* The layout rule from spec §5: text never pushes the inputs out of column. */
.objective-row { display: grid; grid-template-columns: minmax(0, 1fr) 340px;
                 gap: 14px; align-items: start; padding: 5px 0; }
.objective-label { font-size: 13px; min-width: 0; }
.objective-inputs { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.value-field { display: flex; flex-direction: column; gap: 2px; }
.value-field .cap { font-size: 11px; color: var(--muted); }
.value-input[data-type="number"] { width: 66px; }
.value-input[data-type="text"] { width: 210px; }
.value-input[data-entered="false"] { color: var(--muted); font-style: italic; }
.ratio { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.note-input { width: 100%; min-height: 42px; margin-top: 6px; resize: vertical; }
@media (max-width: 820px) { .objective-row { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Implement `ui.today` render**

Insert before the `boot` section. The `if (SLP.ui.today.wireX)` guards are where Task 11
attaches behaviour; leave them exactly as written, so this task renders and passes its
tests on its own.

```js
// ============================================================
// SECTION: ui.today — the transcription grid.
// She is NOT at a computer during a session. This is batch back-fill
// from paper: optimise for tab-through speed across a whole day.
// ============================================================
(() => {
  const { h } = SLP.ui;
  const m = SLP.model;

  const pad = n => String(n).padStart(2, '0');
  const parse = s => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d); };
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function shiftDate(dateStr, days) {
    const d = parse(dateStr);
    d.setDate(d.getDate() + days);          // handles months, years, and leap days
    return fmt(d);
  }

  const LONG = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const longDate = dateStr => parse(dateStr).toLocaleDateString(undefined, LONG);

  function valueField(entry, student, objective, field, dp) {
    const cell = dp.values[field.id] || { value: field.type === 'number' ? field.default : '', entered: false };
    const input = h('input', {
      class: 'value-input',
      type: field.type === 'number' ? 'number' : 'text',
      'data-field-id': field.id,
      'data-type': field.type,
      'data-entered': String(!!cell.entered),
      'aria-label': m.displayText(objective.text, student.name) + ' — ' + field.label,
      value: cell.value === null || cell.value === undefined ? '' : cell.value,
    });
    // Task 11 wires autosave here.
    if (SLP.ui.today.wireValueInput) {
      SLP.ui.today.wireValueInput(input, { entry, student, objective, field });
    }
    return h('label', { class: 'value-field' },
      h('span', { class: 'cap', text: field.label }), input);
  }

  function objectiveRow(entry, student, objective) {
    const dp = ((entry.datapoints[student.id] || {})[objective.id]) ||
               m.datapoint({ sessionId: 'pending', studentId: student.id, objective });
    const r = m.ratio(objective, dp);
    return h('div', { class: 'objective-row', 'data-objective-id': objective.id },
      h('div', { class: 'objective-label clamp',
                 text: m.displayText(objective.text, student.name),
                 'on:click': e => e.currentTarget.classList.toggle('open') }),
      h('div', { class: 'objective-inputs' },
        objective.fields.map(f => valueField(entry, student, objective, f, dp)),
        h('span', { class: 'ratio', text: r ? r.achieved + ' / ' + r.target + ' · ' + r.pct + '%' : '' })));
  }

  async function studentBlock(entry, student) {
    const state = SLP.derive.studentState(entry, student.id);
    const att = entry.attendance[student.id];
    const blocks = entry.objectives[student.id] || [];
    const note = entry.notes[student.id];

    const chip = h('span', { class: 'state-chip', 'data-state': state,
      text: state === 'none' ? 'not charted'
          : state === 'present' ? 'present' : state });

    const absentBtn = h('button', {
      class: 'linkish absent-toggle', type: 'button',
      text: state === 'absent' ? 'Mark present' : 'Absent',
      'aria-pressed': String(state === 'absent'),
    });
    if (SLP.ui.today.wireAbsent) SLP.ui.today.wireAbsent(absentBtn, { entry, student, state });

    const noteBox = h('textarea', { class: 'note-input',
      placeholder: 'Session note…', value: note ? note.text : '',
      'aria-label': 'Session note for ' + student.name });
    if (SLP.ui.today.wireNote) SLP.ui.today.wireNote(noteBox, { entry, student });

    const block = h('div', {
      class: 'student-block' + (state === 'absent' ? ' is-absent' : ''),
      'data-student-id': student.id, 'data-student-name': student.name,
    },
      h('div', { class: 'student-head' },
        h('span', { class: 'student-name', text: student.name }),
        chip,
        att && att.participation === 'added' ? h('span', { class: 'added-chip', text: 'added' }) : null,
        h('span', { class: 'grow' }),
        absentBtn,
        SLP.ui.today.removeButton ? SLP.ui.today.removeButton({ entry, student }) : null));

    for (const { goal, objectives } of blocks) {
      // Goal once per student, collapsed — not repeated above each objective.
      block.appendChild(h('p', { class: 'goal-line clamp',
        text: m.displayText(goal.text, student.name),
        'on:click': e => e.currentTarget.classList.toggle('open') }));
      for (const o of objectives) block.appendChild(objectiveRow(entry, student, o));
    }
    if (!blocks.length) {
      block.appendChild(h('p', { class: 'goal-line',
        text: 'No goals set up yet — add them on the Students tab.' }));
    }
    block.appendChild(noteBox);
    return block;
  }

  SLP.ui.views.today = async (root) => {
    const date = SLP.ui.route.date;
    const plan = await SLP.store.planForDate(date);
    const { charted, total } = SLP.derive.chartedCount(plan);

    root.appendChild(h('div', { class: 'day-bar' },
      h('button', { class: 'plain', id: 'prev-day', type: 'button', text: '←',
                    'aria-label': 'Previous day',
                    'on:click': () => SLP.ui.go({ date: shiftDate(date, -1) }) }),
      h('span', { id: 'date-label', text: longDate(date) }),
      h('button', { class: 'plain', id: 'next-day', type: 'button', text: '→',
                    'aria-label': 'Next day',
                    'on:click': () => SLP.ui.go({ date: shiftDate(date, 1) }) }),
      h('button', { class: 'plain', id: 'jump-today', type: 'button', text: 'Today',
                    'on:click': () => SLP.ui.go({ date: SLP.ui.todayStr() }) }),
      h('span', { class: 'grow' }),
      h('span', { id: 'charted-count', text: charted + ' of ' + total + ' charted' })));

    if (!plan.length) {
      root.appendChild(h('p', { class: 'empty', text: 'Nothing scheduled for this day.' }));
      return;
    }

    for (const entry of plan) {
      const section = h('section', { class: 'slot-section',
                                     'data-slot-id': entry.slot.id || 'adhoc' },
        h('div', { class: 'slot-head' },
          h('span', { text: entry.slot.startTime + '–' + entry.slot.endTime }),
          entry.slot.location ? h('span', { class: 'muted', text: entry.slot.location }) : null,
          h('span', { class: 'grow' }),
          SLP.ui.today.addStudentControl
            ? await SLP.ui.today.addStudentControl(entry)
            : null));
      for (const s of entry.students) section.appendChild(await studentBlock(entry, s));
      root.appendChild(section);
    }
  };

  SLP.ui.today = { shiftDate };
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all today-render tests green. Earlier suites must stay green too; if
`shell.test.js`'s `clicking a tab switches views` now fails, the Today view is throwing —
read the `# ` diagnostic line under the failure.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/today-render.test.js tests/index.html
git commit -m "feat: Today view grid with fixed input column and one goal line per student"
```

---

## Task 11: Today view, part 2 — autosave, absence, ad hoc students, keyboard

The interaction half. Autosave on change, no save button, nothing that can eat a note.
Absence is one control plus a shortcut. Every write path here already exists and is tested
in Task 4 — this task wires the DOM to it and must not add a second way to write.

**Files:**
- Modify: `slp-tracker.html` (extend the `ui.today` section)
- Create: `tests/today-entry.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.recordValue/setAttendance/saveNote/addStudentToSession/removeStudentFromSession`.
- Produces (all attached to the existing `SLP.ui.today`):
  - `wireValueInput(input, ctx)`, `wireAbsent(button, ctx)`, `wireNote(textarea, ctx)`
  - `addStudentControl(entry)` → element, `removeButton(ctx)` → element or null
  - `SLP.ui.today.flush()` → `Promise<void>` — awaits any in-flight save (tests use this)
  - Keyboard: `Alt+A` toggles absence for the focused student's block; `Alt+.` jumps to today

- [ ] **Step 1: Write the failing tests for entry and autosave**

Create `tests/today-entry.test.js`:

```js
const MONDAY2 = '2026-09-07';

async function seedEntryDay(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve receptive language' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will identify common objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id] });
  await st.saveSlot(slot);
  return { ada, bo, goal, obj, slot };
}
function inputFor(doc, student, objective, field) {
  return doc.querySelector('.student-block[data-student-id="' + student.id + '"] ' +
    '.objective-row[data-objective-id="' + objective.id + '"] ' +
    '.value-input[data-field-id="' + field.id + '"]');
}
async function type(w, el, value) {
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.today.flush();
}

test('typing a value autosaves it', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const achieved = obj.fields.find(f => f.role === 'achieved');
  await type(w, inputFor(w.document, ada, obj, achieved), '3');

  const dps = await w.SLP.db.getAll('datapoints');
  eq(dps.length, 1, 'saved without a save button');
  eq(dps[0].values[achieved.id].value, 3, 'the value she typed');
  eq(dps[0].values[achieved.id].entered, true, 'recorded as an observation');
});

test('typing marks the student present and updates the counter', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  await type(w, inputFor(w.document, ada, obj, obj.fields.find(f => f.role === 'achieved')), '3');
  await w.SLP.ui.render();
  const chip = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip');
  eq(chip.dataset.state, 'present', 'attendance derives from data entry');
  eq(w.document.querySelector('#charted-count').textContent.trim(), '1 of 2 charted', 'counter');
});

test('leaving every field untouched saves nothing at all', async () => {
  const w = await loadApp();
  await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  // Fire change on the pre-filled target without altering it, the way a tab-through would.
  const input = w.document.querySelector('.value-input[data-entered="false"]');
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.today.flush();
  eq((await w.SLP.db.getAll('sessions')).length, 0,
     'tabbing past a pre-filled default is not data entry');
  eq(w.document.querySelector('#charted-count').textContent.trim(), '0 of 2 charted',
     'and the counter must not move');
});

test('overwriting the pre-filled target records it as entered', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const target = obj.fields.find(f => f.role === 'target');
  await type(w, inputFor(w.document, ada, obj, target), '2');
  const dp = (await w.SLP.db.getAll('datapoints'))[0];
  eq(dp.values[target.id].value, 2, 'the session that ran differently');
  eq(dp.values[target.id].entered, true, 'honest in the exception');
});

test('clearing a value removes the derived present mark', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const achieved = obj.fields.find(f => f.role === 'achieved');
  await type(w, inputFor(w.document, ada, obj, achieved), '3');
  await w.SLP.ui.render();
  await type(w, inputFor(w.document, ada, obj, achieved), '');
  await w.SLP.ui.render();
  const chip = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip');
  eq(chip.dataset.state, 'none', 'undoing her only entry undoes the derived attendance');
});

test('the ratio updates after entry', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  await type(w, inputFor(w.document, ada, obj, obj.fields.find(f => f.role === 'achieved')), '3');
  await w.SLP.ui.render();
  const ratio = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .ratio');
  eq(ratio.textContent.trim(), '3 / 4 · 75%', 'shown inline while she charts');
});

test('a typed note autosaves and marks present', async () => {
  const w = await loadApp();
  const { bo } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const box = w.document.querySelector('.student-block[data-student-id="' + bo.id + '"] .note-input');
  await type(w, box, 'needed two verbal models');
  const notes = await w.SLP.db.getAll('notes');
  eq(notes.length, 1, 'note saved');
  eq(notes[0].text, 'needed two verbal models', 'verbatim');
});

test('entered values survive a reload', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const achieved = obj.fields.find(f => f.role === 'achieved');
  await type(w, inputFor(w.document, ada, obj, achieved), '3');

  const frame = document.getElementById('app-frame');
  await new Promise(res => { frame.onload = res; frame.src = '../slp-tracker.html?t=' + Date.now(); });
  const w2 = frame.contentWindow;
  await w2.SLP.ready;
  await w2.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  eq(inputFor(w2.document, ada, obj, achieved).value, '3', 'still there tomorrow');
});
```

- [ ] **Step 2: Write the failing tests for absence and ad hoc students**

Append to `tests/today-entry.test.js`:

```js
test('one click marks a student absent', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .absent-toggle').click();
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();
  const chip = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip');
  eq(chip.dataset.state, 'absent', 'one tap, no typing, no parsing');
  eq(w.document.querySelector('#charted-count').textContent.trim(), '1 of 2 charted',
     'a logged absence is charted work');
});

test('an absent student keeps their note box', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .absent-toggle').click();
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();
  const block = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"]');
  assert(block.querySelector('.note-input'), 'she often needs to log why');
  assert(block.classList.contains('is-absent'), 'objective rows are greyed');
});

test('absence can be undone', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const sel = '.student-block[data-student-id="' + ada.id + '"] .absent-toggle';
  w.document.querySelector(sel).click();
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();
  w.document.querySelector(sel).click();
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();
  eq(w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip')
      .dataset.state, 'none', 'back to not-charted');
});

test('Alt+A toggles absence for the focused block', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const box = w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .note-input');
  box.focus();
  box.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }));
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();
  eq(w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip')
      .dataset.state, 'absent', 'keyboard-first, hands stay home');
});

test('adding a student pulls them into this session only', async () => {
  const w = await loadApp();
  const { slot } = await seedEntryDay(w);
  const cy = w.SLP.model.student({ name: 'Cy' });
  await w.SLP.store.saveStudent(cy);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });

  const picker = w.document.querySelector('.slot-section[data-slot-id="' + slot.id + '"] .add-student-select');
  picker.value = cy.id;
  picker.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();

  const block = w.document.querySelector('.student-block[data-student-id="' + cy.id + '"]');
  assert(block, 'Cy is in the session');
  assert(/added/.test(block.querySelector('.added-chip').textContent), 'chipped as added');

  await w.SLP.ui.go({ date: '2026-09-14' });
  assert(!w.document.querySelector('.student-block[data-student-id="' + cy.id + '"]'),
         'next week’s slot is untouched');
});

test('the add-student picker only offers students not already in the session', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const opts = Array.from(w.document.querySelectorAll(
    '.slot-section[data-slot-id="' + slot.id + '"] .add-student-select option'))
    .map(o => o.value).filter(Boolean);
  eq(opts.includes(ada.id), false, 'Ada is already here');
  eq(opts.includes(bo.id), false, 'so is Bo');
});

test('removing a charted student takes two clicks', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  await type(w, inputFor(w.document, ada, obj, obj.fields.find(f => f.role === 'achieved')), '3');
  await w.SLP.ui.render();

  const sel = '.student-block[data-student-id="' + ada.id + '"]';
  w.document.querySelector(sel + ' .remove-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.db.getAll('datapoints')).length, 1,
     'the first click only arms it — Absent is the right record for a no-show');

  w.document.querySelector(sel + ' .confirm-remove-student').click();
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();
  eq((await w.SLP.db.getAll('datapoints')).length, 0, 'confirmed removal discards the data');
});

test('the remove control is absent before a session exists', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  eq(w.document.querySelector('.student-block[data-student-id="' + ada.id + '"] .remove-student'),
     null, 'nothing to remove from a session that has not happened');
});
```

- [ ] **Step 3: Register the suite and run to verify failure**

Add `<script src="today-entry.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `w.SLP.ui.today.flush is not a function`.

- [ ] **Step 4: Implement the interaction layer**

Append inside the `ui.today` IIFE, immediately before `SLP.ui.today = { shiftDate };`, and
change that final line to export the new members:

```js
  // --- save queue -------------------------------------------------------
  // Serialises writes so a fast tab-through cannot interleave two saves on
  // the same datapoint. flush() lets tests (and the nag banner) await quiet.
  let chain = Promise.resolve();
  function enqueue(fn) {
    chain = chain.then(fn).catch(err => {
      console.error('save failed', err);
      SLP.ui.toast('That did not save — ' + err.message, 'error');
    });
    return chain;
  }
  const flush = () => chain;

  // The slot object a write path needs. For an ad hoc entry the slot is synthetic,
  // so fall back to the session it already has.
  function slotOf(entry) {
    if (entry.slot && entry.slot.id) return entry.slot;
    return { id: null, ...entry.slot, studentIds: entry.slot.studentIds || [] };
  }

  function wireValueInput(input, { entry, student, objective, field }) {
    const save = () => enqueue(async () => {
      const dp = await SLP.store.recordValue({
        dateStr: SLP.ui.route.date, slot: slotOf(entry), studentId: student.id,
        objectiveId: objective.id, fieldId: field.id, raw: input.value,
      });
      const cell = dp.values[field.id];
      input.dataset.entered = String(!!cell.entered);
      if (!cell.entered) {
        // Reverted to the pre-filled default — show it, do not leave the box blank.
        input.value = cell.value === null || cell.value === undefined ? '' : cell.value;
      }
      await refreshChrome();
    });
    input.addEventListener('change', () => {
      // A pre-filled field that was tabbed past unchanged is not data entry.
      const untouched = input.dataset.entered === 'false' &&
        String(input.value) === String(input.defaultValue);
      if (untouched) return;
      save();
    });
    input.defaultValue = input.value;
  }

  function wireNote(box, { entry, student }) {
    let last = box.value;
    const save = () => {
      if (box.value === last) return;
      last = box.value;
      enqueue(async () => {
        await SLP.store.saveNote({ dateStr: SLP.ui.route.date, slot: slotOf(entry),
                                   studentId: student.id, text: box.value });
        await refreshChrome();
      });
    };
    box.addEventListener('change', save);
    box.addEventListener('blur', save);
  }

  function toggleAbsent(entry, student, state) {
    return enqueue(async () => {
      const next = state === 'absent' ? 'present' : 'absent';
      if (next === 'present') {
        // Undo: drop the explicit row and let attendance derive from data again.
        const session = await SLP.store.ensureSession(SLP.ui.route.date, slotOf(entry));
        const rows = await SLP.db.getAllBy('attendance', 'sessionId', session.id);
        const row = rows.find(r => r.studentId === student.id);
        if (row) await SLP.db.del('attendance', row.id);
      } else {
        await SLP.store.setAttendance({ dateStr: SLP.ui.route.date, slot: slotOf(entry),
                                        studentId: student.id, status: 'absent' });
      }
      await SLP.ui.render();
    });
  }

  function wireAbsent(button, ctx) {
    button.addEventListener('click', () => toggleAbsent(ctx.entry, ctx.student, ctx.state));
  }

  async function addStudentControl(entry) {
    const present = new Set(entry.students.map(s => s.id));
    const available = (await SLP.store.listStudents({ activeOnly: true }))
      .filter(s => !present.has(s.id));
    if (!available.length) return null;
    const select = h('select', { class: 'add-student-select', 'aria-label': 'Add a student to this session' },
      h('option', { value: '', text: '+ Add student' }),
      available.map(s => h('option', { value: s.id, text: s.name })));
    select.addEventListener('change', () => {
      const id = select.value;
      if (!id) return;
      enqueue(async () => {
        const session = await SLP.store.ensureSession(SLP.ui.route.date, slotOf(entry));
        await SLP.store.addStudentToSession(session.id, id);
        await SLP.ui.render();
      });
    });
    return select;
  }

  let armedRemoval = null;
  function removeButton({ entry, student }) {
    if (!entry.session) return null;          // nothing to remove from yet
    const key = entry.session.id + ':' + student.id;
    if (armedRemoval === key) {
      return h('span', { class: 'row-form' },
        h('span', { class: 'muted', text: 'Discard everything charted for ' + student.name + '?' }),
        h('button', {
          class: 'linkish danger-link confirm-remove-student', type: 'button', text: 'Yes, remove',
          'on:click': () => enqueue(async () => {
            await SLP.store.removeStudentFromSession(entry.session.id, student.id);
            armedRemoval = null;
            await SLP.ui.render();
          }),
        }),
        h('button', {
          class: 'linkish cancel-remove-student', type: 'button', text: 'Cancel',
          'on:click': async () => { armedRemoval = null; await SLP.ui.render(); },
        }));
    }
    return h('button', {
      class: 'linkish remove-student', type: 'button', text: 'Remove',
      title: 'For a scheduled student who did not show, use Absent — the miss should stay visible.',
      'on:click': async () => { armedRemoval = key; await SLP.ui.render(); },
    });
  }

  // Update just the counter and chip without a full re-render, so focus is never
  // stolen mid-typing. A full render happens on structural changes only.
  async function refreshChrome() {
    const label = document.querySelector('#charted-count');
    if (!label) return;
    const plan = await SLP.store.planForDate(SLP.ui.route.date);
    const { charted, total } = SLP.derive.chartedCount(plan);
    label.textContent = charted + ' of ' + total + ' charted';
    for (const entry of plan) {
      for (const s of entry.students) {
        const chip = document.querySelector('.student-block[data-student-id="' + s.id + '"] .state-chip');
        if (!chip) continue;
        const state = SLP.derive.studentState(entry, s.id);
        chip.dataset.state = state;
        chip.textContent = state === 'none' ? 'not charted'
                         : state === 'present' ? 'present' : state;
      }
    }
  }

  // Alt+A toggles absence for whichever student block has focus.
  document.addEventListener('keydown', async (e) => {
    if (!e.altKey || SLP.ui.route.tab !== 'today') return;
    if (e.key === '.') { e.preventDefault(); await SLP.ui.go({ date: SLP.ui.todayStr() }); return; }
    if (e.key !== 'a' && e.key !== 'A') return;
    const block = e.target.closest && e.target.closest('.student-block');
    if (!block) return;
    e.preventDefault();
    const plan = await SLP.store.planForDate(SLP.ui.route.date);
    for (const entry of plan) {
      const student = entry.students.find(s => s.id === block.dataset.studentId);
      if (student) {
        await toggleAbsent(entry, student, SLP.derive.studentState(entry, student.id));
        return;
      }
    }
  });

  SLP.ui.today = { shiftDate, flush, wireValueInput, wireNote, wireAbsent,
                   addStudentControl, removeButton };
```

**Two traps to get right:**

1. `wireValueInput` sets `input.defaultValue` *after* wiring so the "tabbed past unchanged"
   check compares against what was rendered. If a test fails with a session materialized on
   a pure tab-through, this is the line to look at.
2. `refreshChrome()` deliberately avoids `SLP.ui.render()`. A full re-render on every
   keystroke destroys the focused input and breaks the tab-through rhythm — the single most
   important property of this screen.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all today-entry tests green, and every earlier suite still green.

- [ ] **Step 6: Commit**

```bash
git add slp-tracker.html tests/today-entry.test.js tests/index.html
git commit -m "feat: autosave, one-tap absence, ad hoc students, Alt+A shortcut"
```

---

## Task 12: Aggregation — session history, per-objective charts, mastery

Spec §10 step 6. This is the payoff for entering data once: it appears on the student's
history and feeds their chart with no second entry. The date filter is effectively
"generate my quarterly progress report."

**Charts are hand-rolled inline SVG.** No chart library — that would mean a CDN, which the
constraints forbid. Each objective owns its chart with its own scale; nothing is ever
compared across objectives.

**Files:**
- Modify: `slp-tracker.html` (add `ui.aggregation`; extend `<style>`)
- Create: `tests/aggregation.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.store.*`, `SLP.derive.series/mastery`, `SLP.model.ratio`.
- Produces:
  - `SLP.store.historyFor(studentId, {from, to})` → `Promise<[{session, attendance, note, datapoints}]>`
    reverse-chronological
  - `SLP.store.rowsForObjective(studentId, objectiveId)` → `Promise<[{date, dp}]>` chronological
  - `SLP.ui.students.renderAggregation(container, student)` → `Promise<void>` (the hook
    Task 9 already calls)
  - `SLP.ui.chart(series)` → SVG element with `.chart-point` circles carrying
    `data-date` and `data-value`

- [ ] **Step 1: Write the failing tests**

Create `tests/aggregation.test.js`:

```js
async function seedHistory(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will identify objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await st.saveSlot(slot);
  const achieved = obj.fields.find(f => f.role === 'achieved').id;
  // Three Mondays: 2/4, 3/4, 4/4
  const days = [['2026-09-07', '2'], ['2026-09-14', '3'], ['2026-09-21', '4']];
  for (const [dateStr, raw] of days) {
    await st.recordValue({ dateStr, slot, studentId: ada.id, objectiveId: obj.id,
                           fieldId: achieved, raw });
  }
  return { ada, goal, obj, slot, achieved };
}

test('history is reverse chronological', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  const rows = await w.SLP.store.historyFor(ada.id, {});
  eq(rows.map(r => r.session.date), ['2026-09-21', '2026-09-14', '2026-09-07'], 'newest first');
});

test('history carries the note, attendance, and data for each session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedHistory(w);
  await w.SLP.store.saveNote({ dateStr: '2026-09-21', slot, studentId: ada.id, text: 'great day' });
  const rows = await w.SLP.store.historyFor(ada.id, {});
  eq(rows[0].note.text, 'great day', 'note');
  eq(rows[0].attendance.status, 'present', 'attendance');
  eq(rows[0].datapoints.length, 1, 'data');
});

test('history filters by date range', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  const rows = await w.SLP.store.historyFor(ada.id, { from: '2026-09-10', to: '2026-09-18' });
  eq(rows.map(r => r.session.date), ['2026-09-14'], 'inclusive range');
});

test('rowsForObjective is chronological', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  const rows = await w.SLP.store.rowsForObjective(ada.id, obj.id);
  eq(rows.map(r => r.date), ['2026-09-07', '2026-09-14', '2026-09-21'], 'oldest first');
});

test('the student detail renders a history section', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const rows = w.document.querySelectorAll('#session-history .history-row');
  eq(rows.length, 3, 'one row per session');
  assert(/September 21/.test(rows[0].textContent), 'newest first, formatted');
});

test('the history date filter narrows the rendered rows', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const from = w.document.querySelector('#history-from');
  from.value = '2026-09-14';
  from.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();
  eq(w.document.querySelectorAll('#session-history .history-row').length, 2, 'filtered');
});

test('each objective gets its own chart', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const chart = w.document.querySelector('.objective-chart[data-objective-id="' + obj.id + '"] svg');
  assert(chart, 'chart rendered');
  eq(chart.querySelectorAll('.chart-point').length, 3, 'three sessions plotted');
});

test('chart points carry their date and value', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const pts = Array.from(w.document.querySelectorAll(
    '.objective-chart[data-objective-id="' + obj.id + '"] .chart-point'));
  eq(pts.map(p => p.dataset.value), ['50', '75', '100'], 'percentages over time');
  eq(pts[0].dataset.date, '2026-09-07', 'dated');
});

test('mastery is shown per objective', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const text = w.document.querySelector(
    '.objective-chart[data-objective-id="' + obj.id + '"] .mastery').textContent;
  assert(/2 of 3/.test(text), 'met criterion in 2 of the last 3, got: ' + text);
});

test('an objective with no data says so instead of drawing an empty chart', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await w.SLP.store.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'o' });
  await w.SLP.store.saveObjective(obj);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const block = w.document.querySelector('.objective-chart[data-objective-id="' + obj.id + '"]');
  eq(block.querySelector('svg'), null, 'no chart');
  assert(/no data yet/i.test(block.textContent), 'says why');
});

test('a single data point still renders', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'o' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30', studentIds: [ada.id] });
  await st.saveSlot(slot);
  await st.recordValue({ dateStr: '2026-09-07', slot, studentId: ada.id, objectiveId: obj.id,
                         fieldId: obj.fields.find(f => f.role === 'achieved').id, raw: '3' });
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  eq(w.document.querySelectorAll('.objective-chart[data-objective-id="' + obj.id +
     '"] .chart-point').length, 1, 'one point, no divide-by-zero on the x scale');
});
```

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="aggregation.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `w.SLP.store.historyFor is not a function`.

- [ ] **Step 3: Add the two store queries**

Inside the `store` section's returned object, add:

```js
    async historyFor(studentId, { from = null, to = null } = {}) {
      const sessions = (await db.getAll('sessions'))
        .filter(s => s.roster.includes(studentId))
        .filter(s => (!from || s.date >= from) && (!to || s.date <= to))
        .sort((a, b) => b.date.localeCompare(a.date) ||
                        b.startTime.localeCompare(a.startTime));
      const out = [];
      for (const session of sessions) {
        out.push({
          session,
          attendance: await rowFor('attendance', session.id, studentId),
          note: await rowFor('notes', session.id, studentId),
          datapoints: (await db.getAllBy('datapoints', 'sessionId', session.id))
            .filter(d => d.studentId === studentId),
        });
      }
      return out;
    },

    async rowsForObjective(studentId, objectiveId) {
      const dps = (await db.getAllBy('datapoints', 'objectiveId', objectiveId))
        .filter(d => d.studentId === studentId);
      const rows = [];
      for (const dp of dps) {
        const session = await db.get('sessions', dp.sessionId);
        if (session) rows.push({ date: session.date, dp });
      }
      return rows.sort((a, b) => a.date.localeCompare(b.date));
    },
```

- [ ] **Step 4: Add aggregation styles**

Append inside `<style>`:

```css
.history-row { border-bottom: 1px solid var(--line); padding: 8px 0; font-size: 14px; }
.history-row:last-child { border-bottom: none; }
.history-date { font-weight: 600; }
.history-data { color: var(--muted); font-size: 13px; }
.history-note { margin: 3px 0 0; }
.objective-chart { margin: 14px 0; }
.objective-chart svg { display: block; max-width: 100%; height: auto;
                       border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }
.chart-line { fill: none; stroke: var(--accent); stroke-width: 2; }
.chart-point { fill: var(--accent); }
.chart-axis { stroke: var(--line); stroke-width: 1; }
.chart-tick { fill: var(--muted); font-size: 10px; }
.mastery { font-size: 13px; color: var(--muted); margin-top: 4px; }
.mastery.met { color: var(--ok); font-weight: 600; }
```

- [ ] **Step 5: Implement the aggregation UI**

Insert before the `boot` section:

```js
// ============================================================
// SECTION: ui.aggregation — history, per-objective charts, mastery.
// Each objective owns its chart and its scale. Never compare across objectives.
// ============================================================
(() => {
  const { h } = SLP.ui;
  const m = SLP.model;
  const SVG = 'http://www.w3.org/2000/svg';
  const filter = { from: '', to: '' };

  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  };
  const prettyDate = ds => {
    const [y, mo, d] = ds.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined,
      { month: 'long', day: 'numeric', year: 'numeric' });
  };

  function chart(series) {
    const pts = series.points;
    const W = 520, H = 150, PAD_L = 34, PAD_B = 22, PAD_T = 10, PAD_R = 10;
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
                               'aria-label': series.label + ' over time' });

    const isPct = series.kind === 'pct';
    const values = pts.map(p => p.value);
    const max = isPct ? 100 : Math.max(1, ...values);
    const min = isPct ? 0 : Math.min(0, ...values);
    const span = (max - min) || 1;

    const x = i => pts.length === 1
      ? (PAD_L + (W - PAD_L - PAD_R) / 2)                 // one point sits centred
      : PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R);
    const y = v => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);

    svg.appendChild(svgEl('line', { class: 'chart-axis', x1: PAD_L, y1: PAD_T,
                                    x2: PAD_L, y2: H - PAD_B }));
    svg.appendChild(svgEl('line', { class: 'chart-axis', x1: PAD_L, y1: H - PAD_B,
                                    x2: W - PAD_R, y2: H - PAD_B }));
    for (const [v, label] of [[max, isPct ? '100%' : String(max)], [min, isPct ? '0%' : String(min)]]) {
      const t = svgEl('text', { class: 'chart-tick', x: 4, y: y(v) + 3 });
      t.textContent = label;
      svg.appendChild(t);
    }

    if (pts.length > 1) {
      svg.appendChild(svgEl('polyline', {
        class: 'chart-line',
        points: pts.map((p, i) => x(i) + ',' + y(p.value)).join(' '),
      }));
    }
    pts.forEach((p, i) => {
      const c = svgEl('circle', { class: 'chart-point', cx: x(i), cy: y(p.value), r: 3.5 });
      c.setAttribute('data-date', p.date);
      c.setAttribute('data-value', String(p.value));
      const title = svgEl('title', {});
      title.textContent = prettyDate(p.date) + ' — ' + (p.label || p.value);
      c.appendChild(title);
      svg.appendChild(c);
    });
    return svg;
  }

  async function objectiveCharts(student, container) {
    const blocks = await SLP.store.objectivesForStudent(student.id);
    for (const { objectives } of blocks) {
      for (const objective of objectives) {
        const rows = await SLP.store.rowsForObjective(student.id, objective.id);
        const box = h('div', { class: 'objective-chart', 'data-objective-id': objective.id },
          h('p', { class: 'objective-text clamp',
                   text: m.displayText(objective.text, student.name),
                   'on:click': e => e.currentTarget.classList.toggle('open') }));

        const allSeries = SLP.derive.series(objective, rows)
          .filter(s => s.points.length);
        if (!allSeries.length) {
          box.appendChild(h('p', { class: 'muted', text: 'No data yet.' }));
        } else {
          for (const s of allSeries) {
            box.appendChild(h('p', { class: 'muted', text: s.label }));
            box.appendChild(chart(s));
          }
          const mast = SLP.derive.mastery(objective, rows);
          if (mast) {
            box.appendChild(h('p', {
              class: 'mastery' + (mast.mastered ? ' met' : ''),
              text: mast.mastered
                ? 'Criterion met in all ' + mast.of + ' of the last ' + mast.of + ' sessions.'
                : 'Met criterion in ' + mast.met + ' of ' + mast.of + ' recent sessions.',
            }));
          }
        }
        container.appendChild(box);
      }
    }
  }

  async function historySection(student) {
    const rows = await SLP.store.historyFor(student.id,
      { from: filter.from || null, to: filter.to || null });

    const objectives = {};
    for (const { objectives: os } of await SLP.store.objectivesForStudent(student.id)) {
      for (const o of os) objectives[o.id] = o;
    }

    const from = h('input', { type: 'date', id: 'history-from', value: filter.from });
    const to = h('input', { type: 'date', id: 'history-to', value: filter.to });
    from.addEventListener('change', async () => { filter.from = from.value; await SLP.ui.render(); });
    to.addEventListener('change', async () => { filter.to = to.value; await SLP.ui.render(); });

    const list = h('div', { id: 'session-history' });
    if (!rows.length) list.appendChild(h('p', { class: 'muted', text: 'No sessions in this range.' }));

    for (const row of rows) {
      const summary = row.datapoints.map(dp => {
        const o = objectives[dp.objectiveId];
        if (!o) return null;
        const r = m.ratio(o, dp);
        if (r) return o.fields.find(f => f.role === 'achieved').label +
                      ' ' + r.achieved + '/' + r.target + ' (' + r.pct + '%)';
        return o.fields.filter(f => dp.values[f.id] && dp.values[f.id].entered)
          .map(f => f.label + ' ' + dp.values[f.id].value).join(', ');
      }).filter(Boolean).join(' · ');

      list.appendChild(h('div', { class: 'history-row' },
        h('div', {},
          h('span', { class: 'history-date',
                      text: prettyDate(row.session.date) + ' · ' + row.session.startTime }),
          ' ',
          h('span', { class: 'state-chip',
                      'data-state': row.attendance ? row.attendance.status : 'none',
                      text: row.attendance ? row.attendance.status : 'not charted' })),
        summary ? h('div', { class: 'history-data', text: summary }) : null,
        row.note && row.note.text ? h('p', { class: 'history-note', text: row.note.text }) : null));
    }

    return h('section', { class: 'panel' },
      h('h2', { text: 'Session history' }),
      h('div', { class: 'row-form' }, 'From', from, 'to', to,
        h('button', { class: 'plain', type: 'button', text: 'Clear',
                      'on:click': async () => { filter.from = ''; filter.to = '';
                                                await SLP.ui.render(); } })),
      list);
  }

  SLP.ui.students.renderAggregation = async (container, student) => {
    const progress = h('section', { class: 'panel', id: 'progress' },
      h('h2', { text: 'Progress' }));
    await objectiveCharts(student, progress);
    container.appendChild(progress);
    container.appendChild(await historySection(student));
  };

  SLP.ui.chart = chart;
})();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all aggregation tests green.

- [ ] **Step 7: Commit**

```bash
git add slp-tracker.html tests/aggregation.test.js tests/index.html
git commit -m "feat: session history, per-objective SVG charts, mastery"
```

---

## Task 13: Backup UI and the staleness nag

Task 6 built the machinery; this puts it where she will actually press it. Because
`persist()` was denied, this banner is the difference between a bad week and a lost year.

**Files:**
- Modify: `slp-tracker.html` (add backup controls to the header; extend `<style>`)
- Create: `tests/backup-ui.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: `SLP.backup.*`.
- Produces: `#backup-bar` in the header containing `#backup-now`, `#backup-pick`,
  `#backup-restore` (a hidden `<input type="file">` plus its label button), and
  `#backup-status`; `#backup-nag` appears when the last backup is older than 3 days.

- [ ] **Step 1: Write the failing tests**

Create `tests/backup-ui.test.js`:

```js
test('the header offers a backup control', async () => {
  const w = await loadApp();
  assert(w.document.querySelector('#backup-now'), 'back up now');
  assert(w.document.querySelector('#backup-restore-input'), 'restore input');
});

test('a never-backed-up app with data nags', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.ui.render();
  const nag = w.document.querySelector('#backup-nag');
  assert(nag, 'nag shown');
  assert(/never/i.test(nag.textContent), 'says it has never been backed up');
});

test('an empty app does not nag', async () => {
  const w = await loadApp();
  await w.SLP.ui.render();
  eq(w.document.querySelector('#backup-nag'), null, 'nothing to lose yet');
});

test('a recent backup does not nag', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date().toISOString(), backupFileHandle: null });
  await w.SLP.ui.render();
  eq(w.document.querySelector('#backup-nag'), null, 'quiet when she is current');
});

test('a stale backup nags with the day count', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date(Date.now() - 9 * 86400000).toISOString(), backupFileHandle: null });
  await w.SLP.ui.render();
  assert(/9 days/.test(w.document.querySelector('#backup-nag').textContent),
         'names the number of days');
});

test('the status line reports whether a backup file is linked', async () => {
  const w = await loadApp();
  assert(/not linked/i.test(w.document.querySelector('#backup-status').textContent),
         'no file picked yet');
});

test('restoring from a chosen file replaces the data and re-renders', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();

  // Drive the restore handler directly: constructing a real FileList is not possible.
  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'slp-data-2026-09-07.json',
                                                   { type: 'application/json' }));
  eq((await w.SLP.store.listStudents({})).map(s => s.name), ['Ada'], 'data restored');
});

test('restoring a damaged file reports the problem and changes nothing', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.ui.backup.restoreFromFile(new w.File(['garbage'], 'bad.json'));
  eq((await w.SLP.store.listStudents({})).length, 1, 'her data is untouched');
  const toast = w.document.querySelector('.toast');
  assert(toast && toast.classList.contains('toast-error'), 'and she is told');
});

test('backup now falls back to a download when no file is linked', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  let downloaded = null;
  w.SLP.backup.download = async () => { downloaded = 'yes'; };
  await w.SLP.ui.backup.backupNow();
  eq(downloaded, 'yes', 'the fallback carries the load when the API path is unavailable');
});
```

- [ ] **Step 2: Register the suite and run to verify failure**

Add `<script src="backup-ui.test.js"></script>` to `tests/index.html`, then run:
`bash tests/run-tests.sh`
Expected: FAIL — `#backup-now` not found.

- [ ] **Step 3: Add backup styles**

Append inside `<style>`:

```css
#backup-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
              padding-bottom: 8px; font-size: 13px; }
#backup-status { color: var(--muted); }
#backup-nag { background: #fffaf0; border: 1px solid var(--warn); color: var(--warn);
              border-radius: 6px; padding: 7px 11px; margin-bottom: 10px; font-size: 13px; }
```

- [ ] **Step 4: Implement the backup UI**

Insert before the `boot` section:

```js
// ============================================================
// SECTION: ui.backup — the nag and the buttons.
// persist() was DENIED: "Clear browsing data" wipes everything.
// This bar is the only thing standing between her and a lost year.
// ============================================================
(() => {
  const { h, toast } = SLP.ui;
  const STALE_AFTER_DAYS = 3;

  async function backupNow() {
    try {
      const { via } = await SLP.backup.backupNow();
      toast(via === 'handle' ? 'Backed up to your linked file.' : 'Backup downloaded.', 'ok');
    } catch (e) {
      toast('Backup failed — ' + e.message, 'error');
    }
    await SLP.ui.render();
  }

  async function restoreFromFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const { restored } = await SLP.backup.restoreFromText(text);
      const n = Object.values(restored).reduce((a, b) => a + b, 0);
      toast('Restored ' + n + ' records.', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
    await SLP.ui.render();
  }

  async function pickFile() {
    try {
      if (!SLP.backup.hasFileApi()) {
        toast('This browser cannot link a backup file. Use Back up now instead.', 'warn');
        return;
      }
      if (await SLP.backup.pickBackupFile()) {
        await SLP.backup.writeToHandle();
        toast('Backup file linked. One press saves to it from now on.', 'ok');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;      // she closed the picker; not an error
      toast('Could not link that file — ' + e.message, 'error');
    }
    await SLP.ui.render();
  }

  async function bar() {
    const status = await SLP.backup.status();
    const hasData = (await SLP.db.getAll('students')).length > 0;

    const fileInput = h('input', { type: 'file', id: 'backup-restore-input',
                                   accept: '.json,application/json',
                                   style: 'display:none' });
    fileInput.addEventListener('change', async () => {
      await restoreFromFile(fileInput.files && fileInput.files[0]);
    });

    const els = [h('div', { class: 'backup-bar-inner', id: 'backup-bar' },
      h('button', { class: 'primary', id: 'backup-now', type: 'button', text: 'Back up now',
                    'on:click': backupNow }),
      h('button', { class: 'plain', id: 'backup-pick', type: 'button',
                    text: status.hasHandle ? 'Change backup file' : 'Link a backup file…',
                    'on:click': pickFile }),
      h('button', { class: 'plain', id: 'backup-restore', type: 'button', text: 'Restore…',
                    'on:click': () => fileInput.click() }),
      fileInput,
      h('span', { id: 'backup-status',
        text: (status.hasHandle ? 'Backup file linked' : 'Backup file not linked') +
              ' · ' + (status.lastBackupAt
                ? 'last backup ' + (status.staleDays === 0 ? 'today'
                    : status.staleDays + ' day' + (status.staleDays === 1 ? '' : 's') + ' ago')
                : 'never backed up') }))];

    const stale = status.lastBackupAt === null || status.staleDays >= STALE_AFTER_DAYS;
    if (hasData && stale) {
      els.unshift(h('div', { id: 'backup-nag' },
        status.lastBackupAt === null
          ? 'This data has never been backed up. Chrome can clear it without warning — ' +
            'press Back up now.'
          : 'Last backup was ' + status.staleDays + ' days ago. Press Back up now.'));
    }
    return els;
  }

  SLP.ui.backup = { bar, backupNow, restoreFromFile, pickFile };
})();
```

- [ ] **Step 5: Mount the bar in the shell**

In `ui.shell`'s `render()`, after the `<nav class="tabs">` header is appended and before
the view root, insert:

```js
    if (SLP.ui.backup) for (const el of await SLP.ui.backup.bar()) app.appendChild(el);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash tests/run-tests.sh`
Expected: PASS — all backup-ui tests green, everything else still green.

- [ ] **Step 7: Commit**

```bash
git add slp-tracker.html tests/backup-ui.test.js tests/index.html
git commit -m "feat: backup bar, staleness nag, and restore"
```

---

## Task 14: Ship — hand-verification, delivery, and the first-run experience

Automated tests prove the logic. They cannot tell you whether a whole day of transcription
feels fast, which is the only thing that decides whether she uses this in October. This
task is the human pass.

**Files:**
- Modify: `slp-tracker.html` (first-run hint; version bump to `1.0.0`)
- Create: `docs/DELIVERY.md`

- [ ] **Step 1: Full suite green**

Run: `bash tests/run-tests.sh`
Expected: `0 failed`, exit 0. Do not proceed past a single red test.

- [ ] **Step 2: Grep the shipped file for constraint violations**

```bash
grep -nE 'https?://|fetch\(|XMLHttpRequest|cdn|googleapis' slp-tracker.html
```

Expected: **no matches** except the `xmlns` string `http://www.w3.org/2000/svg` in the
chart code, which is a namespace identifier and not a network fetch. Any other hit is a
constraint violation — fix it before shipping.

```bash
grep -c 'SECTION:' slp-tracker.html      # expect 9
wc -l slp-tracker.html                   # note the number in DELIVERY.md
```

- [ ] **Step 3: Add the first-run hint**

A brand-new file opens to an empty Today tab with nothing scheduled, which reads as broken.
In `ui.views.today`, replace the empty-day paragraph with:

```js
    if (!plan.length) {
      const noSlots = (await SLP.store.listSlots()).length === 0;
      root.appendChild(h('p', { class: 'empty', text: noSlots
        ? 'No schedule yet. Open the Schedule tab to add students and their weekly slots.'
        : 'Nothing scheduled for this day.' }));
      return;
    }
```

Add a test for it in `tests/today-render.test.js`:

```js
test('a brand-new file points her at the Schedule tab', async () => {
  const w = await loadApp();
  await w.SLP.ui.go({ tab: 'today', date: '2026-09-07' });
  assert(/Schedule tab/.test(w.document.querySelector('#view-today').textContent),
         'an empty app must not look broken');
});
```

Run `bash tests/run-tests.sh` — expect it to fail first, then pass after the change.

- [ ] **Step 4: Bump the version and commit**

Change `window.SLP = { version: '0.1.0' }` to `'1.0.0'`, then:

```bash
bash tests/run-tests.sh
git add slp-tracker.html tests/today-render.test.js
git commit -m "feat: first-run hint; v1.0.0"
```

- [~] **Step 5: Drive a real day by hand** — **DEFERRED 2026-08-25, not done.**

> Brenden's call: cleared off the open list to make room for other work, to be raised
> again only if it turns out to matter. Recorded as deferred rather than passed because
> nobody has driven it — the properties below are still unverified. Do not read the empty
> checkbox as evidence either way.

Open `slp-tracker.html` by double-clicking it. Do **not** use the test harness for this.

1. Schedule tab: add three students, then two Monday slots and one Wednesday slot.
2. Students tab: paste a real IEP goal (the one in the spec's process note is a good
   sample) and two objectives for one student. Confirm `STUDENT` renders as their name.
3. Today tab: navigate to a Monday. **Now put the mouse down.** Tab from the first field
   to the last field of the day. Check every one of these:
   - Tab order runs student → objective → field in reading order, with no detours.
   - The input column does not move between students, whatever the goal text length.
   - The counter climbs only when you actually type.
   - `Alt+A` marks the focused student absent; the note box stays usable.
   - Nothing steals focus mid-typing.
4. Reload the file. Everything is still there.
5. Press **Back up now**, then **Restore…** with that file. Everything survives.

**If the tab-through feels slow or the layout jumps, stop and fix it before delivery.**
That is the property this whole screen exists for, and no test can assert it.

- [ ] **Step 6: Write the delivery note**

Create `docs/DELIVERY.md`:

```markdown
# Delivering the tracker

The deliverable is one file: `slp-tracker.html`. Send it; she double-clicks it. Nothing
to install, no internet needed.

## Updating her copy

Send the new file. **Her data is not affected** — Chrome keys `file://` storage to the
shared `file://` origin, not to the file path (verified 2026-08-25, see
`docs/superpowers/specs/2026-08-25-storage-probe-result.md`). She can save the new copy
anywhere, even over the old one.

The first time she takes an update, have her confirm her sessions are still there before
deleting the old file. That check costs a glance and closes the only remaining doubt.

## What she must know

1. **Chrome can clear this data.** `persist()` was denied on her laptop, so "Clear
   browsing data" wipes it. Press **Back up now** regularly — the app nags after 3 days.
2. **Link a backup file once**, ideally inside her Google Drive for Desktop folder. After
   that, Back up now writes straight to it with no dialog, and Drive carries it off the
   laptop on its own.
3. **Restore** reads a backup file back. It replaces everything; it does not merge.

## Not built (deliberately)

School-year rollover, makeup-session linking, multi-user or sync, and Phase 2 (curriculum
and lesson planning). See spec §7.
```

- [ ] **Step 7: Commit**

```bash
git add docs/DELIVERY.md
git commit -m "docs: delivery and update instructions"
```

---

## Self-review

### Spec coverage

| Spec section | Covered by |
|---|---|
| §2 constraints (raw file, local data, FERPA, not-at-a-computer) | Global Constraints; Task 14 step 2 greps for violations |
| §3 groups not 1:1 | Task 4 — slots hold N students, data recorded per student |
| §3 schedule is a template, not history | Task 4 — `editing the schedule never rewrites a past session` |
| §3 materialize on write | Task 4 — `browsing a day materializes nothing` |
| §3 attendance derives from entry | Task 4 + Task 11 |
| §3 goal text pasted once, shown forever | Task 9 + Task 10 |
| §3 several number fields per objective | Task 3 preset + Task 9 field editor |
| §4 Student / Goal / Objective | Task 3, Task 9 |
| §4 two field types only | Task 3 + Task 9 `the type selector offers exactly two types` |
| §4 number defaults | Task 3, Task 9, Task 10 pre-fill |
| **§4 pre-filled ≠ data entry** | Task 3 (7 tests), Task 4, Task 5 counter, Task 11 tab-through |
| §4 Session / Attendance / Note / DataPoint | Task 3 + Task 4 |
| §4 ScheduleSlot | Task 3 + Task 8 |
| §4 progress within one objective only | Task 5 `series`, Task 12 one chart per objective |
| §4 ratio and mastery from presets | Task 3 `ratio`, Task 5 `mastery`, Task 12 display |
| §5 Today: expanded by default, tab order, autosave, absent, counter, add student, removal is the awkward path | Tasks 10 and 11 |
| §5 goal-text treatment (clamp, substitute, once per student, fixed column) | Task 10 tests + CSS |
| §5 Students: search, in-place edit, progress, history, date filter | Tasks 9 and 12 |
| §5 Schedule: weekly grid, no ad hoc here | Task 8 |
| §6 IndexedDB authoritative, manual backup, nag, file mirror | Tasks 2, 6, 13 |
| §9 risk: storage wiped | Task 6 + Task 13 nag; probe already answered the origin question |
| §9 risk: single file unmaintainable | Sectioning contract; Task 14 step 2 counts sections |
| §10 steps 2–6 | Tasks 2–13 |

**Deliberately out of scope**, per the handoff: §7 Phase 2, school-year rollover,
makeup-session linking, multi-user/sync. §10 step 7 (automatic file mirror) is **not
built** — the probe decision made backup manual, so the handle is wired to a button in
Task 13 rather than to an after-every-session trigger.

**One gap I am flagging rather than silently filling:** spec §4 mentions an `isMakeup`
flag on Attendance. The model carries it (Task 3) and it round-trips through backup, but
**no UI sets it** in V1. Linking a makeup to the session it replaces is explicitly out of
scope (§7), and the label alone has no consumer yet. If she wants to mark makeups, it is a
one-line control in `studentBlock` — worth waiting for her to ask rather than guessing at
the workflow.

### Interface consistency

Checked across tasks: `SLP.db` (9 methods), `SLP.model` (17), `SLP.store` (22 including
Task 12's two), `SLP.derive` (5), `SLP.backup` (11), `SLP.ui` (11 + view registries).
Names used in later tasks match their defining task. Three seams worth re-checking during
execution because they cross task boundaries:

1. `SLP.ui.students.renderAggregation` is *called* in Task 9 and *defined* in Task 12 —
   guarded by an `if`, so Task 9 passes alone.
2. `SLP.ui.today.wireValueInput` / `wireNote` / `wireAbsent` / `addStudentControl` /
   `removeButton` are *called* in Task 10 and *defined* in Task 11 — same guard pattern.
3. `SLP.backup.download` is called through the exported `api` object so Task 13's fallback
   test can stub it.

### Known rough edges to watch during execution

- **Section order matters.** `ui.aggregation` must come after `ui.students`, and all `ui.*`
  sections before `boot`. If a view is missing at runtime, check the order first.
- **`slotOf(entry)` for ad hoc sessions** passes `id: null`, so `ensureSession` will match
  any other ad hoc session on the same date. V1 creates ad hoc sessions only via
  `addStudentToSession` on an existing slot, so this path is not reachable yet — but do not
  build an "add ad hoc session" button without fixing it.
- **Re-render on search keystroke** (Task 9) may drop focus; the note there says what to do
  if the manual pass in Task 14 confirms it.

---
