/**
 * 테스트케이스. 기대값(expected)은 사람이 정한 표 그대로다. 고치지 않는다
 *
 * 한 행 모양
 *   { id, rid, scenario, expected, run }        자동: run()이 { pass, observed }를 돌려준다
 *   { id, rid, scenario, expected, status, note, auto? }
 *       status가 '보류'·'미구현'·'수동'인 행. note는 관찰값 칸에 들어갈 설명
 *       auto가 있으면 돌려서 그 관찰값을 note 뒤에 덧붙인다 (상태는 그대로)
 *
 * 한 행을 나눈 곳 (T02, T22): 행 안에 방식이 다른 확인이 섞여 있어서 상태를 하나로 정할 수 없을 때.
 * 기대값은 나눈 행 모두 원래 글자 그대로 둔다
 */
import { h, vdomToDom } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { render } from '../src/component.js';
import { useState, useEffect, useMemo } from '../src/hooks.js';
import {
  flush, settle, sandbox, watchDom, describeOps, describePatches, patchToText, errorText,
} from './helpers.js';
import { lintFixtures } from './lint-fixtures.js';
import { lint } from '../tools/lint.js';

/**
 * 글자 검사 테스트: 코드 조각을 lint()에 하나씩 넣고 rule이 잡히는지 본다
 *   shouldFail: rule이 1개 이상 잡혀야 함 / shouldPass·notCaught: 아무것도 안 잡혀야 함
 */
function runLint(fixtures, rule) {
  const rows = [];
  const check = (group, code, wantCaught) => {
    const problems = lint(code).filter((p) => p.rule === rule);
    const caught = problems.length > 0;
    rows.push({ ok: caught === wantCaught, text: `[${group}] ${caught ? '잡음' : '안 잡음'}${caught === wantCaught ? '' : ' ✗'}: ${code}` });
  };
  fixtures.shouldFail.forEach((code) => check('실패해야 함', code, true));
  fixtures.shouldPass.forEach((code) => check('통과해야 함', code, false));
  fixtures.notCaught.forEach((code) => check('못 잡음(구멍)', code, false));
  const good = rows.filter((r) => r.ok).length;
  return { pass: good === rows.length, observed: `${good}/${rows.length} 맞음 — ${rows.map((r) => r.text).join(' / ')}` };
}

// ─── 여러 행이 같이 쓰는 테스트용 앱 ───

/** MANUAL.md 1장의 카운터 + 렌더 횟수 */
function makeCounter() {
  const log = { renders: 0 };
  function Counter() {
    log.renders += 1;
    const [count, setCount] = useState(0);
    return h('div', null,
      h('p', null, String(count)),
      h('button', { onclick: () => setCount((c) => c + 1) }, '+1'));
  }
  return { Counter, log };
}

/** 카운터를 붙이고, 처음 그리기를 뺀 렌더 횟수를 돌려주는 함수를 같이 준다 */
function mountCounter() {
  const { Counter, log } = makeCounter();
  const container = sandbox();
  const app = render(Counter, container);
  const button = container.querySelector('button');
  const text = () => container.querySelector('p').textContent;
  return { app, button, text, updates: () => log.renders - 1 };
}

/** 20번 누르기. awaitEach면 클릭마다 다시 그리기를 기다린다 */
async function clickTwenty(awaitEach) {
  const { app, button, text, updates } = mountCounter();
  for (let i = 0; i < 20; i += 1) {
    button.click();
    if (awaitEach) await flush();
  }
  await settle();
  const result = { renders: updates(), value: text() };
  app.unmount();
  return result;
}

const TODOS = [
  { id: 1, text: '빨래', done: false },
  { id: 2, text: '설거지', done: false },
  { id: 3, text: '장보기', done: false },
];

const RENDER_CAP = 50;   // T17: 무한 반복이 되면 이 횟수에서 멈춘다

// ─── 테스트케이스 ───

export const cases = [
  {
    id: 'T01', rid: 'R1',
    scenario: '카운터 +1 버튼을 한 번 누른다',
    expected: '화면 숫자가 1이 된다',
    async run() {
      const { app, button, text, updates } = mountCounter();
      button.click();
      await flush();
      const shown = text();
      const renders = updates();
      app.unmount();
      return { pass: shown === '1', observed: `화면 숫자 "${shown}", 렌더 ${renders}번 (처음 그리기 제외)` };
    },
  },
  {
    id: 'T02-①', rid: 'R1',
    scenario: '+1 버튼을 아주 빠르게 20번 누른다 — ① 클릭마다 await (사람이 누르는 것처럼 클릭이 각각 다른 작업)',
    expected: '20번 렌더 돼야한다.',
    async run() {
      const r = await clickTwenty(true);
      return { pass: r.renders === 20, observed: `렌더 ${r.renders}번 (처음 그리기 제외), 화면 숫자 "${r.value}"` };
    },
  },
  {
    id: 'T02-②', rid: 'R1',
    scenario: '+1 버튼을 아주 빠르게 20번 누른다 — ② await 없이 반복문으로 click() 20번 (한 작업 안)',
    expected: '한 작업 안에서 부른 click 20번은 batching으로 묶여 1번만 렌더된다 (값은 20)',
    async run() {
      const r = await clickTwenty(false);
      return { pass: r.renders === 1 && r.value === '20', observed:`렌더 ${r.renders}번 (처음 그리기 제외), 화면 숫자 "${r.value}"` };
    },
  },
  {
    id: 'T02-수동', rid: 'R1',
    scenario: '+1 버튼을 아주 빠르게 20번 누른다 — 손으로',
    expected: '20번 렌더 돼야한다.',
    status: '수동',
    note: '아래 "T02 손으로 연타" 칸에서 +1을 빠르게 20번 누르고 렌더 횟수를 적는다',
  },
  {
    id: 'T03', rid: 'R1',
    scenario: '한 클릭 핸들러 안에서 setN(n+1)을 두 번 부른다',
    expected: '모아서 한 번만 렌더',
    async run() {
      const log = { renders: 0 };
      function App() {
        log.renders += 1;
        const [n, setN] = useState(0);
        return h('div', null,
          h('p', null, String(n)),
          h('button', { onclick: () => { setN(n + 1); setN(n + 1); } }, '+'));
      }
      const container = sandbox();
      const app = render(App, container);
      container.querySelector('button').click();
      await settle();
      const renders = log.renders - 1;
      const shown = container.querySelector('p').textContent;
      app.unmount();
      return { pass: renders === 1, observed: `렌더 ${renders}번 (처음 그리기 제외), 화면 숫자 "${shown}"` };
    },
  },
  {
    id: 'T04', rid: 'R1',
    scenario: '지금과 같은 값으로 setState를 부른다 (setN(n))',
    expected: '변화가 없으니까 아무것도 바뀌지 않음',
    async run() {
      const log = { renders: 0 };
      function App() {
        log.renders += 1;
        const [n, setN] = useState(0);
        return h('div', null,
          h('p', null, String(n)),
          h('button', { onclick: () => setN(n) }, '같은 값'));
      }
      const container = sandbox();
      const app = render(App, container);
      const before = container.innerHTML;
      const watch = watchDom(container);
      container.querySelector('button').click();
      await settle();
      const ops = watch.stop();
      const renders = log.renders - 1;
      const same = container.innerHTML === before;
      app.unmount();
      return {
        pass: renders === 0 && ops.total === 0 && same,
        observed: `렌더 ${renders}번 (처음 그리기 제외), ${describeOps(ops)}, 화면 HTML 같음: ${same}`,
      };
    },
  },
  {
    id: 'T05', rid: 'R2',
    scenario: '같은 상태로 컴포넌트를 두 번 실행한다',
    expected: '같은 VDOM이 나온다',
    async run() {
      function Item({ todo }) {
        return h('li', todo.done ? { class: 'done' } : {}, todo.text);
      }
      function App() {
        const [todos] = useState(TODOS);
        const [title] = useState('할 일');
        return h('div', null, h('h2', null, title), h('ul', null, todos.map((t) => h(Item, { key: t.id, todo: t }))));
      }
      const app = render(App, sandbox());
      // instance.renderVnode()는 루트 함수를 실행하고 자식까지 펼친 VDOM을 돌려준다 (상태는 그대로)
      const a = app.renderVnode();
      const b = app.renderVnode();
      const sameJson = JSON.stringify(a) === JSON.stringify(b);
      const patches = diff(a, b);
      app.unmount();
      return {
        pass: sameJson && patches.length === 0,
        observed: `두 VDOM JSON 같음: ${sameJson}, diff(1번째, 2번째) 변경 ${patches.length}개 (이벤트 함수 없는 앱으로 비교)`,
      };
    },
  },
  {
    id: 'T06', rid: 'R2',
    scenario: '조건에 따라 자식이 없을 때 false·null을 자식으로 넘긴다 (cond && h(\'p\'...))',
    expected: '자식이 화면에 보이지 않는다 (자리 표시용 빈 주석은 남는다)',
    async run() {
      function App() {
        const [cond] = useState(false);
        const [empty] = useState(null);
        return h('div', null, cond && h('p', null, '보임'), empty);
      }
      const container = sandbox();
      const app = render(App, container);
      const vnodeChildren = app.vnode.children;
      const dom = container.firstChild;
      const nodes = [...dom.childNodes].map((n) => n.nodeName).join(', ') || '없음';
      const result = {
        // 보이지 않음: 요소 자식 0개, 글자 없음. 자리 표시: 남은 자식은 전부 빈 주석이고 false·null 개수(2)만큼 있음
        pass: dom.children.length === 0 && dom.textContent === ''
          && dom.childNodes.length === 2 && [...dom.childNodes].every((n) => n.nodeType === Node.COMMENT_NODE && n.nodeValue === '')
          && vnodeChildren.length === 2 && vnodeChildren.every((c) => c.type === '#comment'),
        observed: `VDOM 자식 ${vnodeChildren.length}개 [${vnodeChildren.map((c) => c.type).join(', ')}], `
          + `실제 DOM childNodes ${dom.childNodes.length}개 [${nodes}], 요소 자식(children) ${dom.children.length}개, 보이는 글자 "${dom.textContent}"`,
      };
      app.unmount();
      return result;
    },
  },
  {
    id: 'T07', rid: 'R3',
    scenario: '입력창에 글자를 쓰는 중에 목록의 다른 항목을 삭제한다',
    expected: '입력창은 그대로 있고 해당 항목만 삭제 되야한다.',
    status: '수동',
    note: '아래 "T07 손으로 해보기" 칸의 순서대로 확인',
    async auto() {
      function App() {
        const [todos, setTodos] = useState(TODOS);
        const [draft, setDraft] = useState('');
        const remove = (id) => setTodos((list) => list.filter((t) => t.id !== id));
        return h('div', null,
          h('input', { value: draft, oninput: (e) => setDraft(e.target.value) }),
          h('ul', null, todos.map((t) => h('li', { key: t.id },
            h('span', null, t.text),
            h('button', { onclick: () => remove(t.id) }, '삭제')))));
      }
      const container = sandbox();
      const app = render(App, container);
      const input = container.querySelector('input');
      input.focus();
      input.value = '쓰는 중';
      input.dispatchEvent(new Event('input'));
      await flush();
      container.querySelectorAll('li')[1].querySelector('button').click();   // 설거지 삭제
      await flush();
      const after = container.querySelector('input');
      const items = [...container.querySelectorAll('li span')].map((s) => s.textContent);
      const result = `자동 흉내: 같은 입력창 노드 ${after === input}, 입력값 "${after.value}", `
        + `포커스 유지 ${document.activeElement === after}, 남은 항목 [${items.join(', ')}]`;
      app.unmount();
      return result;
    },
  },
  {
    id: 'T08', rid: 'R3',
    scenario: '글자 하나만 바뀐다',
    expected: 'diff 변경 1개, 실제 DOM 조작 1번',
    async run() {
      const before = h('div', null, h('p', null, '가'));
      const after = h('div', null, h('p', null, '나'));
      const container = sandbox();
      const dom = vdomToDom(before);
      container.appendChild(dom);
      const patches = diff(before, after);
      const watch = watchDom(container);
      patch(dom, patches);
      const ops = watch.stop();
      container.remove();
      return {
        pass: patches.length === 1 && ops.total === 1,
        observed: `${describePatches(patches)} [${patches.map(patchToText).join('; ')}], ${describeOps(ops)}`,
      };
    },
  },
  {
    id: 'T09', rid: 'R3',
    scenario: '같은 목록에서 앞쪽 항목 두 개를 한 번에 삭제한다 (A, B, C → C)',
    expected: 'patch 결과가 새 VDOM으로 처음부터 그린 것과 같다',
    async run() {
      const check = (withKey) => {
        const item = (x) => h('li', withKey ? { key: x } : null, x);
        const before = h('ul', null, ['A', 'B', 'C'].map(item));
        const after = h('ul', null, ['C'].map(item));
        const patches = diff(before, after);
        const patched = patch(vdomToDom(before), patches);
        const fresh = vdomToDom(after);
        return { same: patched.isEqualNode(fresh), html: patched.outerHTML, patches };
      };
      const keyed = check(true);
      const unkeyed = check(false);
      return {
        pass: keyed.same && unkeyed.same,
        observed: `key 있음: 같음 ${keyed.same}, ${keyed.html}, ${describePatches(keyed.patches)} / `
          + `key 없음: 같음 ${unkeyed.same}, ${unkeyed.html}, ${describePatches(unkeyed.patches)}`,
      };
    },
  },
  {
    id: 'T10', rid: 'R3',
    scenario: '속성 하나를 지운다 (class 제거)',
    expected: '사라진 속성도 변경으로 잡히고 실제 DOM에서도 지워진다',
    async run() {
      const before = h('p', { class: 'done', id: 'x' }, '빨래');
      const after = h('p', { id: 'x' }, '빨래');
      const container = sandbox();
      const dom = vdomToDom(before);
      container.appendChild(dom);
      const patches = diff(before, after);
      const caught = patches.some((p) => p.type === 'PROPS' && 'class' in p.props && p.props.class === undefined);
      const watch = watchDom(container);
      const result = patch(dom, patches);
      const ops = watch.stop();
      const removed = !result.hasAttribute('class');
      container.remove();
      return {
        pass: caught && removed,
        observed: `[${patches.map(patchToText).join('; ')}], 변경으로 잡힘 ${caught}, DOM에서 class 없음 ${removed} (${result.outerHTML}), ${describeOps(ops)}`,
      };
    },
  },
  {
    id: 'T11', rid: 'R3',
    scenario: '항목 1000개 중 하나만 바꾼다',
    expected: 'diff에는 해당 항목만 갱신된다.',
    async run() {
      const ids = Array.from({ length: 1000 }, (_, i) => i);
      const list = (changed) => h('ul', null, ids.map((i) => h('li', { key: i }, i === changed ? '바뀜' : `항목 ${i}`)));
      const before = list(-1);
      const after = list(500);
      const patches = diff(before, after);
      const onlyThat = patches.length > 0 && patches.every((p) => p.path[0] === 500);
      const container = sandbox();
      const dom = vdomToDom(before);
      container.appendChild(dom);
      const watch = watchDom(container);
      patch(dom, patches);
      const ops = watch.stop();
      container.remove();
      return {
        pass: onlyThat,
        observed: `500번 항목 변경. ${describePatches(patches)} [${patches.slice(0, 5).map(patchToText).join('; ')}${patches.length > 5 ? ' …' : ''}], ${describeOps(ops)}`,
      };
    },
  },
  {
    id: 'T12', rid: 'R4',
    scenario: '같은 컴포넌트를 props만 바꿔 여러 번 쓴다',
    expected: 'diff에서 replace 가 아닌 props로 나와야하고 patch 시에 props 만 변경해야함',
    async run() {
      const control = {};
      function Item({ todo }) {
        return h('li', { class: todo.done ? 'done' : 'todo', title: todo.text }, todo.text);
      }
      function App() {
        const [todos, setTodos] = useState(TODOS);
        control.setTodos = setTodos;
        return h('ul', null, todos.map((t) => h(Item, { key: t.id, todo: t })));
      }
      const container = sandbox();
      const app = render(App, container);
      const before = app.vnode;
      const watch = watchDom(container);
      control.setTodos((list) => list.map((t) => ({ ...t, text: `${t.text}!`, done: !t.done })));
      await flush();
      const ops = watch.stop();
      const patches = diff(before, app.vnode);
      const hasReplace = patches.some((p) => p.type === 'REPLACE');
      const hasProps = patches.some((p) => p.type === 'PROPS');
      app.unmount();
      return {
        pass: !hasReplace && hasProps && ops.added === 0 && ops.removed === 0,
        observed: `항목 3개 props 변경. ${describePatches(patches)}, REPLACE 있음 ${hasReplace}, ${describeOps(ops)}`,
      };
    },
  },
  {
    id: 'T13', rid: 'R5',
    scenario: '자식 컴포넌트 안에서 useState를 부른다',
    expected: '에러가 난다',
    async run() {
      function Child() {
        const [v] = useState(0);
        return h('p', null, String(v));
      }
      function App() {
        return h('div', null, h(Child, null));
      }
      try {
        const app = render(App, sandbox());
        app.unmount();
        return { pass: false, observed: '에러 없음' };
      } catch (error) {
        return { pass: true, observed: `에러: ${errorText(error)}` };
      }
    },
  },
  {
    id: 'T14', rid: 'R5',
    scenario: '자식이 도우미 함수를 거쳐 useState를 부른다',
    expected: '에러가 난다 (함수를 거쳐도 잡힘)',
    async run() {
      function useCounter() {
        return useState(0);
      }
      function Child() {
        const [v] = useCounter();
        return h('p', null, String(v));
      }
      function App() {
        return h('div', null, h(Child, null));
      }
      try {
        const app = render(App, sandbox());
        app.unmount();
        return { pass: false, observed: '에러 없음' };
      } catch (error) {
        return { pass: true, observed: `에러: ${errorText(error)}` };
      }
    },
  },
  {
    id: 'T15', rid: 'R5',
    scenario: '앱 코드에서 TodoItem({...})처럼 컴포넌트를 직접 부른다',
    expected: '글자 검사가 실패한다. // allow-direct-call 줄은 통과',
    async run() {
      return runLint(lintFixtures.T15, 'direct-call');
    },
  },
  {
    id: 'T16', rid: 'R5',
    scenario: '자식이 부모 함수로 할 일을 삭제한다',
    expected: '개수와 목록이 함께 바뀐다',
    async run() {
      function TodoItem({ todo, onDelete }) {
        return h('li', null, h('span', null, todo.text), h('button', { onclick: () => onDelete(todo.id) }, '삭제'));
      }
      function App() {
        const [todos, setTodos] = useState(TODOS);
        const remove = (id) => setTodos((list) => list.filter((t) => t.id !== id));
        return h('div', null,
          h('p', null, `${todos.length}개`),
          h('ul', null, todos.map((t) => h(TodoItem, { key: t.id, todo: t, onDelete: remove }))));
      }
      const container = sandbox();
      const app = render(App, container);
      container.querySelectorAll('li')[1].querySelector('button').click();   // 설거지
      await flush();
      const count = container.querySelector('p').textContent;
      const items = [...container.querySelectorAll('li span')].map((s) => s.textContent);
      app.unmount();
      return {
        pass: count === '2개' && items.length === 2 && !items.includes('설거지'),
        observed: `"설거지" 삭제 후 개수 "${count}", 목록 [${items.join(', ')}]`,
      };
    },
  },
  {
    id: 'T17', rid: 'R6',
    scenario: 'effect 안에서 setState를 부르고 deps를 안 준다',
    expected: '매번 갱신 된다.',
    async run() {
      const log = { renders: 0, effects: 0, capHit: false };
      const holder = {};
      function App() {
        log.renders += 1;
        const [n, setN] = useState(0);
        useEffect(() => {
          log.effects += 1;
          if (log.renders >= RENDER_CAP) {   // 상한: 페이지가 멈추지 않게 여기서 뗀다
            log.capHit = true;
            holder.app.unmount();
            return;
          }
          setN(n + 1);
        });
        return h('p', null, String(n));
      }
      const container = sandbox();
      holder.app = render(App, container);
      await settle();
      holder.app.unmount();
      return {
        pass: log.effects === log.renders && log.renders > 1,
        observed: `렌더 ${log.renders}번 (처음 포함), effect 실행 ${log.effects}번, ${log.capHit ? `상한 도달 (${RENDER_CAP}번에서 unmount)` : '상한 도달 안 함'}`,
      };
    },
  },
  {
    id: 'T18', rid: 'R6',
    scenario: 'effect 안에서 setState를 부르고 deps를 []로 준다',
    expected: '처음 한 번만 갱신된다.',
    async run() {
      const log = { renders: 0, effects: 0 };
      function App() {
        log.renders += 1;
        const [n, setN] = useState(0);
        useEffect(() => {
          log.effects += 1;
          setN((v) => v + 1);
        }, []);
        return h('p', null, String(n));
      }
      const container = sandbox();
      const app = render(App, container);
      await settle();
      const shown = container.textContent;
      app.unmount();
      return {
        pass: log.effects === 1 && log.renders - 1 === 1,
        observed: `effect 실행 ${log.effects}번, 렌더 ${log.renders - 1}번 (처음 그리기 제외), 화면 "${shown}"`,
      };
    },
  },
  {
    id: 'T19', rid: 'R6',
    scenario: 'effect가 실행되는 시점을 확인한다',
    expected: '화면이 바뀐 뒤에 실행된다',
    async run() {
      const seen = [];
      const holder = {};
      function App() {
        const [n, setN] = useState(0);
        useEffect(() => {
          seen.push({ n, screen: holder.container.querySelector('p')?.textContent ?? '(없음)' });
        }, [n]);
        return h('div', null, h('p', null, String(n)), h('button', { onclick: () => setN(n + 1) }, '+'));
      }
      holder.container = sandbox();
      const app = render(App, holder.container);
      holder.container.querySelector('button').click();
      await flush();
      app.unmount();
      const ok = seen.length === 2 && seen.every((s) => s.screen === String(s.n));
      return {
        pass: ok,
        observed: `effect가 본 화면: ${seen.map((s) => `n=${s.n}일 때 "${s.screen}"`).join(', ')}`,
      };
    },
  },
  {
    id: 'T20', rid: 'R6',
    scenario: 'deps가 바뀌어 effect가 다시 실행된다',
    expected: '지난번 정리 함수가 먼저 불린다',
    async run() {
      const order = [];
      const control = {};
      function App() {
        const [n, setN] = useState(0);
        control.setN = setN;
        useEffect(() => {
          order.push(`effect ${n}`);
          return () => order.push(`cleanup ${n}`);
        }, [n]);
        return h('p', null, String(n));
      }
      const app = render(App, sandbox());
      control.setN(1);
      await flush();
      control.setN(2);
      await flush();
      app.unmount();
      const expectedOrder = ['effect 0', 'cleanup 0', 'effect 1', 'cleanup 1', 'effect 2', 'cleanup 2'];
      return {
        pass: order.join('|') === expectedOrder.join('|'),
        observed: `순서: ${order.join(' → ')} (마지막 cleanup 2는 unmount)`,
      };
    },
  },
  {
    id: 'T21', rid: 'R7',
    scenario: 'deps가 같을 때 다시 그린다',
    expected: 'useMemo가 기억한 값을 똑같이 쓴다.',
    async run() {
      const values = [];
      const log = { calls: 0 };
      const control = {};
      function App() {
        const [n] = useState(1);
        const [other, setOther] = useState(0);
        control.setOther = setOther;
        const memo = useMemo(() => { log.calls += 1; return { double: n * 2 }; }, [n]);
        values.push(memo);
        return h('p', null, `${memo.double} / ${other}`);
      }
      const app = render(App, sandbox());
      control.setOther(1);
      await flush();
      control.setOther(2);
      await flush();
      app.unmount();
      const same = values.every((v) => v === values[0]);
      return {
        pass: values.length === 3 && same && log.calls === 1,
        observed: `렌더 ${values.length}번, 계산 함수 실행 ${log.calls}번, 매번 같은 객체(===) ${same}`,
      };
    },
  },
  {
    id: 'T22-실행', rid: 'R7',
    scenario: 'deps에 매번 새로 만든 배열·객체를 넣는다 — 실행',
    expected: '실행: 매번 다시 계산 (결과는 맞음, 참조 비교 그대로) / 글자 검사: deps [ ] 안에 { } [ ] .filter( .map( 이 바로 있으면 실패 / 통과: [n], [todos], // allow-direct-call 줄 / 못 잡음(구멍): 변수에 담아 넣기 const o = {n}; [o]',
    async run() {
      const log = { renders: 0, objCalls: 0, arrCalls: 0, results: [] };
      const control = {};
      function App() {
        log.renders += 1;
        const [n] = useState(3);
        const [tick, setTick] = useState(0);
        control.setTick = setTick;
        const a = useMemo(() => { log.objCalls += 1; return n * 2; }, [{ n }]);   // allow-direct-call (일부러 새 객체)
        const b = useMemo(() => { log.arrCalls += 1; return n * 2; }, [[n]]);     // allow-direct-call (일부러 새 배열)
        log.results.push(a, b);
        return h('p', null, `${a} ${b} ${tick}`);
      }
      const app = render(App, sandbox());
      control.setTick(1);
      await flush();
      control.setTick(2);
      await flush();
      app.unmount();
      const correct = log.results.every((v) => v === 6);
      return {
        pass: log.objCalls === log.renders && log.arrCalls === log.renders && correct,
        observed: `n 그대로 렌더 ${log.renders}번 → [{ n }] 계산 ${log.objCalls}번, [[n]] 계산 ${log.arrCalls}번, 결과 모두 6: ${correct}`,
      };
    },
  },
  {
    id: 'T22-글자검사', rid: 'R7',
    scenario: 'deps에 매번 새로 만든 배열·객체를 넣는다 — 글자 검사',
    expected: '실행: 매번 다시 계산 (결과는 맞음, 참조 비교 그대로) / 글자 검사: deps [ ] 안에 { } [ ] .filter( .map( 이 바로 있으면 실패 / 통과: [n], [todos], // allow-direct-call 줄 / 못 잡음(구멍): 변수에 담아 넣기 const o = {n}; [o]',
    async run() {
      return runLint(lintFixtures.T22, 'inline-deps');
    },
  },
  {
    id: 'T23', rid: 'R8',
    scenario: 'key 없는 리스트 맨 앞에 항목을 추가한다 (체크 상태 있는 상태에서)',
    expected: 'key 없는 건 없음 -> 처음에 vdom을 만들 때 html을 수정해서 key를 랜덤하게 부여함',
    async run() {
      // 항목을 만들 때 랜덤 id를 한 번 정해서 데이터에 넣는다. 렌더할 때는 그 id를 key로 쓰기만 한다
      // (렌더할 때마다 랜덤을 만들면 매번 key가 달라져서 전부 다시 만들어진다)
      const newTodo = (text) => ({ id: crypto.randomUUID(), text });
      const control = {};
      const initial = ['빨래', '설거지', '장보기'].map(newTodo);   // useState는 함수를 받아도 실행하지 않아서 밖에서 만든다
      function App() {
        const [todos, setTodos] = useState(initial);
        control.setTodos = setTodos;
        return h('ul', null, todos.map((t) => h('li', { key: t.id },
          h('input', { type: 'checkbox' }), h('span', null, t.text))));
      }
      const container = sandbox();
      const app = render(App, container);
      container.querySelector('input').checked = true;   // 빨래 체크
      const before = app.vnode;
      control.setTodos((list) => [newTodo('새 항목'), ...list]);
      await flush();
      const checked = [...container.querySelectorAll('li')].filter((li) => li.querySelector('input').checked)
        .map((li) => li.querySelector('span').textContent);
      const keys = app.vnode.children.map((li) => li.key);
      const missing = keys.filter((k) => k === undefined).length;
      const unique = new Set(keys).size;
      const keptOld = before.children.every((old) => keys.includes(old.key));
      const patches = diff(before, app.vnode);
      app.unmount();
      return {
        pass: missing === 0,
        observed: `만들 때 랜덤 id → key. "빨래" 체크 후 맨 앞 추가 → key 없는 li ${missing}개, 서로 다른 key ${unique}/${keys.length}개, `
          + `기존 key 그대로 ${keptOld}, 체크된 칸 옆 글자 [${checked.join(', ')}], ${describePatches(patches)}`,
      };
    },
  },
  {
    id: 'T23-글자검사', rid: 'R8',
    scenario: '(표에 없는 행, 사용자 요청) .map( 안에서 key 없이 h(...)를 만든다',
    expected: lintFixtures.missingKey.expected,
    async run() {
      return runLint(lintFixtures.missingKey, 'missing-key');
    },
  },
  {
    id: 'T24', rid: 'R8',
    scenario: '한 리스트에 1000개가 있고 key를 부여해야하는 상황',
    expected: 'key는 겹치지않는다.',
    status: '수동',
    note: 'Phase 1 페이지의 key 부여(assignListKeys)가 export되지 않아 여기서 부를 수 없음. 아래 "T24 손으로 해보기" 칸의 순서대로 확인',
  },
  {
    id: 'T25', rid: 'R8',
    scenario: 'key 있는 리스트 맨 앞에 항목을 추가한다',
    expected: '기존 항목은 변경으로 잡지 않는다',
    async run() {
      const item = (x) => h('li', { key: x }, x);
      const before = h('ul', null, ['A', 'B', 'C'].map(item));
      const after = h('ul', null, ['N', 'A', 'B', 'C'].map(item));
      const patches = diff(before, after);
      const touchesOld = patches.filter((p) => p.type !== 'CREATE');
      const container = sandbox();
      const dom = vdomToDom(before);
      container.appendChild(dom);
      const watch = watchDom(container);
      patch(dom, patches);
      const ops = watch.stop();
      container.remove();
      return {
        pass: touchesOld.length === 0,
        observed: `${describePatches(patches)} [${patches.map(patchToText).join('; ')}], ${describeOps(ops)}`,
      };
    },
  },
  {
    id: 'T26', rid: 'R8',
    scenario: 'key를 TodoItem 안의 li에 붙인다 (h(TodoItem, {key})가 아니라)',
    expected: 'TodoItem 안의 li에 붙인 key로도 동작한다 (맨 앞 추가 시 CREATE 1개). 부모·자식 둘 다 key가 있으면 자식(li) key를 쓴다',
    async run() {
      const trial = async (Item, parentKey) => {
        const control = {};
        function App() {
          const [todos, setTodos] = useState(TODOS);
          control.setTodos = setTodos;
          return h('ul', null, todos.map((t) => h(Item, parentKey ? { key: `부모-${t.id}`, todo: t } : { todo: t })));
        }
        const app = render(App, sandbox());
        const before = app.vnode;
        control.setTodos((list) => [{ id: 9, text: '새 항목', done: false }, ...list]);
        await flush();
        const patches = diff(before, app.vnode);
        const keys = app.vnode.children.map((li) => li.key);
        app.unmount();
        return { patches, keys };
      };
      // 자식 쪽에만 key
      const childOnly = await trial(({ todo }) => h('li', { key: todo.id }, todo.text), false);
      // 부모 쪽·자식 쪽 둘 다 key (값을 다르게 줘서 어느 쪽을 썼는지 본다)
      const both = await trial(({ todo }) => h('li', { key: `자식-${todo.id}` }, todo.text), true);
      const childOnlyOk = childOnly.patches.length === 1 && childOnly.patches[0].type === 'CREATE';
      const bothUsesChild = both.keys.every((k) => String(k).startsWith('자식-'));
      return {
        pass: childOnlyOk && bothUsesChild,
        observed: `li에만 key: key [${childOnly.keys.join(', ')}], ${describePatches(childOnly.patches)} / `
          + `둘 다 key: 쓰인 key [${both.keys.join(', ')}], ${describePatches(both.patches)}`,
      };
    },
  },
  {
    id: 'T27', rid: 'R9',
    scenario: '한 핸들러에서 서로 다른 setState를 두 번 부른다',
    expected: '한 번만 렌더 돼야한다.',
    async run() {
      const log = { renders: 0 };
      function App() {
        log.renders += 1;
        const [a, setA] = useState(0);
        const [b, setB] = useState(0);
        return h('div', null,
          h('p', null, `${a} ${b}`),
          h('button', { onclick: () => { setA((v) => v + 1); setB((v) => v + 1); } }, '둘 다'));
      }
      const container = sandbox();
      const app = render(App, container);
      container.querySelector('button').click();
      await settle();
      const renders = log.renders - 1;
      const shown = container.querySelector('p').textContent;
      app.unmount();
      return { pass: renders === 1, observed: `렌더 ${renders}번 (처음 그리기 제외), 화면 "${shown}"` };
    },
  },
];
