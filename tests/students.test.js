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
  // Each field row has its own .field-type select; check one row's options,
  // not all of them concatenated across the objective's fields.
  const opts = Array.from(doc.querySelector(objSel(obj) + ' .field-type').options)
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

test('the student heading names a grade the way she would say it', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada', grade: '3' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openStudents(w, ada.id);
  eq(doc.querySelector('h2').textContent, 'Ada · 3rd grade', 'ordinal, not a bare number');
});

test('the student heading drops the grade when there is none', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openStudents(w, ada.id);
  eq(doc.querySelector('h2').textContent, 'Ada', 'no dangling separator');
});
