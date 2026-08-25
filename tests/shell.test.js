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
