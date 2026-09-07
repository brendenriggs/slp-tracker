// The ad-hoc session button on Today. Every top-level name is prefixed `adhoc` —
// tests/index.html loads each *.test.js into ONE global scope.
//
// Her words, 2026-09-06: "she should be able to hit an 'ad-hoc session' button at top
// of the today page that lets her configure a time and students". The domain already
// had **Ad-hoc session** — a session belonging to no slot, which planForDate folds into
// Today — so what these tests pin is the affordance, not a new kind of record.

const ADHOC_MONDAY = '2026-09-07';

async function adhocSeed(w, { withSlot = true } = {}) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve receptive language' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will identify common objects' });
  await st.saveObjective(obj);
  let slot = null;
  if (withSlot) {
    slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                    studentIds: [ada.id], location: 'Room 4' });
    await st.saveSlot(slot);
  }
  return { ada, bo, goal, obj, slot };
}

async function adhocOpenForm(w, date = ADHOC_MONDAY) {
  await w.SLP.ui.go({ tab: 'today', date });
  w.document.querySelector('#adhoc-open').click();
  await w.SLP.ui.render();
  return w.document;
}

function adhocPick(w, student) {
  const box = w.document
    .querySelector('#adhoc-students input[data-student-id="' + student.id + '"]');
  box.checked = true;
  box.dispatchEvent(new w.Event('change', { bubbles: true }));
}

function adhocFill(w, { start, end, where = '' }) {
  const set = (id, value) => { w.document.querySelector(id).value = value; };
  set('#adhoc-start', start);
  set('#adhoc-end', end);
  set('#adhoc-location', where);
}

async function adhocSave(w) {
  w.document.querySelector('#adhoc-save').click();
  await w.SLP.ui.render();
}

test('Today carries a button for a session that is not on the weekly schedule', async () => {
  const w = await loadApp();
  await adhocSeed(w, { withSlot: false });
  await w.SLP.ui.go({ tab: 'today', date: ADHOC_MONDAY });
  const button = w.document.querySelector('.day-bar #adhoc-open');
  assert(button, 'she asked for it at the top of the page, where the day already is');
  assert(/ad-hoc/i.test(button.textContent), 'named the way the app names it — got ' + button.textContent);
  assert(w.document.querySelector('.empty'),
     'and a day with nothing scheduled is exactly when she needs it');
});

test('the button opens a form for the time, place and students of one session', async () => {
  const w = await loadApp();
  const { ada, bo } = await adhocSeed(w);
  const doc = await adhocOpenForm(w);
  assert(doc.querySelector('#adhoc-form'), 'the form is open');
  assert(doc.querySelector('#adhoc-start') && doc.querySelector('#adhoc-end'),
     'a time she configures, per her own words');
  assert(doc.querySelector('#adhoc-location'), 'and somewhere to hold it');
  for (const s of [ada, bo]) {
    assert(doc.querySelector('#adhoc-students input[data-student-id="' + s.id + '"]'),
       'every student on the caseload can be put in it — ' + s.name + ' is missing');
  }
});

test('saving writes a session on the day she is looking at, belonging to no slot', async () => {
  const w = await loadApp();
  const { ada, bo } = await adhocSeed(w);
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:00', end: '13:30', where: 'Library' });
  adhocPick(w, ada); adhocPick(w, bo);
  await adhocSave(w);

  const sessions = await w.SLP.db.getAll('sessions');
  eq(sessions.length, 1, 'one session written');
  eq(sessions[0].slotId, null, 'an ad-hoc session belongs to no slot — that is what makes it one');
  eq(sessions[0].date, ADHOC_MONDAY, 'on the day the page was showing, not on the real clock');
  eq(sessions[0].startTime, '13:00', 'the time she configured');
  eq(sessions[0].endTime, '13:30', 'through the end she configured');
  eq(sessions[0].location, 'Library', 'and where she held it');
  eq(sessions[0].roster.sort(), [ada.id, bo.id].sort(), 'both students she ticked');
  eq(w.document.querySelector('#adhoc-form'), null, 'and the form puts itself away');
});

test('the ad-hoc session lands on Today and charts like any other', async () => {
  const w = await loadApp();
  const { ada } = await adhocSeed(w, { withSlot: false });
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:00', end: '13:30', where: 'Library' });
  adhocPick(w, ada);
  await adhocSave(w);

  const section = w.document.querySelector('.slot-section[data-slot-id="adhoc"]');
  assert(section, 'planForDate already folds a slotless session in — it shows with no further work');
  assert(/13:00/.test(section.textContent), 'at its own time — got ' + section.textContent);
  assert(/Library/.test(section.textContent), 'and its own place');
  assert(section.querySelector('.student-block[data-student-id="' + ada.id + '"]'),
     'with her block, because it is a real session and not a reminder');
  eq(w.document.querySelector('#charted-count').textContent.trim(), '0 of 1 charted',
     'and the day counts it');
});

test('a session she has only just booked is uncharted, never silently present', async () => {
  const w = await loadApp();
  const { ada } = await adhocSeed(w, { withSlot: false });
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:00', end: '13:30' });
  adhocPick(w, ada);
  await adhocSave(w);

  eq((await w.SLP.db.getAll('attendance')).length, 0,
     'nothing happened yet — an attendance row here would credit an outcome she has not entered');
  const chip = w.document
    .querySelector('.student-block[data-student-id="' + ada.id + '"] .state-chip');
  eq(chip.dataset.state, 'none', 'so the chip says not charted');
});

test('a session with nobody in it is refused', async () => {
  const w = await loadApp();
  await adhocSeed(w);
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:00', end: '13:30' });
  await adhocSave(w);

  eq((await w.SLP.db.getAll('sessions')).length, 0, 'nothing written');
  assert(w.document.querySelector('.toast'), 'and she is told why');
  assert(w.document.querySelector('#adhoc-form'), 'and the form stays open rather than vanishing');
});

test('an end time before the start is refused in the app’s own words', async () => {
  const w = await loadApp();
  const { ada } = await adhocSeed(w);
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:30', end: '13:00' });
  adhocPick(w, ada);
  await adhocSave(w);

  eq((await w.SLP.db.getAll('sessions')).length, 0, 'nothing written');
  // Word for word what the schedule form and the makeup booking both say. One mistake
  // must not get three different sentences in one app.
  eq(w.document.querySelector('.toast').textContent, 'The end time must be after the start.',
     'the sentence the schedule form already uses');
});

test('Add session and Cancel are two controls, not one run-on', async () => {
  // Measured, not asserted by class: laid out as bare children of the panel the two
  // buttons touched edge to edge — "Add sessionCancel" — and every test above passed.
  // The house style for a layout claim is getBoundingClientRect (docs/AUTONOMY.md).
  const w = await loadApp();
  await adhocSeed(w);
  const doc = await adhocOpenForm(w);
  const save = doc.querySelector('#adhoc-save').getBoundingClientRect();
  const cancel = doc.querySelector('#adhoc-cancel').getBoundingClientRect();
  const gap = cancel.left - save.right;
  assert(gap >= 6, 'a destructive click is one pixel from the saving one — got ' +
     Math.round(gap) + 'px apart');
});

test('stepping to another day puts the form away', async () => {
  const w = await loadApp();
  const { ada } = await adhocSeed(w);
  await adhocOpenForm(w);
  adhocPick(w, ada);
  w.document.querySelector('#next-day').click();
  await w.SLP.ui.render();

  eq(w.document.querySelector('#adhoc-form'), null,
     'a different day is a fresh page — the same rule the open cards follow');
  w.document.querySelector('#adhoc-open').click();
  await w.SLP.ui.render();
  const box = w.document
    .querySelector('#adhoc-students input[data-student-id="' + ada.id + '"]');
  eq(box.checked, false, 'and the roster she picked did not follow her to a day it was not for');
});

test('cancelling writes nothing and puts the form away', async () => {
  const w = await loadApp();
  const { ada } = await adhocSeed(w);
  await adhocOpenForm(w);
  adhocFill(w, { start: '13:00', end: '13:30' });
  adhocPick(w, ada);
  w.document.querySelector('#adhoc-cancel').click();
  await w.SLP.ui.render();

  eq((await w.SLP.db.getAll('sessions')).length, 0, 'a form is not a booking');
  eq(w.document.querySelector('#adhoc-form'), null, 'and it is closed');
  assert(w.document.querySelector('#adhoc-open'), 'the button is still there to open it again');
});
