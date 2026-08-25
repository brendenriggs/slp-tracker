test('the app boots into the Today tab', async () => {
  const w = await loadApp();
  eq(w.SLP.ui.route.tab, 'today', 'Today is where the work happens');
  const active = w.document.querySelector('.tab.active');
  eq(active.dataset.tab, 'today', 'and the Today tab is marked active');
});

test('the app boots to today’s date', async () => {
  const w = await loadApp();
  eq(w.SLP.ui.route.date, w.SLP.ui.todayStr(), 'defaults to today');
});

test('clicking a tab switches views', async () => {
  const w = await loadApp();
  w.document.querySelector('.tab[data-tab="schedule"]').click();
  await w.SLP.ui.render();
  eq(w.SLP.ui.route.tab, 'schedule', 'route updated');
  assert(w.document.querySelector('#view-schedule'), 'schedule view rendered');
  assert(!w.document.querySelector('#view-today'), 'today view torn down');
});

test('go() merges into the route without clobbering the rest', async () => {
  const w = await loadApp();
  await w.SLP.ui.go({ tab: 'students', studentId: 'abc' });
  await w.SLP.ui.go({ tab: 'today' });
  eq(w.SLP.ui.route.studentId, 'abc', 'unrelated route state is preserved');
});

test('h() builds elements with text, classes, and handlers', async () => {
  const w = await loadApp();
  let clicked = 0;
  const el = w.SLP.ui.h('button', { class: 'x y', text: 'Hi', 'data-k': '1',
                                    'on:click': () => clicked++ });
  eq(el.tagName, 'BUTTON', 'tag');
  eq(el.textContent, 'Hi', 'text');
  eq(el.className, 'x y', 'class');
  eq(el.dataset.k, '1', 'data attribute');
  el.click();
  eq(clicked, 1, 'handler wired');
});

test('h() escapes text rather than parsing it as HTML', async () => {
  const w = await loadApp();
  const el = w.SLP.ui.h('div', { text: '<img src=x onerror=alert(1)>' });
  eq(el.children.length, 0, 'pasted IEP text must never become markup');
  eq(el.textContent, '<img src=x onerror=alert(1)>', 'shown verbatim');
});

test('h() nests children', async () => {
  const w = await loadApp();
  const { h } = w.SLP.ui;
  const el = h('div', { class: 'p' }, h('span', { text: 'a' }), 'plain', h('b', { text: 'c' }));
  eq(el.textContent, 'aplainc', 'children in order');
});

test('todayStr is local-time, not UTC', async () => {
  const w = await loadApp();
  const d = new Date();
  const expected = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  eq(w.SLP.ui.todayStr(), expected, 'a date must never shift by timezone');
});

test('toast shows and names its kind', async () => {
  const w = await loadApp();
  w.SLP.ui.toast('saved', 'ok');
  const t = w.document.querySelector('.toast');
  assert(t, 'toast element present');
  eq(t.textContent, 'saved', 'message');
  assert(t.classList.contains('toast-ok'), 'kind applied');
});

// ---------------------------------------------------------------------------
// The school select's min-width:0 is load-bearing and invisible to every other
// test in this suite: without it the select claims its longest option's width
// and pushes out of its column. It was scoped by id, so it protected one of the
// two lists; these tests are what stop it silently covering one again.
//
// Both checks measure rather than guess. The computed-style one asks whether the
// rule reaches the element at all; the overflow one compares the select's right
// edge against its OWN container's, so there is no hard-coded pixel to be wrong
// about — a wider panel or a different font changes both sides together.
// ---------------------------------------------------------------------------

const LONG_SCHOOL = 'Roosevelt Consolidated Elementary and Middle School Campus North';

async function seedTwoSchools(w) {
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada', school: LONG_SCHOOL }));
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Bo', school: 'Lincoln Elementary' }));
}

test('the school filter carries the rule that keeps it inside its column', async () => {
  const w = await loadApp();
  await seedTwoSchools(w);
  await w.SLP.ui.go({ tab: 'students' });
  const el = w.document.querySelector('#student-school-filter');
  assert(el, 'the filter exists');
  const style = w.getComputedStyle(el);
  eq(style.minWidth, '0px', 'min-width:0 applies');
  // Class-scoped, so it survives the id changing or a second list appearing. Asserting
  // the class is here is what stops the rule quietly reverting to protecting one instance.
  assert(el.classList.contains('school-filter'), 'and hangs off the shared class');
});

// No overflow test for the edit row: measured 2026-08-25, the heading, grade select,
// school box and buttons cannot outrun the detail pane, because flex items shrink by
// default and the h2's text wraps inside itself. A test there would never go red, which
// is worse than no test — it reads as a guard and guards nothing. flex-wrap: wrap is
// still preferred over nowrap: with wrap the long name keeps its line and the controls
// drop below it (h2 663px); with nowrap the name is squeezed to 288px instead.

// Every handler ends in refresh() → render(), and doRender() clears #app down to nothing
// before rebuilding. Nothing on the page is its own scroll container, so the document is
// what scrolls — and an empty document is viewport-tall, which makes the browser clamp
// the scroll offset to 0 on the way through. She marks a goal near the bottom of a long
// student and gets thrown back to the header.
async function seedTallStudent(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  for (let i = 0; i < 12; i++) {
    await st.saveGoal(m.goal({
      studentId: ada.id, order: i,
      text: 'STUDENT will produce target sounds in structured conversation ' + i,
    }));
  }
  return ada;
}

test('clicking something keeps her place on the page', async () => {
  const w = await loadApp();
  const ada = await seedTallStudent(w);
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });

  assert(w.document.documentElement.scrollHeight > w.innerHeight + 200,
         'the page must be taller than the frame or this test measures nothing');
  w.scrollTo(0, 300);
  eq(w.scrollY, 300, 'scrolled down to where she is working');

  w.document.querySelectorAll('.delete-goal')[6].click();
  await w.SLP.ui.render();

  eq(w.scrollY, 300, 'a re-render must not throw her back to the top');
});

// The other half of the same rule: going somewhere new is not staying put. Landing on a
// fresh tab already scrolled down would hide its heading and read as a broken page.
test('going somewhere new starts at the top', async () => {
  const w = await loadApp();
  const ada = await seedTallStudent(w);
  // The destination has to be tall too. A short Schedule tab would clamp to 0 on its own
  // and the test would pass with no reset logic at all — measured 2026-08-25, an empty
  // Schedule is well under one frame.
  // All on one day: the week grid is columns, so height follows the longest column, not
  // the total. Spread across five days, 20 slots only reached 903px in an 800px frame.
  for (let i = 0; i < 30; i++) {
    await w.SLP.store.saveSlot(w.SLP.model.slot({
      dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
      studentIds: [ada.id], location: 'Room ' + i,
    }));
  }
  await w.SLP.ui.go({ tab: 'students', studentId: ada.id });
  w.scrollTo(0, 300);
  eq(w.scrollY, 300, 'scrolled down the student');

  w.document.querySelector('.tab[data-tab="schedule"]').click();
  await w.SLP.ui.render();
  assert(w.document.documentElement.scrollHeight > w.innerHeight + 300,
         'the destination must be tall enough to hold a scroll offset or this proves ' +
         'nothing — scrollHeight ' + w.document.documentElement.scrollHeight);
  eq(w.scrollY, 0, 'a different tab is a new place, not the same place');
});

test('a long school name does not push the filter out of its column', async () => {
  const w = await loadApp();
  await seedTwoSchools(w);
  await w.SLP.ui.go({ tab: 'students' });
  const el = w.document.querySelector('#student-school-filter');
  const box = el.getBoundingClientRect();
  const container = el.closest('.student-filters').getBoundingClientRect();
  assert(box.width > 0, 'the filter is actually laid out');
  // 1px of tolerance for sub-pixel rounding; a real overflow is tens of pixels — with
  // both sizing properties removed this measures ~276px over.
  assert(box.right <= container.right + 1,
         'overflows its container by ' + (box.right - container.right) + 'px');
});
