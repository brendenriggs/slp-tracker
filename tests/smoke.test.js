test('app exposes its namespace and version', async () => {
  const w = await loadApp();
  assert(w.SLP, 'window.SLP is missing from the app');
  eq(typeof w.SLP.version, 'string', 'SLP.version should be a string');
});

test('app makes no network requests', async () => {
  const w = await loadApp();
  const html = w.document.documentElement.outerHTML;
  assert(!/src\s*=\s*["']https?:/i.test(html), 'app references a remote script');
  assert(!/href\s*=\s*["']https?:/i.test(html), 'app references a remote stylesheet');
});
