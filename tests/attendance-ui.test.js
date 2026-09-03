// The Attendance tab. Every top-level name is prefixed `attUi` — tests/index.html
// loads each *.test.js into ONE global scope.

const ATT_UI_MONDAY = '2026-10-05';
const ATT_UI_TODAY = '2026-10-31';

async function attUiSeed(w) {
  // Pin the clock. `attendancePct` drops any date after today, so on a real clock every
  // October 2026 row below would vanish and these assertions would die. `todayStr` is a
  // namespace export called per render, so overriding it here holds for the whole test.
  // Pin it — do NOT rewrite these dates into the past, which would silently destroy the
  // future-exclusion coverage the dropped-date tests exist to provide.
  w.SLP.ui.todayStr = () => ATT_UI_TODAY;
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincoln' });
  const bo = m.student({ name: 'Bo', grade: '4', school: 'Fairview' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, bo, slot };
}

// House style for a range change is aggregation.test.js:66-69 — set the value, dispatch a
// bubbling change, then await one render. Re-query between the two renders rather than
// holding a reference across them: each render tears #app down and builds new nodes, so a
// handle taken before the first render is detached by the second.
async function attUiSetRange(w, id, value) {
  const el = w.document.querySelector('#attendance-' + id);
  el.value = value;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();
}

async function attUiOpen(w, from = '2026-10-01', to = '2026-10-31') {
  await w.SLP.ui.go({ tab: 'attendance' });
  await attUiSetRange(w, 'from', from);
  await attUiSetRange(w, 'to', to);
  return w.document;
}

function attUiRow(doc, student) {
  return doc.querySelector('#attendance-grid tr[data-student-id="' + student.id + '"]');
}

function attUiCells(doc, student, date) {
  return Array.from(attUiRow(doc, student)
    .querySelectorAll('td.att-day[data-date="' + date + '"] .att-cell'));
}

test('Attendance is a top-level tab', async () => {
  const w = await loadApp();
  const tab = w.document.querySelector('.tab[data-tab="attendance"]');
  assert(tab, 'it is caseload-wide, so it does not belong inside Students');
  eq(tab.textContent, 'Attendance', 'labelled plainly');
});

test('clicking the tab opens the grid over the current month', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  w.document.querySelector('.tab[data-tab="attendance"]').click();
  await w.SLP.ui.render();
  const doc = w.document;
  assert(doc.querySelector('#attendance-grid'), 'the grid rendered');
  const expected = w.SLP.derive.monthRange(w.SLP.ui.todayStr());
  eq(doc.querySelector('#attendance-from').value, expected.from, 'defaults to this month');
  eq(doc.querySelector('#attendance-to').value, expected.to, 'through its last day');
});

test('the grid runs weekdays across and the caseload down', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-11');
  const days = Array.from(doc.querySelectorAll('#attendance-grid th.att-day'))
    .map(th => th.dataset.date);
  eq(days, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
     'M–F; weekends would be dead columns on her form');
  assert(attUiRow(doc, ada), 'Ada has a row');
  assert(attUiRow(doc, bo), 'Bo has a row');
});

test('a scheduled but unmarked session shows as a box, an unscheduled day as a dot', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const monday = attUiCells(doc, ada, '2026-10-05');
  eq(monday.length, 1, 'Monday is her day');
  eq(monday[0].dataset.state, 'unmarked', 'scheduled, nothing entered');
  eq(attUiCells(doc, ada, '2026-10-06').length, 0, 'Tuesday is not');
  assert(attUiRow(doc, ada).querySelector('td.att-day[data-date="2026-10-06"] .att-none'),
     'and it says so with a dot rather than a blank');
});

test('each state carries its own glyph, not just a colour', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const cell = attUiCells(doc, ada, ATT_UI_MONDAY)[0];
  eq(cell.dataset.state, 'missed', 'the state is on the element');
  assert(cell.textContent.trim().length > 0,
     'her highlighter system does not survive a grayscale print — the glyph must');
  assert((cell.getAttribute('aria-label') || '').includes('Ada'),
     'and a screen reader is told whose cell this is');
});

test('the percentage and the owed minutes sit in the sticky right columns', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-12', slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-19', slot,
                                    studentId: ada.id, status: 'missed' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-31');
  const row = attUiRow(doc, ada);
  const pct = row.querySelector('td.att-pct').textContent;
  assert(pct.includes('50%'), 'offered twice, present once — got ' + pct);
  assert(pct.includes('1 of 2'), 'the counts she writes in the note — got ' + pct);
  assert(row.querySelector('td.att-owed').textContent.includes('30'),
     'and the 30 minutes she owes for the session she missed');
});

test('a student with nothing offered reads as a dash', async () => {
  const w = await loadApp();
  const { bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-12-01', '2026-12-31');
  eq(attUiRow(doc, bo).querySelector('td.att-pct').textContent, '—',
     'not 0%, which reads as a child who never came');
});

test('an uncharted session is counted in plain sight beside the number', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-19');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct').textContent;
  assert(pct.includes('uncharted'),
     'a quarter with one charted session must not read as a confident 100% — got ' + pct);
});

test('the student filters narrow the grid', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const search = doc.querySelector('#attendance-search');
  assert(search, 'the grid is the second caller studentFilters was factored for');
  search.value = 'Ada';
  search.dispatchEvent(new w.Event('input'));
  await w.SLP.ui.render();
  assert(attUiRow(w.document, ada), 'Ada stays');
  assert(!attUiRow(w.document, bo), 'Bo is filtered out');
});

test('the legend names every glyph on the page', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const legend = doc.querySelector('#attendance-legend');
  assert(legend, 'the vocabulary is not something she should have to memorise');
  for (const word of ['held', 'absent', 'missed', 'cancelled', 'makeup']) {
    assert(legend.textContent.toLowerCase().includes(word), 'legend names ' + word);
  }
});

test('a month band groups the day numbers it repeats', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  // A quarter shows "1" three times; without the band nothing says which month.
  const doc = await attUiOpen(w, '2026-10-01', '2026-12-31');
  const band = Array.from(doc.querySelectorAll('#attendance-months .att-month'));
  eq(band.map(th => th.textContent), ['Oct 2026', 'Nov 2026', 'Dec 2026'], 'one per month');
  // Weekdays only, per attendanceGrid's own contract ("the grid shows weekdays only") —
  // 22/21/23 is the M-F count for Oct/Nov/Dec 2026, not the 31/30/31 calendar-day total.
  eq(band.map(th => Number(th.getAttribute('colspan'))), [22, 21, 23],
     'each band spans exactly its own weekdays, or it sits over the wrong columns');
  const days = doc.querySelectorAll('#attendance-grid thead th.att-day').length;
  eq(band.reduce((n, th) => n + Number(th.getAttribute('colspan')), 0), days,
     'the band and the day row must cover the same width');
});

test('a percentage over an incomplete range is styled as provisional', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-01', '2026-10-19');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct');
  assert(pct.textContent.includes('uncharted'), 'the count is there');
  assert(pct.classList.contains('att-pct-provisional'),
     'and the number itself looks unfinished — she reads it at a glance onto a note');
});

test('a fully charted range is not flagged as provisional', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_UI_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-05');
  const pct = attUiRow(doc, ada).querySelector('td.att-pct');
  assert(!pct.classList.contains('att-pct-provisional'),
     'flagging a complete number would make the flag mean nothing');
});

test('an end date before the start says so instead of emptying the caseload', async () => {
  const w = await loadApp();
  await attUiSeed(w);
  const doc = await attUiOpen(w, '2026-10-31', '2026-10-01');
  assert(doc.querySelector('#attendance-range-error'),
     'an empty grid alone reads as "my students are gone", not "I typed the dates backwards"');
  eq(doc.querySelector('#attendance-grid'), null, 'and no grid is drawn from a range that has no days');
});

function attUiPopover(doc) { return doc.querySelector('#att-popover'); }

async function attUiOpenCell(w, student, date) {
  attUiCells(w.document, student, date)[0].click();
  await w.SLP.ui.render();
  return attUiPopover(w.document);
}

test('clicking a cell offers the four outcomes rather than cycling', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  assert(pop, 'a popover, not a click-to-cycle');
  const offered = Array.from(pop.querySelectorAll('.att-choice'))
    .map(b => b.dataset.status).sort();
  eq(offered, ['absent', 'cancelled', 'missed', 'present'],
     'four states means overshooting, and cycling hides the vocabulary');
});

test('the popover renders adjacent to the row being marked, not at the end of the section', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  // On a real 49-student caseload the grid runs well past a screen's height — a popover
  // appended after the whole grid can land a thousand pixels below the row she clicked.
  // It belongs immediately after her row, in its own full-width table row.
  const popRow = pop.closest('tr');
  assert(popRow, 'the popover lives inside the table, next to her row, not after it');
  eq(popRow.previousElementSibling, attUiRow(w.document, ada),
     'the popover row is the very next sibling of the row she clicked');
});

test('picking an outcome writes it and closes the popover', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice[data-status="missed"]').click();
  await w.SLP.ui.render();

  eq(attUiCells(w.document, ada, ATT_UI_MONDAY)[0].dataset.state, 'missed',
     'the cell shows what she chose');
  assert(!attUiPopover(w.document), 'and the popover is gone');
});

test('a mark made in the grid shows up in the owed column immediately', async () => {
  const w = await loadApp();
  const { ada } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-01', '2026-10-31');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice[data-status="missed"]').click();
  await w.SLP.ui.render();
  assert(attUiRow(w.document, ada).querySelector('td.att-owed').textContent.includes('30'),
     'the Owed column is the answer to "who needs makeup sessions"');
});

test('the popover can mark the whole session at once', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  const pop = await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  pop.querySelector('.att-choice-session[data-status="cancelled"]').click();
  await w.SLP.ui.render();

  eq(attUiCells(w.document, ada, ATT_UI_MONDAY)[0].dataset.state, 'cancelled', 'Ada');
  eq(attUiCells(w.document, bo, ATT_UI_MONDAY)[0].dataset.state, 'cancelled',
     'a snow day closed the school for everyone in the room');
});

test('only one popover is open at a time', async () => {
  const w = await loadApp();
  const { ada, bo } = await attUiSeed(w);
  await attUiOpen(w, '2026-10-05', '2026-10-09');
  await attUiOpenCell(w, ada, ATT_UI_MONDAY);
  await attUiOpenCell(w, bo, ATT_UI_MONDAY);
  eq(w.document.querySelectorAll('#att-popover').length, 1, 'exactly one');
  eq(attUiPopover(w.document).dataset.studentId, bo.id, 'and it is the one she just clicked');
});

test('marking a day the schedule never had still works', async () => {
  const w = await loadApp();
  const { ada, slot } = await attUiSeed(w);
  // A one-off session on a Wednesday: no slot, so the cell comes from the session.
  // Written straight to the store because Task 9's bookMakeup does not exist yet — and
  // this test is about marking an ad-hoc cell, not about how it came to be booked.
  await w.SLP.db.put('sessions', w.SLP.model.session({
    date: '2026-10-07', slotId: null, startTime: '11:00', endTime: '11:30',
    roster: [ada.id] }));
  const doc = await attUiOpen(w, '2026-10-05', '2026-10-09');
  const cells = attUiCells(doc, ada, '2026-10-07');
  eq(cells.length, 1, 'the ad-hoc session has a cell');
  cells[0].click();
  await w.SLP.ui.render();
  const pop = attUiPopover(w.document);
  pop.querySelector('.att-choice[data-status="present"]').click();
  await w.SLP.ui.render();
  eq(attUiCells(w.document, ada, '2026-10-07')[0].dataset.state, 'present',
     'a session with no slot is still markable');
});
