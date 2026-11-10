/**
 * Phase 2 검증 페이지
 *
 * - 왼쪽 #app: 미니 React(h, FunctionComponent, hooks)로만 그린다.
 * - 오른쪽 검증 로그: 미니 React 밖의 일반 DOM. 렌더 횟수, useMemo 계산 횟수, R6 effect 실행 횟수,
 *   실제 DOM 조작 수(MutationObserver), effect/cleanup 실행 기록을 보여준다.
 *
 * 규칙: state와 hook은 루트(App)에서만, 자식 컴포넌트는 props만 받는다.
 */
import { h } from '../../src/vdom.js';
import { FunctionComponent } from '../../src/component.js';
import { useState, useEffect, useMemo } from '../../src/hooks.js';

// ── 검증 로그 (미니 React 밖) ─────────────────────────────
const $ = (id) => document.getElementById(id);
const logList = $('log');
let renderCount = 0;
let memoCount = 0;

function log(message, kind = '') {
  const li = document.createElement('li');
  li.textContent = message;
  if (kind) li.className = kind;
  logList.prepend(li);
}

// ── 자식 컴포넌트: props만 받는 순수 함수 ──────────────────
function TodoItem({ todo, onToggle, onRemove }) {
  return h('li', { class: todo.done ? 'done' : '' },
    h('input', { type: 'checkbox', checked: todo.done, onchange: () => onToggle(todo.id) }),
    h('span', null, todo.text),
    h('button', { type: 'button', class: 'small', onclick: () => onRemove(todo.id) }, '삭제'),
  );
}

function FilterBar({ filter, onChange }) {
  const option = (value, label) =>
    h('button', { type: 'button', class: filter === value ? 'active' : '', onclick: () => onChange(value) }, label);
  return h('div', { class: 'row' },
    option('all', '전체'), option('active', '할 일'), option('done', '완료'),
  );
}

// R4: 같은 함수를 props만 바꿔 여러 번 사용
function StatBox({ label, value }) {
  return h('div', { class: 'statbox' },
    h('span', { class: 'label' }, label),
    h('strong', null, value),
  );
}

// R5: 형제 컴포넌트 두 개가 루트의 state 하나를 같이 씀
function NameInput({ name, onChange }) {
  return h('input', { type: 'text', value: name, placeholder: '이름 입력', oninput: (e) => onChange(e.target.value) });
}
function Greeting({ name }) {
  return h('p', { class: 'big' }, name === '' ? '이름을 입력해 보세요' : `안녕하세요, ${name}님`);
}

// 섹션 틀: 제목 + 확인 방법 + 내용
function Panel({ title, check, children }) {
  return h('section', { class: 'panel' },
    h('h2', null, title),
    h('p', { class: 'check' }, h('b', null, '확인 방법 '), check),
    children,
  );
}

function PartTitle({ children }) {
  return h('h2', { class: 'part' }, children);
}

// R6 검증용: 렌더 중에 본 화면 값을 기록했는지, effect가 몇 번 실행됐는지
let r6LastSeenInRender = null;
let r6EffectRuns = 0;

// ── 루트 컴포넌트: 모든 state는 여기에 ─────────────────────
function App() {
  renderCount += 1;
  $('stat-renders').textContent = renderCount;
  log(`렌더 #${renderCount}`);

  const [todos, setTodos] = useState([
    { id: 1, text: '빨래', done: true },
    { id: 2, text: '설거지', done: false },
    { id: 3, text: '공부', done: false },
  ]);
  const [text, setText] = useState('');
  const [nextId, setNextId] = useState(4);
  const [filter, setFilter] = useState('all');
  const [name, setName] = useState('');
  const [count, setCount] = useState(0);
  const [ticks, setTicks] = useState(0);   // R6: effect deps에 들어가는 값
  const [noise, setNoise] = useState(0);   // R6: effect와 관계없는 값
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [seconds, setSeconds] = useState(0);

  // R7: todos가 바뀔 때만 다시 계산
  const stats = useMemo(() => {
    memoCount += 1;
    $('stat-memo').textContent = memoCount;
    log(`useMemo 계산 #${memoCount}`);
    const done = todos.filter((t) => t.done).length;
    return { done, left: todos.length - done };
  }, [todos]);

  // R6-1: 렌더 중에는 화면이 아직 옛 값인지 기록 (ticks가 바뀐 렌더에서만)
  if (ticks !== r6LastSeenInRender) {
    const shown = document.getElementById('r6-value')?.textContent ?? '(아직 없음)';
    log(`R6 렌더 중: state=${ticks}, 화면=${shown}`);
    r6LastSeenInRender = ticks;
  }

  // R6-1, R6-2: patch 후에 실행되는지, ticks가 바뀔 때만 실행되는지
  useEffect(() => {
    r6EffectRuns += 1;
    $('stat-effect').textContent = r6EffectRuns;
    const shown = document.getElementById('r6-value').textContent;
    const ok = shown === String(ticks);
    log(`R6 effect: state=${ticks}, 화면=${shown} → ${ok ? '화면이 이미 바뀐 뒤 실행됨' : '화면이 아직 옛 값 (실패)'}`, ok ? 'ok' : 'err');
  }, [ticks]);

  useEffect(() => {
    document.title = `남은 일 ${stats.left}개`;
  }, [stats.left]);

  // R6-3: cleanup
  useEffect(() => {
    if (!running) return undefined;
    log(`타이머 시작 (${speed}ms)`, 'ok');
    const id = setInterval(() => setSeconds((s) => s + 1), speed);
    return () => {
      clearInterval(id);
      log(`cleanup → 타이머 정리 (${speed}ms)`, 'ok');
    };
  }, [running, speed]);

  // 이벤트 처리
  const addTodo = (e) => {
    e.preventDefault();
    if (text.trim() === '') return;
    setTodos((prev) => [...prev, { id: nextId, text: text.trim(), done: false }]);
    setNextId((id) => id + 1);
    setText('');
  };
  const toggle = (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos((prev) => prev.filter((t) => t.id !== id));
  const visible = todos.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done));

  return h('div', null,
    h(PartTitle, null, '요구사항 검증'),

    h(Panel, {
      title: 'R1. 데이터만 바꾸면 화면이 따라온다',
      check: '추가·체크·삭제·필터를 해 보세요. 목록, 아래 개수 문장, 탭 제목이 같이 바뀌면 성공입니다. 코드는 setTodos로 데이터만 바꾸고 DOM은 건드리지 않습니다.',
    }, [
      h('form', { class: 'row', onsubmit: addTodo },
        h('input', { type: 'text', value: text, placeholder: '할 일 입력 후 Enter', oninput: (e) => setText(e.target.value) }),
        h('button', { type: 'submit', class: 'primary' }, '추가'),
      ),
      h(FilterBar, { filter, onChange: setFilter }),
      visible.length === 0
        ? h('p', { class: 'muted' }, '표시할 항목이 없어요')
        : h('ul', { class: 'todos' }, visible.map((todo) => h(TodoItem, { todo, onToggle: toggle, onRemove: remove }))),
      h('p', null, `전체 ${todos.length}개 · 완료 ${stats.done}개 · 남은 일 ${stats.left}개`),
    ]),

    h(Panel, {
      title: 'R2. "데이터가 이럴 때 이렇게 생겼다"만 기술한다',
      check: '버튼으로 검증하는 항목이 아니라 코드로 확인합니다. 아래는 이 페이지가 실제로 쓰는 TodoItem의 소스입니다. 데이터(todo)를 받아 화면 모양(h)만 돌려줄 뿐, createElement나 textContent 같은 DOM 조작이 없습니다.',
    }, [
      h('pre', { class: 'code' }, TodoItem.toString()),
    ]),

    h(Panel, {
      title: 'R3. 다시 그려도 필요한 것만 바꾸고 입력이 유지된다',
      check: '아래 입력칸(state와 연결 안 됨)에 아무 글자나 쓰고 +1을 누르세요. 글자가 그대로 남고, 오른쪽 "실제 DOM 조작"이 추가 0 · 삭제 0이며 텍스트 변경만 있으면 성공입니다.',
    }, [
      h('p', { class: 'big' }, count),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => setCount((c) => c + 1) }, '+1'),
        h('input', { type: 'text', placeholder: '여기 입력해 두고 +1 누르기' }),
      ),
    ]),

    h(Panel, {
      title: 'R4. 재사용 가능한 조각으로 나눈다',
      check: '아래 세 칸은 모두 같은 StatBox 함수에 label과 value만 다르게 넘긴 것입니다. R1의 할 일 항목도 TodoItem 하나로 항목 수만큼 그립니다. 할 일을 체크하면 세 칸이 각자 자기 값으로 바뀌면 성공입니다.',
    }, [
      h('div', { class: 'stats' },
        h(StatBox, { label: '전체', value: todos.length }),
        h(StatBox, { label: '완료', value: stats.done }),
        h(StatBox, { label: '남은 일', value: stats.left }),
      ),
      h('p', { class: 'muted' }, `TodoItem 함수 하나로 그린 항목: ${visible.length}개`),
    ]),

    h(Panel, {
      title: 'R5. 데이터가 어디 있고 어디서 바뀌는지 예측 가능하다',
      check: 'NameInput과 Greeting은 서로 모르는 형제 컴포넌트입니다. 입력칸에 이름을 쓰면 아래 인사말이 바뀌면 성공입니다. name은 App에만 있고, NameInput은 받은 onChange로 App의 값을 바꾸며, Greeting은 받은 name을 보여 주기만 합니다.',
    }, [
      h('div', { class: 'row' }, h(NameInput, { name, onChange: setName })),
      h(Greeting, { name }),
      h('p', { class: 'muted mono' }, `state 위치: App.name = "${name}" → NameInput(name, onChange) · Greeting(name)`),
    ]),

    h(Panel, {
      title: 'R6. 렌더 후, 필요할 때만 부가 작업을 실행한다',
      check: '① "관련 있는 값 +1"을 누르면 로그에 "렌더 중: 화면=옛 값"과 "effect: 화면=새 값 → 화면이 이미 바뀐 뒤 실행됨"이 찍히면 렌더 후 실행 성공입니다. ② "관련 없는 값 +1"을 누르면 렌더 횟수는 늘지만 "R6 effect 실행" 횟수는 그대로여야 합니다. ③ 타이머를 시작한 뒤 속도를 바꾸면 cleanup → 시작 순서로 찍혀야 합니다.',
    }, [
      h('p', { class: 'big' }, '관련 있는 값: ', h('span', { id: 'r6-value' }, ticks), h('small', null, ` · 관련 없는 값: ${noise}`)),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => { log('클릭: 관련 있는 값 +1'); setTicks((t) => t + 1); } }, '관련 있는 값 +1'),
        h('button', { type: 'button', onclick: () => { log('클릭: 관련 없는 값 +1 → R6 effect 실행 안 돼야 함'); setNoise((n) => n + 1); } }, '관련 없는 값 +1'),
      ),
      h('h3', null, `cleanup 확인: ${seconds}초`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: running ? 'active' : '', onclick: () => setRunning((r) => !r) }, running ? '타이머 정지' : '타이머 시작'),
        h('select', { value: String(speed), onchange: (e) => setSpeed(Number(e.target.value)) },
          h('option', { value: '1000' }, '1초마다'),
          h('option', { value: '500' }, '0.5초마다'),
          h('option', { value: '200' }, '0.2초마다'),
        ),
        h('button', { type: 'button', onclick: () => setSeconds(0) }, '0으로'),
      ),
    ]),

    h(Panel, {
      title: 'R7. 바뀐 게 없으면 계산을 재사용한다',
      check: 'R3의 +1이나 R6의 버튼처럼 할 일과 관계없는 버튼을 누르면 오른쪽 "useMemo 계산 횟수"가 그대로, 할 일을 체크하면 1 늘어나면 성공입니다.',
    }, [
      h('p', null, `useMemo 결과: 완료 ${stats.done}개 / 남은 일 ${stats.left}개`),
    ]),

    h(Panel, {
      title: 'R9. 여러 상태 변경을 한 번의 렌더로 묶는다',
      check: '버튼 한 번에 setCount를 3번 부릅니다. 숫자가 3 늘고 오른쪽 렌더 횟수는 1만 늘면 성공입니다.',
    }, [
      h('p', { class: 'big' }, count),
      h('button', {
        type: 'button',
        onclick: () => {
          log('클릭: setCount 3번');
          setCount((c) => c + 1); setCount((c) => c + 1); setCount((c) => c + 1);
        },
      }, '+3 (setState 3번)'),
    ]),

    h(Panel, {
      title: '참고: R8. key 없음 (범위 밖)',
      check: '"맨 앞 삭제"를 누르면 결과는 맞지만, 오른쪽 DOM 조작에 텍스트 변경이 여러 개 찍힙니다. 뒤 항목을 한 칸씩 고쳐 그리기 때문이고, key를 구현하면 삭제 1개로 줄어듭니다.',
    }, [
      h('button', { type: 'button', onclick: () => setTodos((prev) => prev.slice(1)) }, '맨 앞 삭제'),
    ]),

    h(PartTitle, null, '구현 규칙 확인 (요구사항 아님)'),

    h(Panel, {
      title: '규칙 5-1, 5-2. setState 동작',
      check: '"값 방식 3번"은 숫자가 1만 늘어야 합니다(렌더 당시 값을 3번 넣으니까). "같은 값 넣기"는 렌더 횟수가 늘지 않아야 합니다. hook 순서 검사(규칙 3-3)는 오른쪽 버튼으로 확인합니다.',
    }, [
      h('p', { class: 'big' }, count),
      h('div', { class: 'row' },
        h('button', {
          type: 'button',
          onclick: () => {
            log('클릭: 값 방식 setCount(count + 1) 3번');
            setCount(count + 1); setCount(count + 1); setCount(count + 1);
          },
        }, '값 방식 3번'),
        h('button', {
          type: 'button',
          onclick: () => { log('클릭: 같은 값으로 setCount → 렌더 없어야 함'); setCount((c) => c); },
        }, '같은 값 넣기'),
      ),
    ]),
  );
}

// ── 마운트 ────────────────────────────────────────────────
const appRoot = $('app');
new FunctionComponent(App).mount(appRoot);

// 실제 DOM 조작 수 세기 (마운트 이후부터)
new MutationObserver((records) => {
  const added = records.reduce((n, r) => n + r.addedNodes.length, 0);
  const removed = records.reduce((n, r) => n + r.removedNodes.length, 0);
  const attrs = records.filter((r) => r.type === 'attributes').length;
  const texts = records.filter((r) => r.type === 'characterData').length;
  $('stat-dom').textContent = `추가 ${added} · 삭제 ${removed} · 속성 ${attrs} · 텍스트 ${texts}`;
}).observe(appRoot, { childList: true, attributes: true, characterData: true, subtree: true });

// ── 구현 규칙 3-3: hook 순서 검사 (오류가 나야 정상) ─────────────────────
$('btn-bad-order').addEventListener('click', () => {
  // (1) hook 종류가 바뀌는 경우: if/else로 서로 다른 hook
  let first = true;
  function SwapKind() {
    if (first) useState(1); else useMemo(() => 1, []);
    return h('p', null, 'x');
  }
  const a = new FunctionComponent(SwapKind);
  a.mount(document.createElement('div'));
  first = false;
  try { a.update(); log('종류 검사: 오류가 안 났어요 (실패)', 'err'); } catch (e) { log(`종류 검사 성공: ${e.message}`, 'ok'); }

  // (2) hook 개수가 바뀌는 경우: if 안의 hook
  let show = true;
  function SkipHook() {
    if (show) useState(1);
    useState(2);
    return h('p', null, 'x');
  }
  const b = new FunctionComponent(SkipHook);
  b.mount(document.createElement('div'));
  show = false;
  try { b.update(); log('개수 검사: 오류가 안 났어요 (실패)', 'err'); } catch (e) { log(`개수 검사 성공: ${e.message}`, 'ok'); }
});

$('btn-bad-outside').addEventListener('click', () => {
  try { useState(0); log('밖에서 부른 hook: 오류가 안 났어요 (실패)', 'err'); } catch (e) { log(`밖에서 부른 hook 검사 성공: ${e.message}`, 'ok'); }
});

$('btn-clear-log').addEventListener('click', () => logList.replaceChildren());
