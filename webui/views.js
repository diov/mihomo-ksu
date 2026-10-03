// Full-page views (#view-<name>). Opening one pushes a history entry so the system back
// button (the manager calls WebView goBack) returns to the previous view.
const $ = (id) => document.getElementById(id);
const onShow = new Map();
let onViewChange = () => {};

export function defineView(name, show = () => {}) {
  onShow.set(name, show);
}

function show(view) {
  if (!$(`view-${view}`).hidden) return;
  for (const name of onShow.keys()) $(`view-${name}`).hidden = name !== view;
  onShow.get(view)();
  scrollTo(0, 0);
  onViewChange(view);
}

export function openView(view) {
  history.pushState({ view }, '');
  show(view);
}

export function closeView() {
  history.back();
}

export function initViews(changed) {
  onViewChange = changed;
  defineView('main');
  history.replaceState({ view: 'main' }, '');
  addEventListener('popstate', (e) => show(e.state?.view ?? 'main'));
  for (const b of document.querySelectorAll('[data-action="back"]')) b.addEventListener('click', closeView);
}
