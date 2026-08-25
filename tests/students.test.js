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

test('the grade filter narrows the list', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada', grade: '3' }));
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Bo', grade: '7' }));
  const doc = await openStudents(w);
  setInput(doc.querySelector('#student-grade-filter'), '3');
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada'], 'only the third grader');
});

test('the school filter narrows the list', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada', school: 'Lincoln Elementary' }));
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Bo', school: 'Roosevelt Middle' }));
  const doc = await openStudents(w);
  setInput(doc.querySelector('#student-school-filter'), 'Lincoln Elementary');
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada'], 'only the Lincoln student');
});

// A former student's school would be an option that can never match anything here, since
// this list is active-only. Offering it would just be a dead end.
test('the school filter offers only the schools of active students', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada', school: 'Lincoln Elementary' }));
  const gone = w.SLP.model.student({ name: 'Gus', school: 'Jefferson Elementary' });
  await w.SLP.store.saveStudent(gone);
  await w.SLP.store.setStudentActive(gone.id, false);
  const doc = await openStudents(w);
  const opts = Array.from(doc.querySelectorAll('#student-school-filter option')).map(o => o.value);
  eq(opts, ['', 'Lincoln Elementary'], 'the former student\'s school is not offered');
});

test('the filters and the search narrow together', async () => {
  const w = await loadApp();
  const at = (name, grade, school) =>
    w.SLP.store.saveStudent(w.SLP.model.student({ name, grade, school }));
  await at('Ada', '3', 'Lincoln Elementary');
  await at('Abe', '7', 'Lincoln Elementary');
  await at('Bo', '3', 'Lincoln Elementary');
  await at('Ann', '3', 'Roosevelt Middle');
  const doc = await openStudents(w);
  // One control at a time, as she would: each change re-renders before the next.
  setInput(doc.querySelector('#student-school-filter'), 'Lincoln Elementary');
  await w.SLP.ui.render();
  setInput(doc.querySelector('#student-grade-filter'), '3');
  await w.SLP.ui.render();
  setInput(doc.querySelector('#student-search'), 'a');
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada'], 'name, grade and school all constrain');
});

test('clearing a filter restores the rest of the caseload', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada', school: 'Lincoln Elementary' }));
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Bo', school: 'Roosevelt Middle' }));
  const doc = await openStudents(w);
  setInput(doc.querySelector('#student-school-filter'), 'Lincoln Elementary');
  await w.SLP.ui.render();
  setInput(doc.querySelector('#student-school-filter'), '');
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada', 'Bo'], 'everyone is back');
});

// She can strand a filter from the Schedule tab: move the last student out of a school and
// the option she is filtering by no longer exists. Left alone that reads as an empty
// caseload beside a select showing nothing, with no obvious way back.
test('a filter whose school no longer exists lets go', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada', school: 'Lincoln Elementary' });
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Bo', school: 'Roosevelt Middle' }));
  const doc = await openStudents(w);
  setInput(doc.querySelector('#student-school-filter'), 'Lincoln Elementary');
  await w.SLP.ui.render();
  await w.SLP.store.updateStudentDetails(ada.id, { school: 'Roosevelt Middle' });
  await w.SLP.ui.render();
  const names = Array.from(doc.querySelectorAll('#student-list .student-row'))
    .map(r => r.dataset.studentName);
  eq(names, ['Ada', 'Bo'], 'the caseload comes back rather than reading as empty');
  eq(doc.querySelector('#student-school-filter').value, '', 'and the control agrees');
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

// ===========================================================================
// Caseload management, merged in from the Schedule tab. Two tabs each showing
// a filtered list of the same students was one list too many: which one you
// opened depended on whether you wanted to read a goal or fix a grade, and
// nothing on screen said so. Adding, editing and removing now live with the
// students they act on, and the Schedule tab is just the schedule.
// ===========================================================================

async function seed(w, name, grade, school) {
  const s = w.SLP.model.student({ name, grade, school });
  await w.SLP.store.saveStudent(s);
  return s;
}
const listNames = doc => Array.from(doc.querySelectorAll('#student-list .student-row'))
  .map(r => r.dataset.studentName);

// --- adding ----------------------------------------------------------------

// Adding is start-of-year work, so it stays one button until asked for. The
// button sits under the filters rather than below the list: at 49 students the
// bottom of the list is a scroll away, and she should not have to hunt for it.
test('the add-student button sits under the filters, not below the list', async () => {
  const w = await loadApp();
  await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w);
  const button = doc.querySelector('#add-student-toggle');
  assert(button, 'the button exists');
  const filters = doc.querySelector('.student-filters');
  const list = doc.querySelector('#student-list');
  // Document order, not pixels: filters, then the button, then the list.
  assert(filters.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
         'it comes after the filters');
  assert(button.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
         'and before the list');
});

test('the add form stays shut until she asks for it', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  eq(doc.querySelector('#new-student-name'), null, 'no form yet');
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  assert(doc.querySelector('#new-student-name'), 'and there it is');
});

test('adding a student puts them on the list', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#new-student-name'), 'Ada Byron');
  setInput(doc.querySelector('#new-student-grade'), '3');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  eq(listNames(doc), ['Ada Byron'], 'listed');
  eq((await w.SLP.store.listStudents({})).length, 1, 'and saved');
});

test('adding a student with a blank name is refused', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#new-student-name'), '   ');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).length, 0, 'nothing saved');
});

test('backing out of adding leaves no student and no form', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#new-student-name'), 'Ada');
  doc.querySelector('#cancel-add-student').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#new-student-name'), null, 'the form is gone');
  eq((await w.SLP.store.listStudents({})).length, 0, 'and nobody was added');
});

// The form and a student's goals compete for the same pane, so opening one
// must close the other rather than leaving her looking at a stale form.
test('picking a student closes the add form', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', '');
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  doc.querySelector('.student-row[data-student-id="' + ada.id + '"] .open-student').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#new-student-name'), null, 'the form gave way');
  assert(doc.querySelector('#student-detail'), 'and her goals are showing');
});

test('the grade field offers Pre-K through 12th instead of an empty box', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  const values = Array.from(doc.querySelectorAll('#new-student-grade option')).map(o => o.value);
  eq(values[0], '', 'grade stays optional');
  assert(values.includes('PK') && values.includes('12'), 'Pre-K through 12th');
});

test('a school already on file is offered as an option', async () => {
  const w = await loadApp();
  await seed(w, 'Ada', '', 'Lincoln Elementary');
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  const listId = doc.querySelector('#new-student-school').getAttribute('list');
  const opts = Array.from(doc.querySelectorAll('#' + listId + ' option')).map(o => o.value);
  assert(opts.includes('Lincoln Elementary'), 'offered rather than retyped');
});

test('the school box says it can be picked, not only typed', async () => {
  const w = await loadApp();
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#new-student-school').placeholder, 'School — pick or type',
     'the empty box advertises the list');
});

test('typing a known school in a different case does not fork the list', async () => {
  const w = await loadApp();
  await seed(w, 'Ada', '', 'Lincoln Elementary');
  const doc = await openStudents(w);
  doc.querySelector('#add-student-toggle').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#new-student-name'), 'Bo Peep');
  setInput(doc.querySelector('#new-student-school'), 'lincoln elementary');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  const schools = (await w.SLP.store.listStudents({})).map(s => s.school);
  eq(schools.filter(s => /lincoln/i.test(s)), ['Lincoln Elementary', 'Lincoln Elementary'],
     'one spelling, not two');
});

// --- the heading, and editing it -------------------------------------------

test('the heading names the school after the grade', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  eq(doc.querySelector('#student-detail h2').textContent, 'Ada · 3rd grade · Lincoln Elementary',
     'name, grade, school');
});

test('a student with a school but no grade skips straight to the school', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  eq(doc.querySelector('#student-detail h2').textContent, 'Ada · Lincoln Elementary',
     'no dangling separator');
});

test('the edit button sits with the heading it edits', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  const button = doc.querySelector('#edit-student');
  assert(button, 'the button exists');
  assert(doc.querySelector('#student-detail').firstElementChild.contains(button),
         'inside the heading row, not adrift further down');
});

test('a mistyped school can be corrected from the heading', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincon Elementry');
  const doc = await openStudents(w, ada.id);
  doc.querySelector('#edit-student').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#edit-student-school'), 'Lincoln Elementary');
  setInput(doc.querySelector('#edit-student-grade'), '4');
  doc.querySelector('#save-student').click();
  await w.SLP.ui.render();
  const saved = (await w.SLP.store.listStudents({}))[0];
  eq(saved.school, 'Lincoln Elementary', 'school corrected');
  eq(saved.grade, '4', 'grade corrected');
  eq(doc.querySelector('#student-detail h2').textContent, 'Ada · 4th grade · Lincoln Elementary',
     'and the heading re-reads');
});

test('backing out of an edit changes nothing', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  doc.querySelector('#edit-student').click();
  await w.SLP.ui.render();
  setInput(doc.querySelector('#edit-student-school'), 'Somewhere Else');
  doc.querySelector('#cancel-student-edit').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({}))[0].school, 'Lincoln Elementary', 'untouched');
  eq(doc.querySelector('#edit-student-school'), null, 'and the heading is back to reading');
});

test('a corrected school stops being offered once nobody uses it', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '', 'Lincon Elementry');
  await seed(w, 'Bo', '', 'Roosevelt Middle');
  await w.SLP.store.updateStudentDetails(ada.id, { school: 'Roosevelt Middle' });
  const doc = await openStudents(w);
  const opts = Array.from(doc.querySelectorAll('#student-school-filter option')).map(o => o.value);
  eq(opts, ['', 'Roosevelt Middle'], 'the typo is gone from the list');
});

// --- removing --------------------------------------------------------------

// Far down the pane, below the goals, so it is nowhere near anything she
// presses often — and armed rather than immediate, the same two-step the
// objective delete uses, so one stray click can never empty a caseload.
test('remove from caseload is the last thing in the pane', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  const button = doc.querySelector('#remove-student');
  assert(button, 'the button exists');
  const detail = doc.querySelector('#student-detail');
  assert(detail.lastElementChild.contains(button), 'it is the last block in the pane');
});

test('removing a student needs the second click', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  doc.querySelector('#remove-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({ activeOnly: true })).length, 1, 'the first click only arms');
  assert(/remove ada/i.test(doc.querySelector('#student-detail').textContent), 'and asks by name');
  doc.querySelector('#confirm-remove-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({ activeOnly: true })).length, 0, 'off the caseload');
  eq((await w.SLP.store.listStudents({})).length, 1, 'but the record is kept');
});

test('backing out of a removal keeps the student', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openStudents(w, ada.id);
  doc.querySelector('#remove-student').click();
  await w.SLP.ui.render();
  doc.querySelector('#cancel-remove-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({ activeOnly: true })).length, 1, 'still on the caseload');
  assert(doc.querySelector('#remove-student'), 'and the button is back to resting');
});

// Arming one student and opening another must not leave the second student
// showing a primed confirmation she never asked for.
test('arming a removal does not follow her to the next student', async () => {
  const w = await loadApp();
  const ada = await seed(w, 'Ada', '3', '');
  const bo = await seed(w, 'Bo', '4', '');
  const doc = await openStudents(w, ada.id);
  doc.querySelector('#remove-student').click();
  await w.SLP.ui.render();
  await w.SLP.ui.go({ studentId: bo.id });
  assert(doc.querySelector('#remove-student'), 'Bo shows the resting button');
  eq(doc.querySelector('#confirm-remove-student'), null, 'not a primed one');
});

// --- former students -------------------------------------------------------

test('former students are counted under the list', async () => {
  const w = await loadApp();
  await seed(w, 'Ada', '', '');
  const gone = await seed(w, 'Gus', '', '');
  await w.SLP.store.setStudentActive(gone.id, false);
  const doc = await openStudents(w);
  const note = doc.querySelector('#inactive-note');
  assert(note, 'the note is there');
  assert(/1 former student/.test(note.textContent), 'and counts them');
  eq(listNames(doc), ['Ada'], 'without listing them');
});

// --- the schedule tab is now just the schedule -----------------------------

test('the schedule tab no longer carries the caseload', async () => {
  const w = await loadApp();
  await seed(w, 'Ada', '3', 'Lincoln Elementary');
  await w.SLP.ui.go({ tab: 'schedule' });
  const doc = w.document;
  eq(doc.querySelector('#caseload-editor'), null, 'no caseload panel');
  eq(doc.querySelector('#add-student'), null, 'no add form');
  assert(doc.querySelector('#week-grid'), 'the week grid is what is there');
});
