test('db round-trips an object', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  const got = await w.SLP.db.get('students', 's1');
  eq(got.name, 'Ada', 'stored student should come back');
});

test('db.get returns undefined for a missing id', async () => {
  const w = await loadApp();
  eq(await w.SLP.db.get('students', 'nope'), undefined, 'missing id');
});

test('db.getAllBy reads through an index', async () => {
  const w = await loadApp();
  await w.SLP.db.put('goals', { id: 'g1', studentId: 's1', text: 'A', order: 0 });
  await w.SLP.db.put('goals', { id: 'g2', studentId: 's1', text: 'B', order: 1 });
  await w.SLP.db.put('goals', { id: 'g3', studentId: 's2', text: 'C', order: 0 });
  const mine = await w.SLP.db.getAllBy('goals', 'studentId', 's1');
  eq(mine.map(g => g.id).sort(), ['g1', 'g2'], 'index should filter by studentId');
});

test('db.del removes a record', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  await w.SLP.db.del('students', 's1');
  eq(await w.SLP.db.get('students', 's1'), undefined, 'deleted student');
});

test('db.bulkPut writes many in one transaction', async () => {
  const w = await loadApp();
  await w.SLP.db.bulkPut('students', [
    { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' },
  ]);
  eq((await w.SLP.db.getAll('students')).length, 3, 'all three written');
});

test('db.clearAll empties every store', async () => {
  const w = await loadApp();
  await w.SLP.db.put('students', { id: 's1', name: 'Ada' });
  await w.SLP.db.put('sessions', { id: 'x1', date: '2026-09-01' });
  await w.SLP.db.clearAll();
  eq((await w.SLP.db.getAll('students')).length, 0, 'students cleared');
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'sessions cleared');
});

test('every declared store exists in the database', async () => {
  const w = await loadApp();
  const db = await w.SLP.db.open();
  for (const s of w.SLP.db.STORES) {
    assert(db.objectStoreNames.contains(s), 'missing object store: ' + s);
  }
});

test('data written by one app load is visible to the next', async () => {
  const w1 = await loadApp();
  await w1.SLP.db.put('students', { id: 'persist1', name: 'Ada' });
  // loadApp() wipes the DB, so reload the frame directly instead.
  const frame = document.getElementById('app-frame');
  await new Promise(res => { frame.onload = res; frame.src = '../slp-tracker.html?t=' + Date.now(); });
  const w2 = frame.contentWindow;
  await w2.SLP.ready;
  const got = await w2.SLP.db.get('students', 'persist1');
  eq(got && got.name, 'Ada', 'data should survive a reload');
});
