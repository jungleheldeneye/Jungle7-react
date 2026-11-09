import { FunctionComponent } from '../../src/component.js';
import { createListItem } from '../shared/list.js';
import { TodoApp } from './components.js';

const todos = [
  { title: '빨래', done: true },
  { title: '설거지', done: false },
  { title: '공부', done: false },
].map(createListItem);

const app = new FunctionComponent(TodoApp, { initialTodos: todos });
const $ = (id) => document.getElementById(id);
const container = $('app');
const observer = new MutationObserver(() => {});
observer.observe(container, {
  childList: true, attributes: true, characterData: true, subtree: true,
});

let renders = 0;
let memoRuns = 0;
let effectRuns = 0;
let previousHooks = [];
let previousInput = null;

function formatLog(value) {
  return JSON.stringify(value, (_, item) => typeof item === 'function' ? '[함수]' : item, 2);
}

app.mount(container, ({ previousVdom, vnode, patches }) => {
  renders += 1;
  app.hooks.forEach((hook, index) => {
    if (hook === previousHooks[index]) return;
    if (hook.type === 'memo') memoRuns += 1;
    if (hook.type === 'effect') effectRuns += 1;
  });
  previousHooks = app.hooks;

  const records = observer.takeRecords();
  const added = records.reduce((count, record) => count + record.addedNodes.length, 0);
  const removed = records.reduce((count, record) => count + record.removedNodes.length, 0);
  const attributes = records.filter((record) => record.type === 'attributes').length;
  const texts = records.filter((record) => record.type === 'characterData').length;
  const input = $('preserved-input');
  const inputStatus = previousInput === null
    ? '입력 노드 생성'
    : input === previousInput ? '같은 입력 노드 유지' : '입력 노드 교체';
  previousInput = input;

  $('hook-summary').textContent = `useMemo 계산 ${memoRuns}회 · useEffect 실행 ${effectRuns}회`;
  $('hook-log').textContent = formatLog(app.hooks);
  $('render-summary').textContent = `렌더링 ${renders}회 · DOM 추가 ${added} · 삭제 ${removed} · 속성 ${attributes} · 텍스트 ${texts} · ${inputStatus}`;
  $('diff-log').textContent = previousVdom === undefined ? '첫 렌더링에서 화면을 만들었어요.' : formatLog(patches);
  $('previous-vdom').textContent = previousVdom === undefined ? '첫 렌더링이에요.' : formatLog(previousVdom);
  $('next-vdom').textContent = formatLog(vnode);
});
