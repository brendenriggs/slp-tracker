async function seedHistory(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will identify objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await st.saveSlot(slot);
  const achieved = obj.fields.find(f => f.role === 'achieved').id;
  // Three Mondays: 2/4, 3/4, 4/4
  const days = [['2026-09-07', '2'], ['2026-09-14', '3'], ['2026-09-21', '4']];
  for (const [dateStr, raw] of days) {
    await st.recordValue({ dateStr, slot, studentId: ada.id, objectiveId: obj.id,
                           fieldId: achieved, raw });
  }
  return { ada, goal, obj, slot, achieved };
}

test('history is reverse chronological', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  const rows = await w.SLP.store.historyFor(ada.id, {});
  eq(rows.map(r => r.session.date), ['2026-09-21', '2026-09-14', '2026-09-07'], 'newest first');
});

test('history carries the note, attendance, and data for each session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedHistory(w);
  await w.SLP.store.saveNote({ dateStr: '2026-09-21', slot, studentId: ada.id, text: 'great day' });
  const rows = await w.SLP.store.historyFor(ada.id, {});
  eq(rows[0].note.text, 'great day', 'note');
  eq(rows[0].attendance.status, 'present', 'attendance');
  eq(rows[0].datapoints.length, 1, 'data');
});

test('history filters by date range', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  const rows = await w.SLP.store.historyFor(ada.id, { from: '2026-09-10', to: '2026-09-18' });
  eq(rows.map(r => r.session.date), ['2026-09-14'], 'inclusive range');
});

test('rowsForObjective is chronological', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  const rows = await w.SLP.store.rowsForObjective(ada.id, obj.id);
  eq(rows.map(r => r.date), ['2026-09-07', '2026-09-14', '2026-09-21'], 'oldest first');
});

test('the student detail renders a history section', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const rows = w.document.querySelectorAll('#session-history .history-row');
  eq(rows.length, 3, 'one row per session');
  assert(/September 21/.test(rows[0].textContent), 'newest first, formatted');
});

test('the history date filter narrows the rendered rows', async () => {
  const w = await loadApp();
  const { ada } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const from = w.document.querySelector('#history-from');
  from.value = '2026-09-14';
  from.dispatchEvent(new w.Event('change', { bubbles: true }));
  await w.SLP.ui.render();
  eq(w.document.querySelectorAll('#session-history .history-row').length, 2, 'filtered');
});

test('each objective gets its own chart', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const chart = w.document.querySelector('.objective-chart[data-objective-id="' + obj.id + '"] svg');
  assert(chart, 'chart rendered');
  eq(chart.querySelectorAll('.chart-point').length, 3, 'three sessions plotted');
});

test('chart points carry their date and value', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const pts = Array.from(w.document.querySelectorAll(
    '.objective-chart[data-objective-id="' + obj.id + '"] .chart-point'));
  eq(pts.map(p => p.dataset.value), ['50', '75', '100'], 'percentages over time');
  eq(pts[0].dataset.date, '2026-09-07', 'dated');
});

test('mastery is shown per objective', async () => {
  const w = await loadApp();
  const { ada, obj } = await seedHistory(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const text = w.document.querySelector(
    '.objective-chart[data-objective-id="' + obj.id + '"] .mastery').textContent;
  // Rows are 2/4, 3/4, 4/4 against the criterion achieved >= target: only the
  // last session (4/4) meets it, so 1 of the last 3 — see Task 5's mastery fix.
  assert(/1 of 3/.test(text), 'met criterion in 1 of the last 3, got: ' + text);
});

test('an objective with no data says so instead of drawing an empty chart', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await w.SLP.store.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'o' });
  await w.SLP.store.saveObjective(obj);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  const block = w.document.querySelector('.objective-chart[data-objective-id="' + obj.id + '"]');
  eq(block.querySelector('svg'), null, 'no chart');
  assert(/no data yet/i.test(block.textContent), 'says why');
});

test('a single data point still renders', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'o' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30', studentIds: [ada.id] });
  await st.saveSlot(slot);
  await st.recordValue({ dateStr: '2026-09-07', slot, studentId: ada.id, objectiveId: obj.id,
                         fieldId: obj.fields.find(f => f.role === 'achieved').id, raw: '3' });
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  eq(w.document.querySelectorAll('.objective-chart[data-objective-id="' + obj.id +
     '"] .chart-point').length, 1, 'one point, no divide-by-zero on the x scale');
});

// The chart tests above assert counts and data- attributes only, never geometry, so the
// suite stayed green while a point above criterion was drawn off the top of the SVG and
// clipped away. These four are the geometry the rest of the file does not look at — a
// wrong fix that keeps the ceiling at 100 passes every other test in this file.
// See docs/adr/0003-objective-charts-scale-past-criterion.md.
async function chartSeedAbove(w, raws) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'g' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'o' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await st.saveSlot(slot);
  const achieved = obj.fields.find(f => f.role === 'achieved').id;
  // The target field defaults to 4, so 5 trials is 125% — a real session, not a freak
  // value: exceeding criterion is what a child does on their best day.
  const days = ['2026-09-07', '2026-09-14', '2026-09-21'];
  for (let i = 0; i < raws.length; i++) {
    await st.recordValue({ dateStr: days[i], slot, studentId: ada.id, objectiveId: obj.id,
                           fieldId: achieved, raw: raws[i] });
  }
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  return w.document.querySelector('.objective-chart[data-objective-id="' + obj.id + '"] svg');
}

test('a score above criterion is drawn inside the chart, not clipped off the top', async () => {
  const w = await loadApp();
  const svg = await chartSeedAbove(w, ['2', '4', '5']);
  const box = svg.getAttribute('viewBox').split(' ').map(Number);
  const height = box[3];
  const pts = Array.from(svg.querySelectorAll('.chart-point'));
  eq(pts.map(p => p.dataset.value), ['50', '100', '125'], 'her best session is the 125%');
  for (const p of pts) {
    const cy = Number(p.getAttribute('cy'));
    assert(cy >= 0 && cy <= height,
       'every point sits within the drawing area — got cy ' + cy + ' against height ' + height);
  }
});

test('the best session is the highest point on the chart', async () => {
  const w = await loadApp();
  const svg = await chartSeedAbove(w, ['2', '4', '5']);
  const pts = Array.from(svg.querySelectorAll('.chart-point'));
  const cy = pts.map(p => Number(p.getAttribute('cy')));
  // A clipped point can still be "highest" by being most negative, so the check above
  // does the bounds work and this one does the ordering. y grows downward.
  assert(cy[2] < cy[1] && cy[1] < cy[0],
     'higher percentage, higher on the page — got ' + cy.join(', '));
});

test('the top tick reads the real ceiling, not a fixed 100%', async () => {
  const w = await loadApp();
  const svg = await chartSeedAbove(w, ['2', '4', '5']);
  const ticks = Array.from(svg.querySelectorAll('.chart-tick')).map(t => t.textContent);
  assert(ticks.includes('125%'),
     'an axis labelled 100% while a point sits above it is a lie — got ' + ticks.join(', '));
});

test('the criterion line stays at 100% once the ceiling rises above it', async () => {
  const w = await loadApp();
  const svg = await chartSeedAbove(w, ['2', '4', '5']);
  const line = svg.querySelector('.chart-criterion');
  assert(line, 'the ceiling no longer means "met the goal", so the line has to say it');
  const at100 = svg.querySelector('.chart-point[data-value="100"]');
  eq(Math.round(Number(line.getAttribute('y1'))),
     Math.round(Number(at100.getAttribute('cy'))),
     'and it is drawn at the height a 100% session plots at');
});

test('a chart that never exceeds criterion still tops out at 100%', async () => {
  const w = await loadApp();
  const svg = await chartSeedAbove(w, ['2', '3', '4']);
  const ticks = Array.from(svg.querySelectorAll('.chart-tick')).map(t => t.textContent);
  assert(ticks.includes('100%'),
     'the ceiling rises to fit the data, it does not shrink to it — got ' + ticks.join(', '));
});
