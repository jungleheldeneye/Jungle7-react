/**
 * Phase 1 검증 페이지
 *
 * 이 파일은 src/의 함수 4개만 가져다 쓴다. 각자 구현을 src/에 넣으면 그대로 동작한다.
 *
 *   domToVdom(node)        실제 DOM 노드 → VDOM
 *                          (공백만 있는 텍스트 노드와 주석도 버리지 않는다, docs/design.md 6-2)
 *   vdomToDom(vnode)       VDOM → 실제 DOM 노드
 *   diff(oldVnode, newVnode)  → 변경 목록 (배열)
 *   patch(rootNode, patches)  변경 목록을 rootNode 기준으로 실제 DOM에 반영
 *                          (path가 []인 REPLACE는 rootNode 자체를 교체할 수 있음)
 *
 * 각 영역(.area) 안에는 루트 요소가 정확히 하나 있다고 가정한다.
 */
import { domToVdom, vdomToDom } from '../../src/vdom.js';
import { diff } from '../../src/diff.js';
import { patch } from '../../src/patch.js';

const $ = (id) => document.getElementById(id);
const realArea = $('real-area');
const testArea = $('test-area');
const testSource = $('test-source');
const btnPatch = $('btn-patch');
const btnBack = $('btn-back');
const btnForward = $('btn-forward');
const posLabel = $('history-pos');
const pendingSummary = $('pending-summary');
const pendingLog = $('pending-log');
const vdomDetails = $('vdom-details');
const currentVdom = $('current-vdom');
const draftVdom = $('draft-vdom');
const summary = $('summary');
const patchLog = $('patch-log');
const appliedDetails = $('applied-vdom-details');
const appliedEmpty = $('applied-vdom-empty');
const appliedTrees = $('applied-vdom-trees');
const appliedBefore = $('applied-before');
const appliedAfter = $('applied-after');
const historyDetails = $('history-details');
const historySelect = $('history-select');
const historyVdom = $('history-vdom');

// ── State History ─────────────────────────────────────────
// history[index]가 지금 실제 영역에 그려져 있는 VDOM
let history = [];
let index = 0;
let pending = null;
let lastApplied = null;

// ── 영역 헬퍼 ─────────────────────────────────────────────
const rootOf = (area) => area.firstElementChild;

function singleRootOf(container) {
  if (container.children.length !== 1) return null;
  const hasOutsideText = Array.from(container.childNodes).some((node) =>
    node.nodeType === Node.TEXT_NODE && node.data.trim() !== '',
  );
  return hasOutsideText ? null : rootOf(container);
}

/** 테스트 영역을 vnode로 통째로 다시 그림 (테스트 영역은 사용자가 고치는 곳이라 diff 대상이 아님) */
function renderTestArea(vnode) {
  testArea.replaceChildren(vdomToDom(vnode));
  syncSourceFromTest();
}

function syncSourceFromTest() {
  testSource.value = testArea.innerHTML;
  updatePending(singleRootOf(testArea));
}

function syncTestFromSource() {
  const tpl = document.createElement('template');
  tpl.innerHTML = testSource.value.trim();
  const root = singleRootOf(tpl.content);
  if (root) testArea.replaceChildren(root);
  updatePending(root);
}

function updatePending(root) {
  pending = null;
  if (root) {
    const vnode = domToVdom(root);
    pending = { vnode, patches: diff(history[index], vnode) };
  }
  showPending();
}

function showPending() {
  testSource.classList.toggle('invalid', pending === null);
  testSource.setAttribute('aria-invalid', String(pending === null));
  const count = pending?.patches.length ?? 0;
  btnPatch.disabled = count === 0;
  pendingLog.textContent = count > 0 ? JSON.stringify(pending.patches, null, 2) : '';

  if (!pending) {
    pendingSummary.textContent = '테스트 영역의 내용을 바깥 태그 하나로 감싸세요.';
  } else if (count === 0) {
    pendingSummary.textContent = '적용할 변경이 없어요. 테스트 영역을 편집해 보세요.';
  } else {
    pendingSummary.textContent = `변경 ${count}개가 준비됐어요. Patch를 누르면 실제 영역에 반영돼요.`;
  }

  showVdomTrees();
}

function showVdomTrees() {
  if (!vdomDetails.open) return;

  renderComparison(currentVdom, draftVdom, history[index], pending?.vnode, pending?.patches);
}

function showAppliedTrees() {
  if (!appliedDetails.open) return;
  appliedEmpty.hidden = lastApplied !== null;
  appliedTrees.hidden = lastApplied === null;
  if (lastApplied) {
    const { before, after, patches } = lastApplied;
    renderComparison(appliedBefore, appliedAfter, before, after, patches);
  }
}

function renderComparison(beforeOutput, afterOutput, before, after, patches = []) {
  const changes = new Map(patches.map((change) => [change.path.join('.'), change]));
  renderVdomTree(beforeOutput, before, changes);
  renderVdomTree(afterOutput, after, changes);
}

function showHistory() {
  if (!historyDetails.open) return;
  historySelect.replaceChildren(...history.map((_, position) => {
    const option = document.createElement('option');
    option.value = position;
    option.textContent = position === index ? `${position + 1}번 (현재)` : `${position + 1}번`;
    return option;
  }));
  historySelect.selectedIndex = index;
  showHistoryVdom();
}

function showHistoryVdom() {
  renderVdomTree(historyVdom, history[historySelect.selectedIndex]);
}

function renderVdomTree(output, vnode, changes = new Map()) {
  if (!vnode) {
    output.textContent = '바깥 태그 하나로 감싸면 VDOM을 볼 수 있어요.';
    return;
  }

  const tree = document.createDocumentFragment();

  function append(text, highlight = false) {
    if (highlight) {
      const mark = document.createElement('mark');
      mark.textContent = text;
      tree.append(mark);
    } else {
      tree.append(text);
    }
  }

  function visit(node, path) {
    const change = changes.get(path.join('.'));
    const type = change?.type;
    const indent = '  '.repeat(path.length);
    append(indent);

    // 글자·주석은 { type: '#text' | '#comment', props: { nodeValue } } 모양 (6-2). 글자 변경은 PROPS로 온다
    if (node.type === '#text') {
      append(JSON.stringify(node.props.nodeValue), Boolean(type));
    } else if (node.type === '#comment') {
      append(`<!--${node.props.nodeValue}-->`, Boolean(type));
    } else {
      append(`<${node.type}`, Boolean(type && type !== 'PROPS'));
      for (const [name, value] of Object.entries(node.props)) {
        const changed = type === 'PROPS' && Object.hasOwn(change.props, name);
        append(` ${name}=${JSON.stringify(value)}`, changed);
      }
      append('>');
    }

    if (type) append(` [${type}]`, true);
    append('\n');

    if (node.type !== '#text' && node.type !== '#comment') {
      node.children.forEach((child, index) => visit(child, [...path, index]));
      append(`${indent}</${node.type}>\n`);
    }
  }

  visit(vnode, []);
  output.replaceChildren(tree);
}

// ── 실제 영역에 반영 + 바뀐 노드 수 세기 ─────────────────
/**
 * 변경 목록을 실제 영역에 반영한다.
 * MutationObserver로 실제로 몇 개의 노드가 바뀌었는지 센다.
 * (화면이 맞아도 통째로 교체됐다면 여기서 드러남)
 */
function applyToReal(patches, next) {
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(realArea, {
    childList: true, attributes: true, characterData: true, subtree: true,
  });

  patch(rootOf(realArea), patches);

  records.push(...observer.takeRecords());
  observer.disconnect();
  report(patches, records);
  lastApplied = { before: history[index], after: next, patches };
  showAppliedTrees();
}

function report(patches, records) {
  const count = (type) => records.filter((r) => r.type === type).length;
  const added = records.reduce((n, r) => n + r.addedNodes.length, 0);
  const removed = records.reduce((n, r) => n + r.removedNodes.length, 0);

  summary.textContent = patches.length === 0
    ? '변경 없음 — 실제 DOM을 건드리지 않았어요.'
    : `변경 ${patches.length}개 → DOM 조작: 추가 ${added} · 삭제 ${removed} · 속성 ${count('attributes')} · 텍스트 ${count('characterData')}`;
  patchLog.textContent = JSON.stringify(patches, null, 2);
}

// ── 버튼 상태 ─────────────────────────────────────────────
function updateControls() {
  btnBack.disabled = index === 0;
  btnForward.disabled = index === history.length - 1;
  posLabel.textContent = `${index + 1} / ${history.length}`;
  showHistory();
}

// ── 동작 ──────────────────────────────────────────────────
function onLoad() {
  const vdom0 = domToVdom(rootOf(realArea));
  history = [vdom0];
  index = 0;
  renderTestArea(vdom0);
  updateControls();
}

function onPatch() {
  if (!pending?.patches.length) return;
  const { vnode, patches } = pending;
  applyToReal(patches, vnode);

  // 뒤로 이동한 상태에서 새 변경을 적용하면 그 뒤 기록을 버린다.
  history = history.slice(0, index + 1);
  history.push(vnode);
  index += 1;
  pending = { vnode, patches: [] };
  showPending();
  updateControls();
}

function go(step) {
  const target = index + step;
  if (target < 0 || target >= history.length) return;
  // 실제 영역: 지금 VDOM → 목표 VDOM 차이만 반영
  const next = history[target];
  applyToReal(diff(history[index], next), next);
  // 테스트 영역: 목표 VDOM으로 다시 그림
  index = target;
  renderTestArea(history[index]);
  updateControls();
}

btnPatch.addEventListener('click', onPatch);
btnBack.addEventListener('click', () => go(-1));
btnForward.addEventListener('click', () => go(1));
testArea.addEventListener('input', syncSourceFromTest);
testSource.addEventListener('input', syncTestFromSource);
vdomDetails.addEventListener('toggle', showVdomTrees);
appliedDetails.addEventListener('toggle', showAppliedTrees);
historyDetails.addEventListener('toggle', showHistory);
historySelect.addEventListener('change', showHistoryVdom);

try {
  onLoad();
} catch (err) {
  summary.textContent = `src/ 함수를 불러오는 중 오류: ${err.message}`;
  console.error(err);
}
