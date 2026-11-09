# 구현 규칙 (jihyun)

팀 합의 문서(`docs/design.md`)가 아니라, 개인 구현(`jihyun` 브랜치)에서 쓰는 규칙입니다.
나중에 팀원 코드와 비교·머지할 때 "왜 이렇게 했는지"를 설명하는 기준으로 씁니다.

## Phase 1: VDOM, Diff, Patch

### VDOM 노드

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 노드 모양 | `{ type, key, props, children }` | `design.md` 초안, React와 비슷해 비교가 쉬움 |
| key | 별도 필드, Phase 1에서는 `null` | DOM 속성이 아니라 비교용 표시라 `props`에서 걸러낼 필요가 없음 |
| 텍스트 | 문자열 | 짧고 읽기 쉬움. 대신 `diff`, `patch`, `vdomToDom` 맨 앞에서 `typeof node === 'string'` 검사 |
| 속성 이름 | HTML 그대로 (`class`) | `getAttribute`/`setAttribute`로 그대로 옮길 수 있음 |
| 속성이 없을 때 | `props: {}` | `diff`에서 `null` 검사가 필요 없음 |

```js
{ type: 'li', key: null, props: { class: 'done' }, children: ['빨래'] }
```

### DOM → VDOM

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 버릴 노드 | 공백뿐인 텍스트, 주석 | 들여쓰기만 달라져도 변경으로 잡히는 것을 막음. Phase 1 페이지도 이렇게 가정 |
| 글자 있는 텍스트의 앞뒤 공백 | 그대로 둠 | `<b>안녕</b> 세상`의 띄어쓰기 유지 |
| 실제 DOM과 번호 맞추기 | `onLoad` 시작 시 실제 영역의 공백 노드를 한 번 지움 | 이후 `patch`가 `childNodes[번호]`를 그대로 씀. `patch`에서 건너뛰는 방식은 Phase 2에서 `h`로 만든 `' '` 자식까지 건너뛰어 번호가 어긋남 |

### 변경 목록

```js
{ type: 'CREATE',  path: [0, 3], node: vnode }
{ type: 'REMOVE',  path: [0, 2] }
{ type: 'REPLACE', path: [0, 1], node: vnode }
{ type: 'PROPS',   path: [0], props: { class: 'a', id: null } }
{ type: 'TEXT',    path: [0, 0], value: '빨래' }
```

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| `path` | 루트부터의 자식 번호, `[]`는 루트 | Phase 1 페이지가 이 표기를 가정 |
| 언제 무엇을 | 둘 다 문자열이고 값이 다름 → `TEXT` / `type`이 다르거나 문자열과 요소 → `REPLACE` / 같은 요소 → `PROPS` 비교 후 자식 비교, 남는 쪽은 `CREATE`·`REMOVE` | |
| `CREATE` 위치 | 새 노드가 들어갈 위치까지 포함 | 모든 변경의 `path` 의미가 같아짐 |
| 사라진 속성 | `props` 안에 `null` | 짧음. `undefined`는 `JSON.stringify`에서 사라져 로그에 안 보임 |
| 자식 비교 | 번호 순서 | 맨 앞 항목 삭제 시 `TEXT` 여러 개 + `REMOVE`가 나오는 건 R8(key)에서 해결. `MOVE`는 그때 추가 |
| 변경 목록 내용 | DOM 노드가 아니라 VDOM이나 값만 담음 | 페이지 로그(`JSON.stringify`)에 보이게 |

### Patch

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 적용 방식 | 대상 노드를 먼저 전부 찾아 두고 적용 | 앞에서 지우면 뒤 번호가 밀리는 문제를 막음. key로 이동을 넣어도 유지됨 |
| `CREATE` | 마지막 번호를 떼어 부모를 찾아 둠 | 아직 없는 노드를 가리키기 때문 |
| 루트 `REPLACE` (`path: []`) | `rootNode.replaceWith(...)` | 부모를 통하지 않음 |

## Phase 2: `h`와 컴포넌트

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 자식 컴포넌트 | `h(Child, props)`에서 `type`이 함수면 `h`가 바로 `type({ ...props, children })` 호출 | React처럼 쓰면서 VDOM에는 요소와 문자열만 남아 Phase 1 코드를 그대로 씀. 자식은 props만 받는 순수 함수라 컴포넌트 노드를 남길 필요가 없음 |
| 컴포넌트의 key | 결과 VDOM의 `key` 필드로 옮김 | R8에서 쓰기 위해 |
| 배열 자식 | 평평하게 펼침 | `todos.map(...)` 결과가 한 겹 더 감싸지는 것을 막음 |
| `null`, `undefined`, `true`, `false` 자식 | 버림 | 조건부 렌더링(`done && h(...)`)에서 "아무것도 안 그린다"는 뜻 |
| 숫자 자식 | `String()`으로 변환 | 텍스트는 문자열로만 구분하기 때문 |
| 이벤트 | property 대입 (`el.onclick = fn`, `null`이면 제거) | 새 함수를 넣으면 옛 함수가 자동으로 바뀜. 함수 변경을 무시하면 옛 state를 기억하는 함수가 남음 |
| property로 넣을 것 | `value`, `checked` | attribute는 초깃값이라, 사용자가 입력한 뒤에는 바꿔도 화면이 안 바뀜 |
| 속성 설정 | `vdomToDom`과 `patch`가 `setProp(el, name, value)` 헬퍼 공유 | 처음 만들 때와 갱신할 때 규칙이 달라지는 실수를 막음 |

주의: `el.value`가 이미 같은 값이면 다시 넣지 않음 (입력 중 커서 튐 방지). `count && h(...)`에서 `count`가 `0`이면 "0"이 찍히니 조건은 `count > 0 && ...`처럼 씀.

## Phase 2: hooks

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 현재 컴포넌트 | `hooks.js`의 모듈 변수 `current` + `setCurrent(c)`, 렌더 후 `null` | `useState(initialValue)` 시그니처 유지. 컴포넌트 밖에서 hook을 부르면 오류로 잡힘 |
| hook 순번 | 모듈 변수 `index`, `setCurrent`에서 0으로 | 현재 컴포넌트와 한곳에서 관리 |
| `setState`의 번호 | 만들 때 `const i = index++`로 고정 | 나중에 클릭으로 불릴 때 모듈의 `index`는 다른 값 |
| hook 칸 | 종류별 객체 + `kind`: `{ kind: 'state', value }`, `{ kind: 'effect', deps, cleanup }`, `{ kind: 'memo', value, deps }` | 종류마다 필요한 값이 다름 |
| 순서 검사 | 칸 수와 종류 모두 검사 (`getSlot(kind, create)` 헬퍼, 렌더 후 `hookCount` 비교) | 조건문 안의 hook 같은 실수를 조용히 틀리게 두지 않고 오류로 알림 |
| `setState` 인자 | 값과 함수(`prev => prev + 1`) 둘 다 | 묶어서 그리기 때문에 한 번에 여러 번 바꿀 때 함수 방식이 필요 |
| 같은 값 | `Object.is`로 같으면 렌더 건너뜀 | 쓸데없는 렌더 방지. 배열·객체는 직접 고치지 말고 새로 만들어 넘김 |
| 렌더 시점 | `queueMicrotask`로 예약해 한 번만 그림 (R9) | 한 번의 클릭에서 여러 `setState`를 렌더 한 번으로. `setState` 직후에는 화면이 아직 안 바뀐 상태 |
| `useEffect` 실행 | 렌더 중에는 모아 두고 `mount`/`update`의 `patch` 직후 실행 | 렌더 중에는 DOM이 아직 옛 상태 |
| deps 비교 | `depsChanged(prev, next)` 헬퍼: 없음 → 매번, `[]` → 처음만, 항목별 `Object.is`, 길이가 다르면 변경 | React와 같은 규칙 |
| cleanup | effect가 반환한 함수를 다음 실행 직전에 실행 | 타이머 등이 쌓이는 것을 막음 |
| `useMemo` | 렌더 중 바로 계산, `depsChanged` 공유 | 화면을 그리는 데 그 값이 필요 |

## 범위 밖

- R8: key로 리스트 순서 변경 최소화 (`MOVE`)
- 언마운트 시 cleanup (스켈레톤에 언마운트 기능이 없음)

## 구현 순서

1. `domToVdom`, `vdomToDom`: 페이지 로드 시 테스트 영역이 뜨면 성공
2. `diff`: `console.log`로 변경 목록 확인
3. `patch` + `onLoad` 공백 제거 한 줄: Patch, 뒤로·앞으로, 바뀐 노드 수 확인
4. `h`: 자식 정리 규칙 포함
5. `FunctionComponent`의 `mount`, `update`: hook 없이 고정 화면 출력
6. `useState`, Batching: 클릭으로 화면이 바뀌는지
7. `useEffect`, `useMemo`
