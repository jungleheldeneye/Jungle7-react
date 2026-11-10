/** Phase 1 / Phase 2 탭 전환. 주소 끝(#phase2)에 기억해서 새로고침해도 그대로 */
const tabs = [...document.querySelectorAll('[role="tab"]')];

function select(panelId) {
  for (const tab of tabs) {
    const on = tab.getAttribute('aria-controls') === panelId;
    tab.setAttribute('aria-selected', String(on));
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    const panelId = tab.getAttribute('aria-controls');
    select(panelId);
    history.replaceState(null, '', `#${panelId.replace('tab-', '')}`);
  });
}

select(location.hash === '#phase2' ? 'tab-phase2' : 'tab-phase1');
