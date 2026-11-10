/**
 * Phase 2 검증 탭: render(App)로 붙인 컴포넌트가 다시 그려지는 흐름을 단계별로 보여 준다
 *
 * src/는 고치지 않는다. 이 파일에서 이렇게 엿본다
 *   - FunctionComponent.prototype의 mount·update·renderVnode·runEffects를 감싸서 단계 기록
 *     (App 인스턴스일 때만. 규칙 위반 확인용 BadApp은 그냥 통과)
 *   - useState·useMemo·useEffect를 한 겹 감싸서 칸 번호·계산 여부·예약 여부 기록
 *   - update 안의 diff는 바깥에서 못 보니, 지난 vnode·새 vnode로 diff를 한 번 더 돌려 보여 준다
 *     (diff는 같은 입력이면 같은 결과라 update가 쓴 변경 목록과 같다)
 *   - patch가 실제로 DOM을 몇 번 건드렸는지는 MutationObserver로 센다 (Phase 1과 같은 방식)
 *
 * 한 번 다시 그리기 = 사이클 하나
 *   setState(들) → [예약] → update → renderVnode → App() → hooks → expand → diff → patch → effects
 */
import { h } from '../../src/vdom.js';
import { diff } from '../../src/diff.js';
import { render, FunctionComponent, currentRender, CHILD } from '../../src/component.js';
import { useState, useEffect, useMemo } from '../../src/hooks.js';
import { renderVdomTree } from './vdom-view.js';

const $ = (id) => document.getElementById(id);
const appContainer = $('app');
const hooksBody = $('hooks-body');
const cycleList = $('cycle-list');
const cycleTrigger = $('cycle-trigger');
const flowSteps = $('flow-steps');
const flowVdom = $('flow-vdom');
const flowRaw = $('flow-raw');
const flowBefore = $('flow-before');
const flowAfter = $('flow-after');
const flowPatches = $('flow-patches');
const ruleResult = $('rule-result');

const MAX_CYCLES = 50;
const PHASE_LABEL = {
  setState: 'setState',
  schedule: '예약',
  render: '렌더',
  hook: 'hook',
  expand: 'expand',
  child: '자식',
  diff: 'diff',
  patch: 'patch',
  effect: 'effect',
  unmount: 'unmount',
  error: '에러',
};

// ── 기록 상태 ─────────────────────────────────────────────
let cycles = [];
let nextCycleId = 1;
let current = null;    // 지금 돌고 있는 사이클 (mount·update 안)
let pending = null;    // setState로 예약됐지만 update가 아직 안 돈 사이클
let selectedId = null;
let traced = null;     // App의 FunctionComponent 인스턴스
let observer = null;
const hookMeta = [];   // hooks[i]가 어떤 hook인지 (hooks.js 칸에는 종류가 없어서 따로 적는다)

function newCycle(trigger) {
  return {
    id: nextCycleId++, trigger, kind: null, steps: [],
    raw: null, before: null, after: null, patches: [], records: [], inEffects: false,
  };
}

function log(cycle, phase, text, tone = '') {
  cycle?.steps.push({ phase, text, tone });
}
const step = (phase, text, tone) => log(current, phase, text, tone);

function finish(cycle) {
  observer?.disconnect();
  observer = null;
  if (current === cycle) current = null;
  cycles.push(cycle);
  if (cycles.length > MAX_CYCLES) cycles = cycles.slice(-MAX_CYCLES);
  selectedId = cycle.id;
  refresh();
}

function fail(error) {
  if (!current) return;
  step('error', error.message, 'bad');
  finish(current);
}

// ── 값 짧게 보여 주기 ─────────────────────────────────────
function show(value) {
  if (Array.isArray(value)) return `[${value.length}개]`;
  if (typeof value === 'function') return 'ƒ';
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function showFull(value, limit = 120) {
  if (typeof value === 'function') return 'ƒ';
  if (value === undefined) return '—';
  const text = JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

const showDeps = (deps) => (deps === undefined ? '없음 (매번 실행)' : `[${deps.map(show).join(', ')}]`);
const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

// ── FunctionComponent 엿보기 ──────────────────────────────
const proto = FunctionComponent.prototype;
const original = {
  mount: proto.mount,
  update: proto.update,
  renderVnode: proto.renderVnode,
  runEffects: proto.runEffects,
  unmount: proto.unmount,
};
const isTraced = (instance) => instance.component === App;

proto.mount = function mount(container) {
  if (!isTraced(this)) return original.mount.call(this, container);
  traced = this;
  current = newCycle('render(App, #app) — 처음 그리기');
  current.kind = 'mount';
  try {
    return original.mount.call(this, container);
  } catch (error) {
    fail(error);
    throw error;
  }
};

proto.update = function update() {
  if (!isTraced(this)) return original.update.call(this);
  current = pending ?? newCycle('update()');
  pending = null;
  current.kind = 'update';
  step('schedule', 'microtask 차례가 됨 → updateScheduled = false로 되돌리고 update() 실행');
  current.before = this.vnode;

  const records = current.records;
  observer = new MutationObserver((list) => records.push(...list));
  observer.observe(appContainer, { childList: true, attributes: true, characterData: true, subtree: true });

  try {
    return original.update.call(this);
  } catch (error) {
    fail(error);
    throw error;
  }
};

proto.renderVnode = function renderVnode() {
  if (!isTraced(this)) return original.renderVnode.call(this);
  step('render', 'renderVnode(): currentRender.owner = App 인스턴스, hookIndex = 0으로 맞추고 App(props) 실행');
  const vnode = original.renderVnode.call(this);
  step('expand', 'expand 끝 → 컴포넌트 메모가 하나도 없는 VDOM. h(TodoItem, { key })의 key는 펼친 <li>로 옮겨짐 (R8)');
  current.after = vnode;
  return vnode;
};

proto.runEffects = function runEffects() {
  if (!isTraced(this)) return original.runEffects.call(this);
  const cycle = current;

  if (cycle.kind === 'mount') {
    step('patch', `처음이라 diff 없이 vdomToDom으로 통째로 만듦 → 노드 ${countNodes(this.vnode)}개를 #app에 붙임`);
  } else {
    cycle.records.push(...(observer?.takeRecords() ?? []));
    observer?.disconnect();
    observer = null;
    cycle.patches = diff(cycle.before, this.vnode);
    step('diff', describePatches(cycle.patches));
    step('patch', describeRecords(cycle.records), cycle.patches.length === 0 ? 'skip' : '');
  }

  const count = this.pendingEffects.length;
  step('effect', count > 0
    ? `runEffects(): 화면이 다 고쳐진 뒤 pendingEffects ${count}개를 넣은 순서대로 실행`
    : 'runEffects(): deps가 바뀐 effect가 없어서 실행할 게 없음', count > 0 ? '' : 'skip');

  cycle.inEffects = true;
  try {
    original.runEffects.call(this);
  } finally {
    cycle.inEffects = false;
    finish(cycle);
  }
};

proto.unmount = function unmount() {
  if (!isTraced(this) || this.unmounted) return original.unmount.call(this);
  current = newCycle('app.unmount()');
  current.kind = 'unmount';
  current.before = this.vnode;
  const cleanups = this.hooks.filter((slot) => typeof slot.cleanup === 'function').length;
  step('unmount', 'unmounted = true → 이 뒤로 오는 setState·update는 무시. 아직 안 돈 pendingEffects는 버림');
  step('unmount', cleanups > 0
    ? `칸을 순서대로 돌며 저장된 cleanup ${cleanups}개를 부름 (하나가 던져도 나머지는 계속)`
    : '저장된 cleanup이 없어서 부를 게 없음');
  try {
    original.unmount.call(this);
  } catch (error) {
    fail(error);
    throw error;
  }
  step('unmount', `루트 DOM을 #app에서 뗌 → #app 자식 노드 ${appContainer.childNodes.length}개`);
  finish(current);
  updateMountButtons();
};

function countNodes(vnode) {
  return 1 + vnode.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function describePatches(patches) {
  if (patches.length === 0) return 'diff(지난 VDOM, 새 VDOM) → 변경 0개';
  const byType = Map.groupBy(patches, (change) => change.type);
  const parts = [...byType].map(([type, list]) => `${type} ${list.length}`);
  const onlyHandlers = patches.filter((change) => change.type === 'PROPS'
    && Object.values(change.props).every((value) => typeof value === 'function')).length;
  const note = onlyHandlers > 0
    ? ` (그중 PROPS ${onlyHandlers}개는 onclick 같은 함수만 바뀐 것: 렌더마다 새 함수가 만들어져서)`
    : '';
  return `diff(지난 VDOM, 새 VDOM) → 변경 ${patches.length}개: ${parts.join(' · ')}${note}`;
}

function describeRecords(records) {
  const count = (type) => records.filter((record) => record.type === type).length;
  const added = records.reduce((n, record) => n + record.addedNodes.length, 0);
  const removed = records.reduce((n, record) => n + record.removedNodes.length, 0);
  return `patch(this.dom, 변경 목록) → 실제 DOM 조작: 추가 ${added} · 삭제 ${removed} · 속성 ${count('attributes')} · 텍스트 ${count('characterData')}`
    + ' (이벤트 함수는 property로 바꿔서 여기 안 잡힘)';
}

// ── hook 엿보기 ───────────────────────────────────────────
/** hook을 부르기 직전의 칸 번호. 주인이 없거나 자식이면 진짜 hook이 에러를 낸다 */
function peekSlot() {
  const { owner, hookIndex } = currentRender;
  const usable = owner !== null && owner !== CHILD;
  return { owner, index: hookIndex, fresh: usable && owner.hooks[hookIndex] === undefined };
}

function useTracedState(label, initialValue) {
  const { owner, index, fresh } = peekSlot();
  const [value, setValue] = useState(initialValue);
  hookMeta[index] = { kind: 'useState', label };
  step('hook', `hooks[${index}] useState ${label} → ${fresh ? `칸이 비어서 초기값 ${show(value)}로 채움` : `칸에 있던 값 ${show(value)}을 꺼냄`}`);

  const setter = `set${capitalize(label)}`;
  const set = (next) => {
    const slot = owner.hooks[index];
    const before = slot.value;
    const wasScheduled = owner.updateScheduled;
    const call = `${setter}(${typeof next === 'function' ? 'ƒ' : show(next)})`;
    if (!pending) pending = newCycle(current?.inEffects ? `effect 안에서 ${call}` : call);

    setValue(next);

    const after = slot.value;
    let result;
    let tone = '';
    if (Object.is(before, after)) {
      result = '같은 값이라 무시 (다시 그리지 않음)';
      tone = 'skip';
    } else if (wasScheduled) {
      result = '이미 update가 예약돼 있어서 묶임 → update는 한 번만';
      tone = 'batched';
    } else {
      result = 'updateScheduled = true, queueMicrotask로 update() 예약 (화면은 아직 그대로)';
    }
    log(pending, 'setState', `${call}: 칸 값 ${show(before)} → ${show(after)} · ${result}`, tone);
  };
  return [value, set];
}

function useTracedMemo(label, factory, deps) {
  const { index } = peekSlot();
  let ran = false;
  const value = useMemo(() => {
    ran = true;
    return factory();
  }, deps);
  hookMeta[index] = { kind: 'useMemo', label };
  step('hook', ran
    ? `hooks[${index}] useMemo ${label} → deps ${showDeps(deps)}가 바뀌어 렌더 중에 바로 다시 계산: ${show(value)}`
    : `hooks[${index}] useMemo ${label} → deps ${showDeps(deps)} 그대로라 지난 값 ${show(value)} 재사용`, ran ? '' : 'skip');
  return value;
}

function useTracedEffect(label, effect, deps) {
  const { owner, index } = peekSlot();
  const queuedBefore = owner?.pendingEffects?.length ?? 0;
  useEffect(() => {
    step('effect', `hooks[${index}] ${label}: effect 실행`);
    const cleanup = effect();
    if (typeof cleanup !== 'function') return cleanup;
    return () => {
      step(current?.kind === 'unmount' ? 'unmount' : 'effect', current?.kind === 'unmount'
        ? `hooks[${index}] ${label}: cleanup 실행 (마지막 정리)`
        : `hooks[${index}] ${label}: 지난번 cleanup을 먼저 실행`);
      cleanup();
    };
  }, deps);
  hookMeta[index] = { kind: 'useEffect', label };
  const queued = owner.pendingEffects.length > queuedBefore;
  step('hook', queued
    ? `hooks[${index}] useEffect ${label} → deps ${showDeps(deps)} 바뀜 → pendingEffects에 넣어 두기만 함 (실행은 patch 뒤)`
    : `hooks[${index}] useEffect ${label} → deps ${showDeps(deps)} 그대로라 건너뜀`, queued ? '' : 'skip');
}

// ── 데모 앱 ───────────────────────────────────────────────
let nextTodoId = 4;
let lastSetClicks = null;   // unmount 뒤에 setState를 불러 보는 버튼용

function App() {
  step('render', 'App() 실행 — 루트라서 hook을 쓸 수 있음. 부르는 순서대로 hooks[0], [1], …');
  const [todos, setTodos] = useTracedState('todos', [
    { id: 1, text: '빨래', done: true },
    { id: 2, text: '설거지', done: false },
    { id: 3, text: '공부', done: false },
  ]);
  const [draft, setDraft] = useTracedState('draft', '');
  const [clicks, setClicks] = useTracedState('clicks', 0);
  lastSetClicks = setClicks;
  const doneCount = useTracedMemo('doneCount', () => todos.filter((todo) => todo.done).length, [todos]);

  useTracedEffect('요약 쓰기', () => {
    $('effect-summary').textContent = `[todos 바뀜] 할 일 ${todos.length}개 중 ${doneCount}개 완료`;
  }, [doneCount, todos.length]);

  useTracedEffect('clicks 읽기', () => {
    // 이 시점엔 patch가 끝나서 화면 글자도 이미 새 값이다
    const shown = appContainer.querySelector('.clicks')?.textContent;
    $('effect-clicks').textContent = `[clicks 바뀜] effect 안에서 읽은 화면 글자: "${shown}"`;
    return () => {};   // cleanup 순서를 보여 주려고 빈 정리 함수를 돌려준다
  }, [clicks]);

  const add = (atFront) => {
    const text = draft.trim();
    if (!text) return;
    const todo = { id: nextTodoId++, text, done: false };
    setTodos((list) => (atFront ? [todo, ...list] : [...list, todo]));
    setDraft('');
  };
  const toggle = (id) => setTodos((list) => list.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
  const remove = (id) => setTodos((list) => list.filter((todo) => todo.id !== id));

  const vnode = h('div', { class: 'card' },
    h('h3', { class: 'title' }, '오늘 할 일'),
    h('ul', { class: 'todos' },
      todos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle: toggle, onRemove: remove }))),
    h('p', { class: 'count' }, `${todos.length}개 중 ${doneCount}개 완료`),
    h('div', { class: 'add-row' },
      h('input', {
        type: 'text', value: draft, placeholder: '할 일 입력', 'aria-label': '새 할 일',
        oninput: (event) => setDraft(event.target.value),
      }),
      h('button', { type: 'button', onclick: () => add(false) }, '뒤에 추가'),
      h('button', { type: 'button', onclick: () => add(true) }, '맨 앞에 추가')),
    h('div', { class: 'add-row' },
      h('button', {
        type: 'button',
        onclick: () => { setClicks((c) => c + 1); setClicks((c) => c + 1); setClicks((c) => c + 1); },
      }, 'setClicks(c => c + 1) × 3'),
      h('span', { class: 'clicks' }, `clicks = ${clicks}`)));

  const components = countComponents(vnode);
  step('expand', `App이 VDOM을 돌려줌 (컴포넌트 메모 ${components}개 포함) → expand가 메모를 하나씩 실행해서 펼침`);
  if (current) current.raw = vnode;
  return vnode;
}

/** 자식 컴포넌트: props만 받는 순수 함수 (R5). key는 h가 props 밖으로 빼서 여기 안 온다 */
function TodoItem({ todo, onToggle, onRemove }) {
  step('child', `TodoItem({ todo: ${todo.id}번 }) 실행 — currentRender.owner = CHILD라 hook을 부르면 에러`);
  return h('li', todo.done ? { class: 'done' } : {},
    h('span', { class: 'todo-text', onclick: () => onToggle(todo.id) }, todo.text),
    h('button', {
      type: 'button', class: 'todo-remove', 'aria-label': `${todo.text} 지우기`, onclick: () => onRemove(todo.id),
    }, '×'));
}

function countComponents(vnode) {
  const self = typeof vnode.type === 'function' ? 1 : 0;
  return self + vnode.children.reduce((sum, child) => sum + countComponents(child), 0);
}

// ── 화면 그리기 ───────────────────────────────────────────
function refresh() {
  showHooks();
  showCycleList();
  showCycle();
}

function showHooks() {
  if (!traced) return;
  hooksBody.replaceChildren(...traced.hooks.map((slot, index) => {
    const meta = hookMeta[index] ?? { kind: '?', label: '' };
    const row = document.createElement('tr');
    let value;
    let deps = '—';
    if (meta.kind === 'useState') {
      value = showFull(slot.value);
    } else if (meta.kind === 'useMemo') {
      value = showFull(slot.value);
      deps = showDeps(slot.deps);
    } else {
      value = typeof slot.cleanup === 'function' ? 'cleanup 저장됨' : 'cleanup 없음';
      deps = showDeps(slot.deps);
    }
    for (const [text, className] of [[`hooks[${index}]`, 'mono'], [meta.kind, `kind kind-${meta.kind}`], [meta.label, ''], [value, 'mono'], [deps, 'mono']]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (className) cell.className = className;
      row.append(cell);
    }
    return row;
  }));
}

function showCycleList() {
  cycleList.replaceChildren(...cycles.map((cycle) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cycle-chip';
    button.textContent = `#${cycle.id} ${cycle.trigger}`;
    button.setAttribute('aria-pressed', String(cycle.id === selectedId));
    button.addEventListener('click', () => {
      selectedId = cycle.id;
      showCycleList();
      showCycle();
    });
    return button;
  }));
  cycleList.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function showCycle() {
  const cycle = cycles.find((item) => item.id === selectedId);
  if (!cycle) {
    cycleTrigger.textContent = '아직 기록이 없어요.';
    flowSteps.replaceChildren();
    return;
  }

  const setStates = cycle.steps.filter((item) => item.phase === 'setState').length;
  if (cycle.kind === 'mount') cycleTrigger.textContent = `#${cycle.id} · 처음 그리기 (mount)`;
  else if (cycle.kind === 'unmount') cycleTrigger.textContent = `#${cycle.id} · 떼기 (unmount)`;
  else cycleTrigger.textContent = `#${cycle.id} · setState ${setStates}번 → update ${cycle.kind === 'update' ? '1번' : '0번'}`;

  flowSteps.replaceChildren(...cycle.steps.map((item) => {
    const row = document.createElement('li');
    row.className = `flow-step phase-${item.phase}${item.tone ? ` tone-${item.tone}` : ''}`;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = PHASE_LABEL[item.phase] ?? item.phase;
    const text = document.createElement('span');
    text.textContent = item.text;
    row.append(badge, text);
    return row;
  }));

  flowPatches.textContent = cycle.kind !== 'update'
    ? '처음 그리기와 unmount는 diff를 하지 않아요.'
    : JSON.stringify(cycle.patches, (key, value) => (typeof value === 'function' ? 'ƒ' : value), 2);
  showCycleVdom();
}

function showCycleVdom() {
  if (!flowVdom.open) return;
  const cycle = cycles.find((item) => item.id === selectedId);
  if (!cycle) return;
  renderVdomTree(flowRaw, cycle.raw, undefined, '이번 렌더에서 App이 돌려준 VDOM이 없어요.');
  renderVdomTree(flowBefore, cycle.before, Map.groupBy(cycle.patches, (change) => change.path.join('.')),
    '처음 그리기라 지난 VDOM이 없어요.');
  renderVdomTree(flowAfter, cycle.after, undefined, '새 VDOM이 없어요.');
}

// ── hook 규칙 위반 확인 (R5) ──────────────────────────────
function BadChild() {
  useState(0);   // 자식에서 hook → expand가 owner를 CHILD로 바꿔 둬서 에러
  return h('span', null, '안 보여요');
}
function BadApp() {
  return h('div', null, h(BadChild));
}

function showRuleError(run) {
  try {
    run();
    ruleResult.textContent = '에러가 안 났어요 — 규칙이 안 지켜지고 있어요!';
    ruleResult.classList.remove('ok');
  } catch (error) {
    ruleResult.textContent = `막혔어요: ${error.message}`;
    ruleResult.classList.add('ok');
  }
}

// 순서 검사: 첫 렌더 hooks[0]은 useState, 두 번째 렌더에선 if가 빠져서 hooks[0]이 useMemo가 된다
let orderFlag = true;
function OrderApp() {
  if (orderFlag) useState(0);
  useMemo(() => 1, []);
  return h('div');
}
// 개수 검사: 같은 useState끼리 밀리면 종류 검사로는 못 잡는다 → 렌더가 끝난 뒤 개수로 잡는다
let countFlag = true;
function CountApp() {
  useState(0);
  if (countFlag) useState(1);
  return h('div');
}
/** 첫 렌더는 조건이 참, 두 번째 렌더(update)는 거짓으로 그려 본다 */
function renderTwice(Component, setFlag) {
  setFlag(true);
  const instance = render(Component, document.createElement('div'));
  setFlag(false);
  instance.update();
}

$('btn-child-hook').addEventListener('click', () => showRuleError(() => render(BadApp, document.createElement('div'))));
$('btn-outside-hook').addEventListener('click', () => showRuleError(() => useState(0)));
$('btn-order-hook').addEventListener('click', () => showRuleError(() => renderTwice(OrderApp, (on) => { orderFlag = on; })));
$('btn-count-hook').addEventListener('click', () => showRuleError(() => renderTwice(CountApp, (on) => { countFlag = on; })));
flowVdom.addEventListener('toggle', showCycleVdom);

// ── unmount 확인 ──────────────────────────────────────────
const mountResult = $('mount-result');
function updateMountButtons() {
  const mounted = traced !== null && !traced.unmounted;
  $('btn-unmount').disabled = !mounted;
  $('btn-remount').disabled = mounted;
  $('btn-dead-setstate').disabled = mounted;
}

$('btn-unmount').addEventListener('click', () => {
  try {
    traced.unmount();
    mountResult.textContent = `떼었어요. cleanup을 부르고 #app을 비웠어요 (자식 노드 ${appContainer.childNodes.length}개).`;
  } catch (error) {
    mountResult.textContent = `unmount 중 cleanup 에러: ${error.message}`;
  }
});

$('btn-dead-setstate').addEventListener('click', async () => {
  const dead = traced;
  lastSetClicks((c) => c + 1);
  pending = null;   // 기록용 사이클이 다음 렌더에 섞이지 않게 버린다
  await Promise.resolve();
  mountResult.textContent = dead.updateScheduled || appContainer.childNodes.length > 0
    ? '떼어진 앱이 다시 그려졌어요 — unmount가 제대로 안 막고 있어요!'
    : `떼어진 앱에 setClicks를 불렀지만 update가 예약되지 않았어요 (updateScheduled = ${dead.updateScheduled}, #app 자식 ${appContainer.childNodes.length}개).`;
});

$('btn-remount').addEventListener('click', () => {
  hookMeta.length = 0;
  render(App, appContainer);
  mountResult.textContent = '새 인스턴스로 다시 render했어요. hooks는 처음 값부터 시작해요.';
  updateMountButtons();
});

try {
  render(App, appContainer);
} catch (error) {
  cycleTrigger.textContent = `render(App) 중 오류: ${error.message}`;
  console.error(error);
}
updateMountButtons();
