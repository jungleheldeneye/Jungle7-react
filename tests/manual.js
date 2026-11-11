/**
 * 손으로 해보는 행(T02-수동, T07, T23, T24)의 작은 앱들
 */
import { h } from '../src/vdom.js';
import { render } from '../src/component.js';
import { useState, useEffect } from '../src/hooks.js';

const TODOS = [
  { id: 1, text: '빨래' },
  { id: 2, text: '설거지' },
  { id: 3, text: '장보기' },
];

/** T02: +1 버튼과 렌더 횟수 */
function mountT02(container, counterEl) {
  let renders = 0;
  function Counter() {
    renders += 1;
    const [count, setCount] = useState(0);
    useEffect(() => { counterEl.textContent = String(renders - 1); });
    return h('div', null,
      h('p', null, `count = ${count}`),
      h('button', { onclick: () => setCount((c) => c + 1) }, '+1'));
  }
  return render(Counter, container);
}

/** T07: 입력창 + 삭제 버튼 있는 목록 (key 있음) */
function mountT07(container) {
  function App() {
    const [todos, setTodos] = useState(TODOS);
    const [draft, setDraft] = useState('');
    const remove = (id) => setTodos((list) => list.filter((t) => t.id !== id));
    return h('div', null,
      h('input', { value: draft, placeholder: '여기에 글자를 쓰는 중…', oninput: (e) => setDraft(e.target.value) }),
      h('ul', null, todos.map((t) => h('li', { key: t.id },
        h('span', null, `${t.text} `),
        h('button', { onclick: () => remove(t.id) }, '삭제')))));
  }
  return render(App, container);
}

/** T23: 항목을 만들 때 랜덤 id를 정해 두고 key로 쓰는 목록 + 맨 앞에 추가 */
function mountT23(container) {
  let count = 0;
  const newTodo = (text) => ({ id: crypto.randomUUID(), text });   // 만들 때 한 번만 랜덤
  const initial = TODOS.map((t) => newTodo(t.text));
  function App() {
    const [todos, setTodos] = useState(initial);
    const prepend = () => {
      count += 1;
      setTodos((list) => [newTodo(`새 항목 ${count}`), ...list]);
    };
    return h('div', null,
      h('button', { onclick: prepend }, '맨 앞에 추가'),
      h('ul', null, todos.map((t) => h('li', { key: t.id },
        h('input', { type: 'checkbox' }),
        h('span', null, ` ${t.text}`)))));
  }
  return render(App, container);
}

/** T24: Phase 1 페이지에 붙여 넣을 <ul> + <li> 1000개 */
export function thousandItemsHtml() {
  const items = Array.from({ length: 1000 }, (_, i) => `  <li>항목 ${i + 1}</li>`).join('\n');
  return `<ul>\n${items}\n</ul>`;
}

export const T24_CONSOLE = "const keys = [...document.querySelectorAll('#test-area li')].map((li) => li.dataset.key); console.log('li', keys.length, '개, 서로 다른 key', new Set(keys).size, '개, key 없는 li', keys.filter((k) => !k).length, '개');";

export function mountManual() {
  const apps = [
    mountT02(document.getElementById('t02-app'), document.getElementById('t02-renders')),
    mountT07(document.getElementById('t07-app')),
    mountT23(document.getElementById('t23-app')),
  ];

  document.getElementById('t02-reset').onclick = () => {
    apps[0].unmount();
    apps[0] = mountT02(document.getElementById('t02-app'), document.getElementById('t02-renders'));
    document.getElementById('t02-renders').textContent = '0';
  };

  const html = document.getElementById('t24-html');
  html.value = thousandItemsHtml();
  document.getElementById('t24-console').value = T24_CONSOLE;
}
