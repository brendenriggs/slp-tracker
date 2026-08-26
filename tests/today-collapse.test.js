// Today opens on plain-text notes. Goals and objectives are a click away.
//
// She works notes-first: type what happened in prose during the session, and
// extrapolate it into objective data later. The data-entry grid being the
// default made every card taller than the thing she actually needed.

const COLLAPSE_MON = '2026-09-07';   // a Monday

async function seedCollapseDay(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve receptive language' });
  await st.saveGoal(goal);
  const o1 = m.objective({ goalId: goal.id, text: 'STUDENT will identify common objects' });
  const o2 = m.objective({ goalId: goal.id, text: 'STUDENT will follow two-step directions' });
  await st.saveObjective(o1); await st.saveObjective(o2);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, bo, goal, o1, o2, slot };
}

function blockFor(doc, student) {
  return doc.querySelector('.student-block[data-student-id="' + student.id + '"]');
}

async function openCollapseDay(w, date = COLLAPSE_MON) {
  await w.SLP.ui.go({ tab: 'today', date });
  return w.document;
}

test('a student opens collapsed, with the note in reach and the grid put away', async () => {
  const w = await loadApp();
  const { ada } = await seedCollapseDay(w);
  const doc = await openCollapseDay(w);
  const block = blockFor(doc, ada);

  const area = block.querySelector('.objective-area');
  assert(area, 'the goal and objective rows live in one collapsible area');
  eq(area.querySelectorAll('.objective-row').length, 2, 'both objectives are in it');
  assert(area.hidden, 'put away — she is writing prose, not tallying trials');
  assert(!block.querySelector('.note-input').hidden, 'the note is the thing she needs');
});

test('the disclosure opens a student’s data entry', async () => {
  const w = await loadApp();
  const { ada } = await seedCollapseDay(w);
  const doc = await openCollapseDay(w);
  const btn = blockFor(doc, ada).querySelector('.disclosure');
  assert(btn, 'a control to open it');
  eq(btn.getAttribute('aria-expanded'), 'false', 'which says it is shut');
  eq(btn.textContent, '▸', 'and points the way it opens');

  btn.click();

  const block = blockFor(doc, ada);
  const now = block.querySelector('.disclosure');
  assert(!block.querySelector('.objective-area').hidden, 'open');
  eq(now.getAttribute('aria-expanded'), 'true', 'and says so');
  eq(now.textContent, '▾', 'and turns to match');
});

// The reason expansion cannot live on the element. Marking anyone absent runs
// SLP.ui.render(), and doRender() clears #app outright — so a card opened by
// hand would slam shut every time she touched someone else's attendance.
test('a student she opened stays open when another is marked absent', async () => {
  const w = await loadApp();
  const { ada, bo } = await seedCollapseDay(w);
  const doc = await openCollapseDay(w);
  blockFor(doc, ada).querySelector('.disclosure').click();

  blockFor(doc, bo).querySelector('.absent-toggle').click();
  await w.SLP.ui.today.flush();

  const block = blockFor(doc, ada);
  assert(!block.querySelector('.objective-area').hidden, 'still open, mid data entry');
  eq(block.querySelector('.disclosure').getAttribute('aria-expanded'), 'true', 'and says so');
  assert(blockFor(doc, bo).querySelector('.objective-area').hidden, 'Bo was never opened');
});

async function chartObjective(w, student, objective, value) {
  const achieved = objective.fields.find(f => f.role === 'achieved');
  const el = w.document.querySelector('.student-block[data-student-id="' + student.id + '"] ' +
    '.objective-row[data-objective-id="' + objective.id + '"] ' +
    '.value-input[data-field-id="' + achieved.id + '"]');
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.today.flush();
}

// Collapsing must not hide data silently. Deleting a goal used to leave its
// datapoints alive and invisible; the same shape of mistake is available here.
test('a collapsed card says how much of it is already charted', async () => {
  const w = await loadApp();
  const { ada, o1 } = await seedCollapseDay(w);
  const doc = await openCollapseDay(w);
  assert(blockFor(doc, ada).querySelector('.student-charted').hidden,
         'nothing charted yet, so nothing is hidden and nothing is said');

  await chartObjective(w, ada, o1, '3');

  const count = blockFor(doc, ada).querySelector('.student-charted');
  assert(!count.hidden, 'the card now has something to account for');
  eq(count.textContent, '1 of 2 charted',
     'her morning’s work is visible without opening the card');
});

test('a different day starts collapsed again', async () => {
  const w = await loadApp();
  const { ada } = await seedCollapseDay(w);
  const doc = await openCollapseDay(w);
  blockFor(doc, ada).querySelector('.disclosure').click();

  await w.SLP.ui.go({ tab: 'today', date: '2026-09-14' });   // the following Monday

  assert(blockFor(w.document, ada).querySelector('.objective-area').hidden,
         'a fresh day is a fresh page, not yesterday’s half-open cards');
});
