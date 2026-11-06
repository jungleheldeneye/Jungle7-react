/**
 * Phase 1 검증 페이지
 *
 * 이 파일은 src/의 함수 4개만 가져다 쓴다. 각자 구현을 src/에 넣으면 그대로 동작한다.
 *
 *   domToVdom(node)        실제 DOM 노드 → VDOM
 *                          (공백만 있는 텍스트 노드, 주석은 버린다고 가정)
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
const summary = $('summary');
const patchLog = $('patch-log');

// ── State History ─────────────────────────────────────────
// history[index]가 지금 실제 영역에 그려져 있는 VDOM
let history = [];
let index = 0;

// ── 영역 헬퍼 ─────────────────────────────────────────────
const rootOf = (area) => area.firstElementChild;

/** 테스트 영역을 vnode로 통째로 다시 그림 (테스트 영역은 사용자가 고치는 곳이라 diff 대상이 아님) */
function renderTestArea(vnode) {
  testArea.replaceChildren(vdomToDom(vnode));
  syncSourceFromTest();
}

function syncSourceFromTest() {
  testSource.value = rootOf(testArea)?.outerHTML ?? '';
}

function syncTestFromSource() {
  const tpl = document.createElement('template');
  tpl.innerHTML = testSource.value.trim();
  const roots = [...tpl.content.children];
  if (roots.length !== 1) {
    testSource.classList.add('invalid');
    return;
  }
  testSource.classList.remove('invalid');
  testArea.replaceChildren(roots[0]);
}

// ── 실제 영역에 반영 + 바뀐 노드 수 세기 ─────────────────
/**
 * from → to 로 실제 영역을 바꾼다.
 * MutationObserver로 실제로 몇 개의 노드가 바뀌었는지 센다.
 * (화면이 맞아도 통째로 교체됐다면 여기서 드러남)
 */
function applyToReal(from, to) {
  const patches = diff(from, to);
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(realArea, {
    childList: true, attributes: true, characterData: true, subtree: true,
  });

  patch(rootOf(realArea), patches);

  records.push(...observer.takeRecords());
  observer.disconnect();
  report(patches, records);
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
}

// ── 동작 ──────────────────────────────────────────────────
function onLoad() {
  // 1. 실제 영역의 샘플 HTML → VDOM
  const vdom0 = domToVdom(rootOf(realArea));
  // 2. 그 VDOM으로 테스트 영역 렌더링
  renderTestArea(vdom0);
  // 3. 히스토리 시작
  history = [vdom0];
  index = 0;
  updateControls();
}

function onPatch() {
  const root = rootOf(testArea);
  if (!root) {
    summary.textContent = '테스트 영역에 루트 요소가 하나 있어야 해요.';
    return;
  }
  // 1. 현재 테스트 영역 → 새 VDOM
  const next = domToVdom(root);
  // 2~3. 이전 VDOM과 diff → 바뀐 부분만 실제 영역에 반영
  applyToReal(history[index], next);
  // 4. 히스토리에 저장 (뒤로 간 상태였다면 그 뒤 기록은 버림)
  history = history.slice(0, index + 1);
  history.push(next);
  index += 1;
  updateControls();
}

function go(step) {
  const target = index + step;
  if (target < 0 || target >= history.length) return;
  // 실제 영역: 지금 VDOM → 목표 VDOM 차이만 반영
  applyToReal(history[index], history[target]);
  // 테스트 영역: 목표 VDOM으로 다시 그림
  renderTestArea(history[target]);
  index = target;
  updateControls();
}

btnPatch.addEventListener('click', onPatch);
btnBack.addEventListener('click', () => go(-1));
btnForward.addEventListener('click', () => go(1));
testArea.addEventListener('input', syncSourceFromTest);
testSource.addEventListener('input', syncTestFromSource);

try {
  onLoad();
} catch (err) {
  summary.textContent = `src/ 함수를 불러오는 중 오류: ${err.message}`;
  console.error(err);
}
