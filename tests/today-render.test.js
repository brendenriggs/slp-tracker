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
