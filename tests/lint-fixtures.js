/**
 * 글자 검사(T15, T22) 테스트 입력. tools/lint.js의 lint()에 하나씩 넣어서 돌린다 (cases.js)
 * 기대값 표에 적힌 그대로 옮겼다
 *   shouldFail: 검사가 실패(경고)해야 하는 조각
 *   shouldPass: 검사가 통과시켜야 하는 조각
 *   notCaught:  기대값에 "못 잡음(구멍)"으로 적힌 조각. 검사가 통과시켜 버리는 게 기대 동작이다
 */
export const lintFixtures = {
  T15: {
    expected: '글자 검사가 실패한다. // allow-direct-call 줄은 통과',
    shouldFail: [
      'const item = TodoItem({ todo, onToggle });',
    ],
    shouldPass: [
      'const item = TodoItem({ todo, onToggle }); // allow-direct-call',
    ],
    notCaught: [],
  },
  missingKey: {
    expected: 'key 없으면 글자 검사로 잡는다 (사용자 요청, 표에 없는 행)',
    shouldFail: [
      "todos.map((t) => h('li', null, t.text))",
      "todos.map((t) => h('li'))",
      "todos.map((t) => h(TodoItem, { todo: t, onToggle }))",
      "todos.map((t) => { return h('li', { class: 'item' }, t.text); })",
      "todos.map((t) => h('li', null, h('span', { key: t.id }, t.text)))",
    ],
    shouldPass: [
      "todos.map((t) => h('li', { key: t.id }, t.text))",
      "todos.map((t) => h(TodoItem, { key: t.id, todo: t }))",
      "todos.map(({ key, text }) => h('li', { key }, text))",
      'todos.map((t) => t.id)',
      "todos.map((t) => h('li', null, t.text)) // allow-direct-call",
    ],
    notCaught: [
      "todos.map((t) => h('li', propsOf(t), t.text))",
      "todos.map((t) => h('li', { ...extra }, t.text))",
      'todos.map(renderItem)',
    ],
  },
  T22: {
    expected: '글자 검사: deps [ ] 안에 { } [ ] .filter( .map( 이 바로 있으면 실패 / 통과: [n], [todos], // allow-direct-call 줄 / 못 잡음(구멍): 변수에 담아 넣기 const o = {n}; [o]',
    shouldFail: [
      'const v = useMemo(() => n * 2, [{ n }]);',
      'const v = useMemo(() => n * 2, [[n]]);',
      'const v = useMemo(() => count(todos), [todos.filter((t) => t.done)]);',
      'const v = useMemo(() => count(todos), [todos.map((t) => t.id)]);',
    ],
    shouldPass: [
      'const v = useMemo(() => n * 2, [n]);',
      'const v = useMemo(() => count(todos), [todos]);',
      'const v = useMemo(() => n * 2, [{ n }]); // allow-direct-call',
    ],
    notCaught: [
      'const o = { n }; const v = useMemo(() => n * 2, [o]);',
    ],
  },
};
