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
    { date: '2026-09-21', dp: dpWith(w, obj, 3) }, // 3/4 - miss (3 < 4, criterion is achieved >= target)
  ];
  eq(w.SLP.derive.mastery(obj, rows), { met: 1, of: 3, window: 3, mastered: false },
     'met criterion in 1 of the last 3');
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
