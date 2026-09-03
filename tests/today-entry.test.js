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
  await new Promise(res => { frame.onload = res; frame.src = '../index.html?t=' + Date.now(); });
  const w2 = frame.contentWindow;
  await w2.SLP.ready;
  await w2.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  eq(inputFor(w2.document, ada, obj, achieved).value, '3', 'still there tomorrow');
});

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

// A booked makeup shows on Today — that is what a slotless session is for — so the
// Absent toggle is a second door onto the row ADR 0002 protects. The first door, an
// emptied note, is pinned in tests/attendance-store.test.js:65-97; this pair pins the
// toggle. Undoing the absence must undo the charting, not the appointment.
// 2026-09-09 is a Wednesday: no slot falls on it, so the makeup is the only entry and
// Ada has exactly one block on the page.
const ENTRY_MAKEUP_DAY = '2026-09-09';

test('undoing an absence on a booked makeup keeps the booking', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  const { session } = await w.SLP.store.bookMakeup({
    date: ENTRY_MAKEUP_DAY, startTime: '11:00', endTime: '11:30', studentId: ada.id });
  await w.SLP.ui.go({ tab: 'today', date: ENTRY_MAKEUP_DAY });

  const sel = '.student-block[data-student-id="' + ada.id + '"] .absent-toggle';
  w.document.querySelector(sel).click();                    // he did not show
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();
  w.document.querySelector(sel).click();                    // wrong child — undo it
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 1, 'the appointment she scheduled survives an undone absence');
  eq(rows[0].status, null, 'back to booked-but-unmarked, not held and not absent');
  eq(rows[0].isMakeup, true,
     'and still flagged, or the credit never accrues, the debt silently returns, and ' +
     'the grid can no longer cancel it');
});

test('undoing an absence on an ordinary session still withdraws the mark', async () => {
  const w = await loadApp();
  const { ada } = await seedEntryDay(w);
  await w.SLP.ui.go({ tab: 'today', date: MONDAY2 });
  const sel = '.student-block[data-student-id="' + ada.id + '"] .absent-toggle';
  w.document.querySelector(sel).click();
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();
  w.document.querySelector(sel).click();
  await w.SLP.ui.today.flush(); await w.SLP.ui.render();

  const rows = (await w.SLP.db.getAll('attendance')).filter(r => r.studentId === ada.id);
  eq(rows.length, 0,
     'the makeup carve-out is an exception, not a new general rule — this row still goes');
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
