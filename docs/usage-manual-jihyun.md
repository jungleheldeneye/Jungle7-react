# 미니 React 사용 매뉴얼

Vanilla JS로 만든 작은 React입니다. 화면을 "데이터가 이럴 때 이렇게 생겼다"로 적어 두면, 데이터가 바뀔 때 바뀐 부분만 실제 화면에 반영해 줍니다.

이 문서만 읽고 페이지 하나를 만들 수 있도록 순서대로 설명합니다. React를 몰라도 됩니다.

---

## 1. 준비

### 파일 구성

| 파일 | 가져다 쓰는 것 |
| --- | --- |
| `src/vdom.js` | `h` (화면 기술) |
| `src/component.js` | `FunctionComponent` (화면에 붙이기) |
| `src/hooks.js` | `useState`, `useEffect`, `useMemo` (상태와 부가 작업) |

`src/diff.js`, `src/patch.js`는 내부에서 쓰므로 직접 가져올 일이 없습니다.

### 실행 방법

ES 모듈(`import`)을 쓰기 때문에 HTML 파일을 더블클릭해서 열면 동작하지 않습니다. 저장소 루트에서 로컬 서버를 띄웁니다.

```bash
npx serve .
```

Python이 있다면 이것도 됩니다.

```bash
python -m http.server 3000
```

그다음 브라우저에서 `http://localhost:3000/pages/demo/`처럼 페이지 경로를 엽니다.

---

## 2. 첫 페이지 만들기

`pages/demo/index.html`

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>카운터</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

`pages/demo/main.js`

```js
import { h } from '../../src/vdom.js';
import { FunctionComponent } from '../../src/component.js';
import { useState } from '../../src/hooks.js';

function App() {
  const [count, setCount] = useState(0);

  return h('div', null,
    h('p', null, '카운트: ', count),
    h('button', { onClick: () => setCount((c) => c + 1) }, '+1'),
  );
}

new FunctionComponent(App).mount(document.getElementById('app'));
```

버튼을 누르면 숫자가 올라갑니다. 이 짧은 코드에 필요한 개념이 다 들어 있습니다.

- `App`은 **컴포넌트**입니다. 화면을 돌려주는 함수입니다.
- `h(...)`로 **화면을 기술**합니다.
- `useState`로 **상태**를 만들고, `setCount`로 바꾸면 화면이 다시 그려집니다.
- `FunctionComponent(...).mount(...)`로 **실제 페이지에 붙입니다.** `#app` 안에 원래 있던 내용은 지워집니다.

---

## 3. `h`로 화면 기술하기

```js
h(태그이름, 속성, 자식1, 자식2, ...)
```

```js
h('h1', null, '안녕하세요')
// → <h1>안녕하세요</h1>

h('a', { href: 'https://example.com', class: 'link' }, '이동')
// → <a href="https://example.com" class="link">이동</a>

h('ul', null,
  h('li', null, '하나'),
  h('li', null, '둘'),
)
// → <ul><li>하나</li><li>둘</li></ul>
```

### 속성 (두 번째 인자)

- 속성이 없으면 `null`을 넣습니다.
- 이름은 **HTML 그대로** 씁니다. React의 `className`이 아니라 `class`입니다.
- `style`은 문자열로 씁니다: `{ style: 'color: red; font-weight: bold' }`
- `true`/`false` 값을 쓰면 켜고 끌 수 있습니다: `{ disabled: true }` → `disabled`, `{ disabled: false }` → 속성 없음

### 자식 (세 번째 인자부터)

| 넣은 값 | 결과 |
| --- | --- |
| 문자열 `'빨래'` | 글자 |
| 숫자 `3` | 글자 `"3"` |
| `h(...)` | 요소 |
| 배열 `[h(...), h(...)]` | 펼쳐서 차례로 넣음 |
| `null`, `undefined`, `true`, `false` | 아무것도 그리지 않음 |

이 규칙 덕분에 **조건부 화면**과 **목록**을 쉽게 쓸 수 있습니다.

```js
// 조건부: 로그인했을 때만 보이기
h('div', null,
  isLoggedIn && h('p', null, '환영합니다'),
  isLoggedIn ? h('button', null, '로그아웃') : h('button', null, '로그인'),
)

// 목록: 배열을 map으로 바꿔서 넣기
h('ul', null,
  todos.map((todo) => h('li', null, todo.text)),
)
```

> **주의:** `count && h(...)`에서 `count`가 `0`이면 화면에 "0"이 찍힙니다. 숫자는 `count > 0 && h(...)`처럼 참/거짓으로 바꿔서 쓰세요.

---

## 4. 컴포넌트로 나누기

화면 조각을 함수로 만들어 재사용할 수 있습니다. 첫 인자에 태그 이름 대신 **함수**를 넣고, 두 번째 인자가 그 함수의 `props`가 됩니다.

```js
function TodoItem(props) {
  return h('li', { class: props.done ? 'done' : '' },
    props.text,
    props.done && h('span', null, ' (완료)'),
  );
}

function App() {
  return h('ul', null,
    h(TodoItem, { text: '빨래', done: true }),
    h(TodoItem, { text: '설거지', done: false }),
  );
}
```

`h` 사이에 넣은 자식은 `props.children`으로 받습니다.

```js
function Card(props) {
  return h('div', { class: 'card' },
    h('h2', null, props.title),
    props.children,
  );
}

h(Card, { title: '오늘 할 일' },
  h('p', null, '내용 1'),
  h('p', null, '내용 2'),
)
```

### 규칙: 상태는 맨 위 컴포넌트(루트)에만

- `useState`, `useEffect`, `useMemo`는 **`mount`에 넘긴 루트 컴포넌트 안에서만** 씁니다.
- 자식 컴포넌트는 `props`만 받아서 화면을 돌려주는 함수로 만듭니다.
- 자식이 데이터를 바꿔야 하면, 루트가 바꾸는 함수를 `props`로 내려 줍니다. (아래 "할 일 목록" 예시 참고)

자식 컴포넌트는 `h`가 그 자리에서 바로 호출하기 때문에, 자식 안에서 hook을 부르면 루트의 상태 칸과 섞여 버립니다.

- 컴포넌트는 **요소 하나**를 돌려줘야 합니다. 여러 개라면 `div` 같은 요소 하나로 감싸세요.

---

## 5. 이벤트

`on` + 대문자로 시작하는 속성에 함수를 넣습니다.

```js
h('button', { onClick: () => alert('눌렀어요') }, '누르기')
h('input', { onInput: (e) => console.log(e.target.value) })
h('form', { onSubmit: (e) => { e.preventDefault(); /* 처리 */ } }, ...)
```

`onClick`, `onInput`, `onChange`, `onSubmit`, `onKeyDown`처럼 브라우저 이벤트 이름이면 무엇이든 됩니다. 이벤트 객체 `e`를 받을 수 있습니다.

---

## 6. 상태: `useState`

```js
const [값, 바꾸는함수] = useState(초깃값);
```

```js
function App() {
  const [name, setName] = useState('');
  const [todos, setTodos] = useState([]);
  ...
}
```

### 값 바꾸기

```js
setName('철수');              // 새 값을 직접
setCount((prev) => prev + 1); // 이전 값을 받아 계산
```

**한 번에 여러 번 바꿀 때는 함수 방식을 쓰세요.**

```js
// 버튼 한 번에 2 올리기
setCount(count + 1);
setCount(count + 1);         // ✗ 결과 1 (둘 다 같은 count를 봄)

setCount((c) => c + 1);
setCount((c) => c + 1);      // ✓ 결과 2
```

### 화면은 언제 바뀌나요?

`setXxx`를 불러도 **화면은 바로 바뀌지 않습니다.** 지금 처리 중인 작업(클릭 처리 등)이 끝난 직후, 그동안 바꾼 것을 모아서 **한 번만** 다시 그립니다. 그래서 `setXxx` 바로 다음 줄에서 화면이나 변수 `count`를 읽으면 아직 옛 값입니다.

### 배열과 객체는 새로 만들어서

같은 값을 넣으면 다시 그리지 않습니다. 배열이나 객체를 직접 고치면 "같은 값"으로 보여 화면이 안 바뀝니다.

```js
todos.push(newTodo); setTodos(todos);            // ✗ 화면 안 바뀜
setTodos([...todos, newTodo]);                   // ✓ 추가
setTodos(todos.filter((t) => t.id !== id));      // ✓ 삭제
setTodos(todos.map((t) =>                        // ✓ 한 항목 수정
  t.id === id ? { ...t, done: !t.done } : t));
setUser({ ...user, name: '영희' });               // ✓ 객체 수정
```

---

## 7. 입력 폼

입력칸의 값을 상태와 연결하려면 `value`(체크박스는 `checked`)와 이벤트를 함께 씁니다.

```js
function App() {
  const [text, setText] = useState('');
  const [agree, setAgree] = useState(false);

  return h('div', null,
    h('input', { value: text, onInput: (e) => setText(e.target.value) }),
    h('label', null,
      h('input', { type: 'checkbox', checked: agree, onChange: (e) => setAgree(e.target.checked) }),
      ' 동의',
    ),
    h('button', { onClick: () => setText('') }, '비우기'),
    h('p', null, '입력: ', text),
  );
}
```

`value`와 `checked`는 상태를 바꾸면 화면의 입력칸에도 바로 반영됩니다. "비우기"를 누르면 입력칸이 실제로 비워집니다.

---

## 8. 렌더 후 작업: `useEffect`

화면이 그려진 **다음에** 해야 하는 일(문서 제목 바꾸기, 타이머, 로그 등)에 씁니다.

```js
useEffect(() => {
  document.title = `할 일 ${todos.length}개`;
}, [todos]);
```

두 번째 인자(deps)로 **언제 다시 실행할지** 정합니다.

| deps | 실행 시점 |
| --- | --- |
| 안 넣음 | 화면을 그릴 때마다 |
| `[]` | 처음 한 번만 |
| `[a, b]` | 처음, 그리고 `a`나 `b`가 바뀌었을 때 |

### 정리 함수 (cleanup)

함수를 반환하면, **다음에 이 effect가 다시 실행되기 직전에** 그 함수가 먼저 실행됩니다. 타이머처럼 정리가 필요한 작업에 씁니다.

```js
const [seconds, setSeconds] = useState(0);
const [speed, setSpeed] = useState(1000);

useEffect(() => {
  const id = setInterval(() => setSeconds((s) => s + 1), speed);
  return () => clearInterval(id);   // speed가 바뀌면 이전 타이머를 멈춤
}, [speed]);
```

effect 안에서 `setXxx`를 불러도 됩니다. 다음 렌더가 예약됩니다. 다만 deps 없이 effect 안에서 매번 상태를 바꾸면 끝없이 다시 그리니 주의하세요.

---

## 9. 계산 재사용: `useMemo`

무거운 계산을, 재료가 바뀌었을 때만 다시 하게 합니다.

```js
const doneCount = useMemo(
  () => todos.filter((t) => t.done).length,
  [todos],
);
```

deps 규칙은 `useEffect`와 같습니다. 차이는 화면을 그리는 **중에** 바로 계산해서 값을 돌려준다는 점입니다.

---

## 10. 종합 예시: 할 일 목록

```js
import { h } from '../../src/vdom.js';
import { FunctionComponent } from '../../src/component.js';
import { useState, useEffect, useMemo } from '../../src/hooks.js';

// 자식 컴포넌트: props만 받는다
function TodoItem({ todo, onToggle, onRemove }) {
  return h('li', { class: todo.done ? 'done' : '' },
    h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }),
    ' ', todo.text, ' ',
    h('button', { onClick: () => onRemove(todo.id) }, '삭제'),
  );
}

// 루트 컴포넌트: 상태는 여기에만
function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');
  const [nextId, setNextId] = useState(1);

  const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);

  useEffect(() => {
    document.title = `남은 일 ${todos.length - doneCount}개`;
  }, [todos, doneCount]);

  const add = (e) => {
    e.preventDefault();
    if (text.trim() === '') return;
    setTodos((prev) => [...prev, { id: nextId, text, done: false }]);
    setNextId((id) => id + 1);
    setText('');
  };
  const toggle = (id) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) =>
    setTodos((prev) => prev.filter((t) => t.id !== id));

  return h('div', null,
    h('h1', null, '할 일'),
    h('form', { onSubmit: add },
      h('input', { value: text, placeholder: '할 일 입력', onInput: (e) => setText(e.target.value) }),
      h('button', { type: 'submit' }, '추가'),
    ),
    todos.length === 0
      ? h('p', null, '할 일이 없어요')
      : h('ul', null, todos.map((todo) => h(TodoItem, { todo, onToggle: toggle, onRemove: remove }))),
    h('p', null, `${todos.length}개 중 ${doneCount}개 완료`),
  );
}

new FunctionComponent(App).mount(document.getElementById('app'));
```

---

## 11. 꼭 지켜야 할 규칙

1. **hook은 루트 컴포넌트 안에서만** 부릅니다. 컴포넌트 밖에서 부르면 오류가 납니다.
2. **hook은 `if`, `for` 안에서 부르지 않습니다.** 항상 같은 순서, 같은 개수로 불러야 합니다. 어기면 "hook 순서가 바뀌었어요" 또는 "렌더마다 hook 개수가 같아야 해요" 오류가 납니다.
3. **배열과 객체 상태는 새로 만들어서** `setXxx`에 넣습니다.
4. **컴포넌트는 요소 하나를** 돌려줍니다.

---

## 12. 아직 안 되는 것

| 기능 | 상태 | 영향 |
| --- | --- | --- |
| key로 목록 최적화 | 없음 | 목록 앞쪽을 지우면 결과는 맞지만 뒤 항목을 하나씩 고쳐 그림. 상태와 연결되지 않은 입력칸이 목록 항목 안에 있으면 입력한 글자가 다른 항목으로 밀릴 수 있음 |
| 자식 컴포넌트의 자체 상태 | 없음 | 상태는 루트에 두고 props로 내려 줘야 함 |
| 여러 요소 반환 (Fragment) | 없음 | `div` 등으로 감싸야 함 |
| 컴포넌트 제거 시 cleanup | 없음 | 페이지를 떠나기 전 정리가 필요하면 직접 처리 |
| SVG 태그 | 없음 | `svg`, `path` 등은 제대로 그려지지 않음 |

---

## 13. API 요약

| 함수 | 설명 |
| --- | --- |
| `h(type, props, ...children)` | `type`이 문자열이면 요소, 함수면 컴포넌트 호출. 결과는 VDOM |
| `new FunctionComponent(App, props?)` | 루트 컴포넌트를 감쌈. `props`는 `App`에 전달 |
| `.mount(container)` | `container` 안에 처음 그림 (기존 내용은 지움) |
| `useState(initial)` | `[값, setValue]`. `setValue(새값)` 또는 `setValue(prev => 새값)` |
| `useEffect(fn, deps?)` | 화면 반영 후 `fn` 실행. `fn`이 함수를 반환하면 다음 실행 전에 그 함수 실행 |
| `useMemo(fn, deps?)` | `deps`가 바뀌었을 때만 `fn`을 다시 실행해 값을 돌려줌 |
