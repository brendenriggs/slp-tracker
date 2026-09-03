// Where the keyboard is after a render.
//
// Every render tears #app down and rebuilds it, so a control she is typing in is a
// different node afterwards and the old one is detached — focus falls to <body> and the
// caret is gone. doRender already saves and restores window.scrollY for exactly this
// reason; focus is the same problem one layer in, and this file is the other half of
// scroll-restore.test.js.
//
// This is not a search-box bug. The app met it twice before and dodged it both times:
// the two confirm-phrase boxes update a button's `disabled` in place rather than
// re-rendering, with a comment saying why. That works only for a control whose change
// affects nothing but itself. Filtering a list IS the re-render, so the search box could
// not dodge it, and the next control that needs a live re-render will not be able to
// either. Hence the fix and these tests live at doRender, not at studentFilters.
//
// Helpers here are prefixed `foc` — tests/index.html loads every *.test.js into ONE
// global scope, so an unprefixed `seed` would silently overwrite another file's.

async function focSeedStudents(w, n = 8) {
  const m = w.SLP.model;
  const made = [];
  for (let i = 0; i < n; i++) {
    const s = m.student({ name: 'Ann Student ' + i, grade: i % 2 ? '3' : '4',
                          school: i % 2 ? 'Lincoln' : 'Fairview' });
    await w.SLP.store.saveStudent(s);
    made.push(s);
  }
  return made;
}

// Set the value, dispatch the bubbling event the control actually listens for, then
// await one render — the house style. Re-query afterwards rather than holding the
// handle: the node the assertion wants is the one built by the render, not this one.
async function focType(w, sel, value, caret) {
  const el = w.document.querySelector(sel);
  assert(el, 'no control at ' + sel);
  el.focus();
  el.value = value;
  if (caret !== undefined) el.setSelectionRange(caret, caret);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  await w.SLP.ui.render();
}

const focActive = w => w.document.activeElement;
const focActiveId = w => {
  const a = focActive(w);
  return a ? (a.id || a.tagName) : 'null';
};

test('the harness can observe focus at all', async () => {
  // Guards every assertion below. If focus silently did not take in headless Chrome,
  // "focus was lost" would be indistinguishable from "focus never happened" and this
  // whole file would pass against a broken app.
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });
  const search = w.document.querySelector('#student-search');
  search.focus();
  assert(focActive(w) === search,
     'focus() must take inside the test frame — got ' + focActiveId(w));
});

test('typing in the caseload search keeps the keyboard in the search box', async () => {
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });

  await focType(w, '#student-search', 'Ann');

  const search = w.document.querySelector('#student-search');
  assert(focActive(w) === search,
     'she types one letter and the next one goes nowhere — focus landed on ' +
     focActiveId(w));
});

test('the caret stays where she was typing, not at the end', async () => {
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });

  // Correcting a typo at the front of what she already typed. Restoring focus alone
  // would put the caret at the end, so the rest of her word types itself backwards.
  await focType(w, '#student-search', 'Ann', 1);

  const search = w.document.querySelector('#student-search');
  eq(search.selectionStart, 1, 'the caret is where she left it');
  eq(search.selectionEnd, 1, 'and it is a caret, not a selection');
});

test('a selection she made is still selected afterwards', async () => {
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });
  const search = w.document.querySelector('#student-search');
  search.focus();
  // Value first, THEN the range: assigning .value collapses the caret to the end, so
  // selecting before typing would hand the render a [4,4] caret and prove nothing.
  search.value = 'Anna';
  search.setSelectionRange(0, 3);
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  await w.SLP.ui.render();

  const after = w.document.querySelector('#student-search');
  eq([after.selectionStart, after.selectionEnd], [0, 3],
     'a range she is about to overtype survives the render, not just a caret — this is ' +
     'what saving selectionEnd separately from selectionStart buys');
});

test('the grade picker keeps focus, because this is not a search-box fix', async () => {
  // The pattern, not the instance. Every control that survives a render by id has the
  // same defect; a fix that only knew about #student-search would leave her tabbing
  // back to the picker after every choice.
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });
  const grade = w.document.querySelector('#student-grade-filter');
  grade.focus();
  grade.value = '3';
  grade.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();

  assert(focActive(w) === w.document.querySelector('#student-grade-filter'),
     'focus should stay on the picker she just used — got ' + focActiveId(w));
});

test('a date field survives the render without throwing', async () => {
  // setSelectionRange throws InvalidStateError on date/time/number inputs. A restore
  // that reaches for the caret unconditionally takes the whole render down with it —
  // and the Attendance range is exactly such a field.
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'attendance' });
  const from = w.document.querySelector('#attendance-from');
  assert(from, 'the Attendance range exists');
  from.focus();
  from.value = '2026-10-01';
  from.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();

  assert(w.document.querySelector('#attendance-from'),
     'the render completed — a throw in the focus restore would leave the view half-built');
  assert(focActive(w) === w.document.querySelector('#attendance-from'),
     'and the date field kept focus — got ' + focActiveId(w));
});

test('leaving the tab does not drag focus along', async () => {
  // The restore is by id. Nothing on the Attendance tab answers to #student-search, so
  // arriving somewhere new must simply leave focus alone rather than hunt for a match.
  const w = await loadApp();
  await focSeedStudents(w);
  await w.SLP.ui.go({ tab: 'students' });
  w.document.querySelector('#student-search').focus();

  await w.SLP.ui.go({ tab: 'attendance' });

  const a = focActive(w);
  assert(a === w.document.body || a === null || a === w.document.documentElement,
     'she navigated, so the keyboard belongs to the new page — got ' + focActiveId(w));
});

test('a whole word typed at speed lands intact, at her real caseload', async () => {
  // The single-keystroke tests above prove the mechanism; this one is what she does.
  // Seeded at 49 — docs/AUTONOMY.md — because a six-student fixture renders far faster
  // than her data and would hide any timing this depends on.
  //
  // Keystrokes go out on a wall clock rather than awaiting each render, so a character
  // aimed at a torn-down field is genuinely lost, exactly as it would be under her hands.
  // 40ms is faster than she types and roughly seven times the worst render measured on
  // this fixture (~6ms), so the headroom is real; if this ever flakes, the render got
  // slow and that is the finding.
  const w = await loadApp();
  await focSeedStudents(w, 49);
  await w.SLP.ui.go({ tab: 'students' });
  w.document.querySelector('#student-search').focus();

  const word = 'Ann Student 1';
  let dropped = 0;
  for (const ch of word) {
    await new Promise(r => setTimeout(r, 40));
    const box = w.document.querySelector('#student-search');
    if (!box || focActive(w) !== box) { dropped++; continue; }
    box.value = box.value + ch;
    box.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  await w.SLP.ui.render();

  const box = w.document.querySelector('#student-search');
  eq(dropped, 0, 'every keystroke found a field that existed and had the keyboard');
  eq(box.value, word, 'so the whole word is in the box, not just its first letter');
  assert(focActive(w) === box, 'and she can keep typing');
  const rows = w.document.querySelectorAll('#student-list .student-row').length;
  assert(rows > 0 && rows < 49, 'the list narrowed as she typed — ' + rows + ' of 49');
});

test('restoring focus does not fight the scroll restore', async () => {
  // focus() scrolls its element into view by default. doRender restores scrollY as its
  // last act for a reason (scroll-restore.test.js), and a focus restore that scrolled
  // would silently undo it — a defect neither file's other tests would catch.
  const w = await loadApp();
  await focSeedStudents(w, 60);
  await w.SLP.ui.go({ tab: 'students' });
  const max = Math.max(0, w.document.documentElement.scrollHeight - w.innerHeight);
  assert(max > 100, 'the caseload is long enough to scroll — got ' + max);
  // Focus FIRST, then park the offset. A bare focus() scrolls its element into view, so
  // focusing second would move the page to the search box and leave the render restoring
  // an offset this test never set — passing or failing for reasons unrelated to the fix.
  w.document.querySelector('#student-search').focus();
  const target = Math.floor(max / 2);
  w.scrollTo(0, target);
  eq(w.scrollY, target, 'she is genuinely parked mid-list, with the keyboard in the box');

  await w.SLP.ui.render();

  eq(w.scrollY, target, 'the focus restore left her where she was reading');
});
