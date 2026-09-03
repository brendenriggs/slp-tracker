// Where the page lands after a render.
//
// Every render tears #app down and rebuilds it, and nothing on the page is its own
// scroll container — the document is what scrolls. So doRender saves window.scrollY and
// puts it back, but only when the route says she is still in the same place. Getting
// that judgment wrong is invisible to every other test in the suite: the DOM is
// identical either way, and only the offset differs.
//
// Helpers here are prefixed `scr` — tests/index.html loads every *.test.js into ONE
// global scope, so an unprefixed `seedDay` would silently overwrite another file's.

const SCR_MON = '2026-09-07';         // a Monday
const SCR_NEXT_MON = '2026-09-14';

// Tall enough to scroll inside the 800px test frame, on both Mondays.
async function scrSeedTallDay(w, count = 12) {
  const m = w.SLP.model, st = w.SLP.store;
  const students = [];
  for (let i = 0; i < count; i++) {
    const s = m.student({ name: 'Student ' + String(i).padStart(2, '0'), grade: '3' });
    await st.saveStudent(s);
    students.push(s);
  }
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: students.map(s => s.id), location: 'Room 4' });
  await st.saveSlot(slot);
  return { students, slot };
}

const scrMaxScroll = w =>
  Math.max(0, w.document.documentElement.scrollHeight - w.innerHeight);

test('the page is tall enough for these tests to mean anything', async () => {
  const w = await loadApp();
  await scrSeedTallDay(w);
  await w.SLP.ui.go({ tab: 'today', date: SCR_MON });
  assert(scrMaxScroll(w) > 100,
     'a document that cannot scroll makes every assertion below vacuously true — got ' +
     scrMaxScroll(w));
});

test('re-rendering the day she is on leaves her where she was reading', async () => {
  const w = await loadApp();
  await scrSeedTallDay(w);
  await w.SLP.ui.go({ tab: 'today', date: SCR_MON });
  w.scrollTo(0, 200);

  await w.SLP.ui.render();

  eq(w.scrollY, 200,
     'this is the fix that exists — a re-render in place must not throw her to the header');
});

test('paging to another day starts at the top', async () => {
  const w = await loadApp();
  await scrSeedTallDay(w);
  await w.SLP.ui.go({ tab: 'today', date: SCR_MON });
  w.scrollTo(0, 200);

  await w.SLP.ui.go({ date: SCR_NEXT_MON });

  // Today already treats a different date as a fresh page — it clears the expanded
  // cards on exactly this condition. The scroll position was left out of that judgment,
  // so she arrived at a new day already scrolled into the middle of it, looking at a
  // different child than the one she left off on.
  eq(w.scrollY, 0, 'a different day is somewhere new, not a re-render in place');
});

test('coming back to the day she left resets rather than restoring', async () => {
  const w = await loadApp();
  await scrSeedTallDay(w);
  await w.SLP.ui.go({ tab: 'today', date: SCR_MON });
  w.scrollTo(0, 200);
  await w.SLP.ui.go({ date: SCR_NEXT_MON });

  await w.SLP.ui.go({ date: SCR_MON });

  eq(w.scrollY, 0,
     'arriving is arriving — the offset is not a per-day bookmark she can page back into');
});

test('switching tabs still starts at the top', async () => {
  const w = await loadApp();
  await scrSeedTallDay(w);
  await w.SLP.ui.go({ tab: 'today', date: SCR_MON });
  w.scrollTo(0, 200);

  await w.SLP.ui.go({ tab: 'students' });

  eq(w.scrollY, 0, 'the behaviour the date fix must not disturb');
});

// The other half of "content shrank under the saved offset". There is no fix here, and
// these two tests exist to say why — the browser's own clamp is load-bearing, and a rule
// like "if the offset no longer fits, go to the top" breaks the second case badly.

async function scrFilterStudents(w, term) {
  const search = w.document.querySelector('#student-search');
  assert(search, 'the students list has a search box');
  search.value = term;
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  await w.SLP.ui.render();
}

test('filtering a long list down to almost nothing lands her at the top', async () => {
  const w = await loadApp();
  const { students } = await scrSeedTallDay(w, 20);
  await w.SLP.ui.go({ tab: 'students' });
  w.scrollTo(0, scrMaxScroll(w));
  assert(w.scrollY > 0, 'she is genuinely scrolled down the caseload');

  await scrFilterStudents(w, students[0].name);

  // No special case does this: one result is shorter than the viewport, so the page
  // cannot hold any offset at all and the browser clamps to 0. The right thing happens
  // for free, which is why the fix below is only about the date.
  eq(scrMaxScroll(w), 0, 'one result does not fill the window');
  eq(w.scrollY, 0, 'so she reads her result from the top, without a special case');
});

test('a page that shrinks but still scrolls keeps her near the end, deliberately', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  // Half the caseload shares a name fragment, so filtering on it leaves a list that is
  // still taller than the frame. A filter that drops below one screen lands at 0 by
  // clamping alone (the test above) and cannot tell us anything about this case.
  for (let i = 0; i < 30; i++) {
    await w.SLP.store.saveStudent(m.student({ name: 'Ann Student ' + i, grade: '3' }));
    await w.SLP.store.saveStudent(m.student({ name: 'Bob Student ' + i, grade: '3' }));
  }
  await w.SLP.ui.go({ tab: 'students' });
  w.scrollTo(0, scrMaxScroll(w));
  const before = scrMaxScroll(w);

  await scrFilterStudents(w, 'Ann');          // 30 of 60 — shorter, still taller than the frame

  const after = scrMaxScroll(w);
  assert(after > 0 && after < before,
     'the page shrank but still scrolls — ' + before + ' to ' + after);
  eq(w.scrollY, after,
     'she stays at the clamped bottom rather than being thrown to the header. Landing at ' +
     'the top whenever the offset no longer fits would fire every time she collapses a ' +
     'card while reading the end of a long day, which is worse than where she lands here');
});
