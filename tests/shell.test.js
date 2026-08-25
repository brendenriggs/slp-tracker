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

test('the school filter min-width rule reaches both lists, not just the students tab', async () => {
  const w = await loadApp();
  await seedTwoSchools(w);
  for (const [tab, id] of [['students', '#student-school-filter'],
                           ['schedule', '#caseload-school-filter']]) {
    await w.SLP.ui.go({ tab });
    const el = w.document.querySelector(id);
    assert(el, id + ' exists on the ' + tab + ' tab');
    eq(w.getComputedStyle(el).minWidth, '0px', 'min-width:0 applies to ' + id);
  }
});

test('a long school name does not push the filter out of its column', async () => {
  const w = await loadApp();
  await seedTwoSchools(w);
  for (const [tab, id] of [['students', '#student-school-filter'],
                           ['schedule', '#caseload-school-filter']]) {
    await w.SLP.ui.go({ tab });
    const el = w.document.querySelector(id);
    const box = el.getBoundingClientRect();
    const container = el.closest('.student-filters').getBoundingClientRect();
    assert(box.width > 0, id + ' is actually laid out');
    // 1px of tolerance for sub-pixel rounding; anything real is tens of pixels.
    assert(box.right <= container.right + 1,
           id + ' overflows its container by ' + (box.right - container.right) + 'px');
  }
});
