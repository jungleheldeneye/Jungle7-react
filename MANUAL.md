# Mini React 이용 매뉴얼

`src/`의 미니 React로 화면을 만드는 방법을 정리했어요. 빌드 도구 없이 브라우저의 ES 모듈로 바로 써요.

## 1. 시작하기

### 파일 불러오기

```js
import { h } from './src/vdom.js';
import { render } from './src/component.js';
import { useState, useEffect, useMemo } from './src/hooks.js';
```

경로는 내 파일 위치에 맞게 바꿔요. 예를 들어 `pages/phase1/`에서는 `../../src/…`예요.

### 로컬 서버로 열기

ES 모듈은 `file://`로 열면 막혀요. 저장소 루트에서 서버를 띄워요.

```bash
npx --yes http-server -p 5173 -c-1
```

그다음 `http://localhost:5173/pages/phase1/`을 열어요.

### 가장 작은 예

```js
function Counter() {
  const [count, setCount] = useState(0);
  return h('div', null,
    h('p', null, `count = ${count}`),
    h('button', { onclick: () => setCount((c) => c + 1) }, '+1'));
}

const app = render(Counter, document.getElementById('app'));
```

## 2. 화면 그리기: `h`

```js
h(type, props, ...children)
```

| 인자 | 넣는 것 | 예 |
|---|---|---|
| `type` | 태그 이름 문자열, 또는 자식 컴포넌트 함수 | `'li'`, `TodoItem` |
| `props` | 속성 객체. 없으면 `null` | `{ class: 'done', key: 3 }` |
| `children` | 자식 여러 개. 배열을 넣으면 펴서 늘어놓아요 | `'빨래'`, `list.map(...)` |

### props 쓰는 법

- **보통 속성:** `class`, `type`, `placeholder`, `aria-label`처럼 HTML 이름 그대로 써요. `className`이 아니라 `class`예요.
- **이벤트:** `onclick`, `oninput`처럼 **소문자 `on…`** 이름에 함수를 넣어요. `onClick`이 아니에요. 노드 속성으로 직접 넣어서 리스너를 따로 뗄 필요가 없어요.
- **입력창 값:** `value`를 넣으면 사용자가 친 글자도 그 값으로 맞춰요.
- **`key`:** 목록 항목을 구별하는 값이에요. DOM 속성으로는 들어가지 않아요(아래 4장).
- **속성 지우기:** 다음 렌더에서 그 속성을 빼면 DOM에서도 지워져요.

### 자식으로 넣을 수 있는 값

| 값 | 화면 |
|---|---|
| 문자열, 숫자(`0` 포함) | 글자 |
| `null`, `undefined`, `true`, `false` | 아무것도 안 보여요. 빈 주석으로 자리만 남겨요 |
| `h(...)` 결과 | 그 요소 |

`cond && h('p', null, '보임')`처럼 써도 돼요. 꺼질 때 자리를 남기기 때문에, 뒤에 있는 입력창이 다시 만들어지지 않고 친 글자도 그대로예요.

## 3. 컴포넌트

### 루트 컴포넌트 하나만 상태를 가져요

- `render(App, container)`에 넘긴 함수 하나가 **루트**예요.
- hook(`useState`, `useEffect`, `useMemo`)은 **루트 안에서만** 부를 수 있어요.
- 자식 컴포넌트는 **props만 받아서 VDOM을 돌려주는 함수**예요. 상태가 필요하면 루트로 올리고(lifting up), 값과 바꾸는 함수를 props로 내려줘요.

```js
function TodoItem({ todo, onToggle }) {        // 자식: hook 없음
  return h('li', todo.done ? { class: 'done' } : {},
    h('span', { onclick: () => onToggle(todo.id) }, todo.text));
}

function App() {                               // 루트: 상태는 여기에
  const [todos, setTodos] = useState([{ id: 1, text: '빨래', done: false }]);
  const toggle = (id) => setTodos((list) =>
    list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  return h('ul', null, todos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle: toggle })));
}
```

- 자식은 `h(TodoItem, props)`로 넣어요. `TodoItem(props)`로 직접 부르지 않아요.
- 자식이 받는 props에는 `children`도 들어 있어요. `key`는 빠져요.
- 자식은 아무 값이나 돌려줘도 돼요. `null`을 돌려주면 안 보여요.

## 4. 목록과 `key`

목록을 그릴 때는 항목마다 **변하지 않는 고유한 값**을 `key`로 줘요.

```js
todos.map((todo) => h(TodoItem, { key: todo.id, todo }))
```

- `key`가 있으면 맨 앞에 끼워 넣어도 기존 항목 노드를 그대로 옮겨서 써요.
- 배열 순번(`index`)은 `key`로 쓰지 마세요. 앞에 끼워 넣으면 번호가 다 밀려서 `key`가 없는 것과 같아져요.
- 자식 컴포넌트를 쓸 때는 `key`를 두 곳 중 어디에 적어도 돼요.
  - 부모 쪽: `h(TodoItem, { key: todo.id, todo })`. 이 `key`는 그 컴포넌트가 돌려준 루트 요소로 옮겨져요.
  - 자식 쪽: TodoItem 안에서 `h('li', { key: todo.id }, …)`. 루트 요소에 직접 적어요.
  - 둘 다 적으면 **자식 쪽** `key`를 써요.
  - 루트 요소보다 안쪽(`li` 안의 `span` 등)에 적은 `key`는 목록 비교에 쓰이지 않아요.

## 5. Hooks

### `useState`: 값 기억하기

```js
const [value, setValue] = useState(초기값);
setValue(새 값);
setValue((이전 값) => 새 값);
```

- `setValue`를 불러도 **화면은 바로 안 바뀌어요.** 다시 그리기를 예약하고, 지금 하던 일이 끝나면 한 번에 그려요.
- 한 번에 여러 번 불러도 다시 그리기는 한 번이에요.
- 이전 값을 바탕으로 바꿀 때는 함수형으로 써요. `setCount(count + 1)`을 세 번 부르면 셋 다 같은 `count`를 보고 1만 늘어요. `setCount((c) => c + 1)`을 세 번 부르면 3이 늘어요.
- 같은 값(`Object.is`로 같음)을 넣으면 다시 그리지 않아요.
- 배열이나 객체는 **새로 만들어서** 넣어요. `list.push(x); setList(list)`는 같은 배열이라 화면이 안 바뀌어요. `setList([...list, x])`로 써요.

### `useMemo`: 계산 결과 재사용하기

```js
const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);
```

- 렌더 중에 바로 계산해요. deps가 지난번과 같으면 계산하지 않고 지난 값을 돌려줘요.
- deps 비교는 칸마다 `Object.is`로 해요.

### `useEffect`: 화면에 붙은 뒤 할 일

```js
useEffect(() => {
  // 화면이 다 고쳐진 뒤 실행돼요. 바뀐 DOM을 읽을 수 있어요
  return () => { /* cleanup: 걸어 둔 것 풀기 (필요할 때만) */ };
}, [deps]);
```

**언제 실행되나**

| deps | 실행 시점 |
|---|---|
| 안 넘김 | 렌더할 때마다 |
| `[]` | 처음 한 번만 |
| `[a, b]` | 처음, 그리고 `a`나 `b`가 바뀐 렌더마다 |

**cleanup은 언제 return하나**

effect가 끝난 뒤에도 **바깥의 무언가가 내 함수를 쥐고 있으면** return해요. 값만 쓰고 끝나는 effect는 return하지 않아도 돼요.

| effect에서 한 일 | return할 cleanup |
|---|---|
| `setInterval`, `setTimeout` | `() => clearInterval(id)` |
| `window.addEventListener(...)` | `() => window.removeEventListener(...)` |
| `new WebSocket(...)` | `() => socket.close()` |
| `store.subscribe(fn)` | `() => unsubscribe()` |
| `document.title = …` | 필요 없음 |

**cleanup이 불리는 때**

1. deps가 바뀌어서 같은 effect를 다시 실행하기 직전 (옛 값으로 건 것을 풀고 새 값으로 다시 걸기)
2. `unmount()` 할 때 (마지막 정리, 6장)

```js
useEffect(() => {
  const id = setInterval(() => setSeconds((s) => s + 1), 1000);
  return () => clearInterval(id);
}, []);
```

### deps는 이렇게 정해요

- effect나 memo 함수 안에서 읽는 **렌더 값**(state, props, 그걸로 계산한 값)은 전부 deps에 넣어요.
- 빠뜨리면 그 값이 바뀌어도 다시 실행되지 않아서, 옛 값을 계속 쓰게 돼요.

## 6. 화면에서 떼기: `unmount`

```js
const app = render(App, container);
// ...
app.unmount();
```

`unmount()`가 하는 일은 이래요.

1. 이 앱을 "떼어짐"으로 표시해요. 이후에 오는 `setState`와 이미 예약된 다시 그리기는 무시돼요.
2. 아직 실행 안 된 effect는 버려요.
3. 모든 effect의 cleanup을 hook 순서대로 불러요. cleanup 하나가 에러를 던져도 나머지는 끝까지 불러요. 다 부른 뒤 첫 에러를 다시 던져요.
4. 루트 DOM을 container에서 떼요.

- 두 번 불러도 안전해요. 두 번째부터는 아무 일도 안 해요.
- 떼어진 인스턴스는 다시 붙일 수 없어요. 다시 보여 주려면 `render(App, container)`를 새로 불러요. 상태는 처음 값부터 시작해요.
- 같은 container에 `render`를 다시 하기 전에는 **꼭 앞의 앱을 `unmount()`** 해요. `render`는 container를 비우지 않고 뒤에 붙이기 때문에, 안 떼면 앞의 앱과 그 타이머가 그대로 남아요.

## 7. Hook 규칙과 에러 메시지

hook은 칸 번호(부른 순서)로 값을 찾아요. 그래서 아래 규칙을 어기면 바로 에러가 나요. 이 검사는 항상 켜져 있어요.

| 하지 말 것 | 에러 메시지 |
|---|---|
| 컴포넌트 밖(클릭 핸들러, 모듈 맨 위 등)에서 hook 부르기 | `useState는 컴포넌트를 그리는 중에만 부를 수 있습니다` |
| 자식 컴포넌트에서 hook 부르기 | `useState는 루트 컴포넌트에서만 부를 수 있습니다. 자식은 props만 받습니다` |
| if·for 안에서 불러서 **순서**가 바뀜 | `hooks[0]는 지난 렌더에서 useState였는데 이번엔 useMemo입니다. …` |
| if·for 안이나 이른 return 뒤에서 불러서 **개수**가 바뀜 | `hook 개수가 바뀌었습니다: 지난 렌더 2개, 이번 1개. …` |

메시지의 `useState` 자리에는 실제로 부른 hook 이름이 들어가요.

**고치는 법:** hook은 루트 함수 맨 위에서 조건 없이, 매번 같은 순서로 불러요. 조건은 hook **안**에서 처리해요.

```js
// ✗
if (open) { useEffect(() => { /* ... */ }, [open]); }

// ✓
useEffect(() => {
  if (!open) return;
  /* ... */
}, [open]);
```

## 8. 알아 둘 제약

- **루트 하나만 상태를 가져요.** 자식마다 따로 상태를 두는 기능은 없어요.
- **`render`는 props를 받지 않아요.** 루트에는 항상 `{}`가 넘어가요.
- **effect가 에러를 던지면** 같은 렌더에서 그 뒤에 있는 effect는 실행되지 않아요. 그 effect들은 deps가 다시 바뀔 때까지 재실행되지 않아요. effect 안에서 실패할 수 있는 일은 직접 try/catch로 감싸요.
- **화면이 바뀌는 시점:** `setState` 직후가 아니라 microtask 한 번 뒤예요. 테스트에서는 `await Promise.resolve()` 뒤에 화면을 확인해요.
- **이벤트 함수는 렌더마다 새로 만들어져요.** 그래서 diff에 함수 바뀜이 잡히지만, 노드 속성 하나만 바꾸는 가벼운 일이에요.

## 9. 검증 페이지로 동작 보기

`pages/phase1/index.html`을 열면 탭 두 개가 있어요. 주소 끝에 `#phase2`를 붙이면 Phase 2 탭으로 바로 열려요.

### Phase 1 · Diff / Patch

- 테스트 영역을 직접 고치거나 아래 HTML을 고치면, 실제 영역과의 차이가 "적용 예정 변경"에 보여요.
- **Patch**를 누르면 그 변경만 실제 영역에 반영돼요. 입력창에 친 글자가 남아 있는지로 노드를 다시 만들지 않았는지 확인할 수 있어요.
- **◀ 뒤로 / 앞으로 ▶**로 저장된 시점을 오가요.

### Phase 2 · Component / Hooks

| 영역 | 보는 것 |
|---|---|
| 앱 | `render(App, #app)`으로 붙인 할 일 앱. 추가, 토글, 삭제, `setClicks × 3`을 눌러 봐요 |
| effect가 쓴 곳 | effect가 화면에 붙은 뒤 실행돼서 바뀐 DOM을 읽는지 |
| unmount 확인 | `app.unmount()` → cleanup 실행과 DOM 떼기. **떼어진 앱에 setClicks**로 다시 그려지지 않는지. **다시 render**로 새로 붙이기 |
| Hooks 칸 | 칸 번호, hook 종류, 저장된 값, deps |
| hook 규칙 위반 확인 | 7장의 에러 4가지를 버튼으로 일으켜 봐요 |
| 렌더 흐름 | 다시 그릴 때마다 카드가 하나씩 생겨요. setState → 예약 → 렌더 → hook → expand → diff → patch → effect 순서와, 그때의 VDOM·변경 목록을 볼 수 있어요 |
