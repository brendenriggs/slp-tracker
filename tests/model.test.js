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

test('the grade vocabulary runs Pre-K through 12th', async () => {
  const w = await loadApp();
  const grades = w.SLP.model.GRADES;
  eq(grades.length, 14, 'Pre-K, K, and twelve numbered grades');
  eq(grades[0].value, 'PK', 'Pre-K leads');
  eq(grades[1].value, 'K', 'kindergarten second');
  eq(grades[13].value, '12', 'twelfth last');
  eq(grades.filter(g => !g.value || !g.label).length, 0, 'every grade has a value and a label');
});

test('a numbered grade is stored as its number, not its ordinal', async () => {
  const w = await loadApp();
  const third = w.SLP.model.GRADES.find(g => g.label === '3rd grade');
  assert(third, 'third grade is offered');
  eq(third.value, '3', 'the number is what lands on the record');
});

test('grade labels read as prose, with the word grade only where it fits', async () => {
  const w = await loadApp();
  const label = w.SLP.model.gradeLabel;
  eq(label('PK'), 'Pre-K', 'no "grade" on Pre-K');
  eq(label('K'), 'Kindergarten', 'no "grade" on kindergarten');
  eq(label('1'), '1st grade', 'first is ordinal');
  eq(label('2'), '2nd grade', 'second is ordinal');
  eq(label('3'), '3rd grade', 'third is ordinal');
  eq(label('11'), '11th grade', 'eleventh is not 11st');
  eq(label('12'), '12th grade', 'twelfth is ordinal');
});

test('an unrecognised grade shows itself rather than vanishing', async () => {
  const w = await loadApp();
  const label = w.SLP.model.gradeLabel;
  eq(label('transition'), 'transition', 'an unknown value survives to the screen');
  eq(label(''), '', 'no grade renders as nothing');
  eq(label(undefined), '', 'a missing grade renders as nothing');
});
