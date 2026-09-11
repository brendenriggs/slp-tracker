// The failure mode these cover was found by probing a real upgrade, not by the suite:
// 1.11.0 holds the database open at the version it knew, so the tab she reloads onto a
// newer version is refused and shows her nothing. The app is served from one URL she keeps
// open, so a stale tab is ordinary, not exotic.
//
// Helpers here are prefixed `upg` — test files share one global scope.
function upgRaceANewerVersion(w, version = 99) {
  return new Promise(res => {
    const req = w.indexedDB.open('slp-tracker', version);
    req.onsuccess = () => { req.result.close(); res('upgraded'); };
    req.onblocked = () => res('blocked');
    req.onerror = () => res('error');
    setTimeout(() => res('hung'), 4000);
  });
}

test('a newer version opening in another tab is not blocked by this one', async () => {
  const w = await loadApp();
  await w.SLP.db.getAll('students');          // hold a connection, as normal use does
  const outcome = await upgRaceANewerVersion(w);
  eq(outcome, 'upgraded',
     'the tab holding the database must yield, or the tab she is using shows her nothing');
});

test('a tab left behind by an upgrade says what to do instead of failing blank', async () => {
  const w = await loadApp();
  await w.SLP.db.getAll('students');
  await upgRaceANewerVersion(w);
  const e = await throws(() => w.SLP.db.open(),
                         'a tab whose database moved on must refuse rather than guess');
  assert(/reload/i.test(e.message),
         'the message must tell her what to do about it, got: ' + e.message);
});

test('a database that will not open puts a readable sentence on the page', async () => {
  const w = await loadApp();
  w.SLP.ui.fatal('This app is open in another tab running an older version.');
  const app = w.document.querySelector('#app');
  assert(/another tab/.test(app.textContent),
         'she is told what happened, got: ' + app.textContent);
  // Blank is the failure being fixed, so the message has to be drawn, not merely present.
  const box = app.querySelector('#fatal').getBoundingClientRect();
  assert(box.width > 100 && box.height > 20,
         'the message must actually be drawn, got ' + box.width + 'x' + box.height);
});

test('her data is untouched by any of this', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await upgRaceANewerVersion(w);
  // A yielded connection must not have thrown her records away — the tab is stale, the
  // database is not. Reading it back takes a connection of our own, since the app's is gone.
  const names = await new Promise(res => {
    const req = w.indexedDB.open('slp-tracker');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('students', 'readonly');
      const all = tx.objectStore('students').getAll();
      all.onsuccess = () => { const rows = all.result; db.close(); res(rows.map(s => s.name)); };
    };
  });
  eq(names, ['Ada'], 'the caseload is still there');
});
