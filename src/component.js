import { vdomToDom, toChildVnode } from './vdom.js';
import { diff } from './diff.js';
import { patch } from './patch.js';

/**
 * "지금 누구를 그리는 중인가" 표시. hooks.js가 이걸 읽어서 칸을 찾는다 (R5)
 *   owner:     그리는 중인 루트 FunctionComponent. 자식이면 CHILD, 아무것도 안 그리면 null
 *   hookIndex: 이번 렌더에서 몇 번째 hook인지. 루트를 그리기 시작할 때 0으로
 * hooks.js 쪽 약속
 *   - owner === null 이거나 CHILD면 에러 (루트 밖·자식 안에서 hook 사용 금지)
 *   - owner.hooks[hookIndex++] 칸을 쓴다
 *   - useEffect는 실행할 effect를 owner.pendingEffects에 넣어 두기만 한다. 실행은 여기서 (R6)
 */
export const CHILD = Symbol('child component');
export const currentRender = { owner: null, hookIndex: 0 };

/**
 * 컴포넌트를 화면에 붙인다. 쓰는 쪽이 부르는 유일한 함수 (R1, R3)
 *   render(Counter, document.getElementById('app'))
 *
 * 쓰는 쪽은 FunctionComponent를 직접 만들지 않는다. 여기서만 만든다
 * 루트(App)만 FunctionComponent가 되고, 상태(hooks)도 여기에만 있다 (명세 4번 질문 1 B, R5)
 */
export function render(Component, container) {
  const instance = new FunctionComponent(Component);
  instance.mount(container);
  return instance;   // instance.unmount()로 뗀다. 테스트에서 hooks·vnode를 들여다볼 때도 쓴다
}

/**
 * 루트 컴포넌트 하나를 감싸는 클래스
 *   component: 루트 함수 (App)
 *   props:     루트에 넘길 값. render는 props를 안 받으니 지금은 항상 {}
 *   hooks:     useState·useEffect·useMemo 저장소. 부른 순서대로 칸을 쓴다 (hooks.js)
 *   vnode:     지난번에 그린 VDOM. 다음 diff의 "옛 VDOM" (컴포넌트 메모가 다 펼쳐진 모양)
 *   dom:       지금 화면에 붙어 있는 루트 노드. patch가 루트를 바꾸면 새 노드로 갈아 끼운다
 *   pendingEffects: 이번 렌더에서 deps가 바뀌어 실행해야 할 effect들. useEffect가 채운다
 *   updateScheduled: setState가 다시 그리기를 예약했나. 여러 번 불러도 update는 한 번 (hooks.js)
 */
export class FunctionComponent {
  constructor(component, props = {}) {
    this.component = component;
    this.props = props;
    this.hooks = [];
    this.vnode = null;
    this.dom = null;
    this.pendingEffects = [];
    this.updateScheduled = false;   // 다시 그리기가 이미 예약됐나 (hooks.js scheduleUpdate)
    this.hookCount = undefined;     // 첫 렌더에서 부른 hook 개수. 다음 렌더부터 이 수와 같아야 한다
    this.unmounted = false;         // unmount()가 불렸나. true면 update·setState를 무시한다
  }

  /**
   * 처음 그리기
   *   1. renderVnode()로 VDOM을 만든다
   *   2. vdomToDom으로 실제 DOM을 통째로 만들어 container에 붙인다
   *   3. this.vnode, this.dom에 보관한다
   *   4. effect 실행 (화면에 붙은 뒤, R6)
   */
  mount(container) {
    const vnode = this.renderVnode();
    const dom = vdomToDom(vnode);
    container.appendChild(dom);
    this.vnode = vnode;
    this.dom = dom;
    this.runEffects();
  }

  /**
   * 다시 그리기. setState가 부른다 (R1)
   *   1. renderVnode()로 새 VDOM을 만든다
   *   2. diff(this.vnode, 새 VDOM) → 변경 목록
   *   3. this.dom = patch(this.dom, 변경 목록)
   *      patch는 루트가 REPLACE되면 새 노드를 돌려주니 꼭 받아서 저장한다
   *   4. this.vnode = 새 VDOM
   *   5. effect 실행 (deps가 바뀐 것만, R6)
   */
  update() {
    if (this.unmounted) return;   // 떼어진 뒤에 예약돼 있던 update가 와도 아무것도 안 한다
    const nextVnode = this.renderVnode();
    const patches = diff(this.vnode, nextVnode);
    this.dom = patch(this.dom, patches);
    this.vnode = nextVnode;
    this.runEffects();
  }

  /**
   * 루트 함수를 실행해서 컴포넌트 메모가 하나도 없는 VDOM을 만든다 (R2, R5)
   *   1. "지금 = 루트"로 표시하고 hook 순번을 0으로 (hooks.js가 이걸 보고 칸을 찾는다)
   *   2. this.component(this.props) 실행
   *   3. 표시를 지운다
   *   4. hook 개수 검사: 첫 렌더와 개수가 다르면 에러 (if 안에서 hook을 불렀다)
   *      nextSlot의 종류 검사는 useState 3개 중 하나가 빠지는 것처럼 같은 종류끼리 밀리면 못 잡는다
   *   5. expand로 자식 컴포넌트 메모를 펼친다
   */
  renderVnode() {
    currentRender.owner = this;
    currentRender.hookIndex = 0;
    let vnode;
    try {
      vnode = this.component(this.props);
    } finally {
      currentRender.owner = null;   // 루트 함수가 던져도 표시는 꼭 지운다
    }
    const used = currentRender.hookIndex;
    if (this.hookCount === undefined) {
      this.hookCount = used;
    } else if (used !== this.hookCount) {
      throw new Error(`hook 개수가 바뀌었습니다: 지난 렌더 ${this.hookCount}개, 이번 ${used}개. if·for 안이나 return 뒤에서 hook을 부르지 마세요`);
    }
    return expand(vnode);
  }

  /**
   * 이번 렌더에서 모인 effect를 부른 순서대로 실행한다 (R6)
   * 목록을 먼저 비우고 돈다. effect 안에서 setState → update가 다시 불려도 같은 effect가 두 번 돌지 않는다
   */
  runEffects() {
    const effects = this.pendingEffects;
    this.pendingEffects = [];
    effects.forEach((run) => run());
  }

  /**
   * 화면에서 떼고 effect가 걸어 둔 것을 전부 푼다. 쓰는 쪽이 render가 돌려준 인스턴스로 부른다
   *   const app = render(App, container);
   *   app.unmount();
   *
   *   1. 이미 떼어졌으면 끝 (두 번 불러도 안전)
   *   2. unmounted = true. 이후 setState·예약돼 있던 update는 무시된다 (hooks.js scheduleUpdate, update)
   *   3. 아직 안 돈 effect는 버린다 (화면이 사라지니 실행할 이유가 없다)
   *   4. 모든 칸의 cleanup을 칸 순서대로 부른다. 안에 뭐가 있는지는 모른다. 부르기만 한다
   *      하나가 던져도 나머지는 계속 부른다. 그래야 다른 effect의 타이머·리스너가 남지 않는다
   *   5. 루트 DOM을 container에서 뗀다
   *   6. 다 끝난 뒤 cleanup에서 난 첫 에러를 다시 던진다 (삼키지 않는다)
   */
  unmount() {
    if (this.unmounted) return;
    this.unmounted = true;
    this.pendingEffects = [];

    const errors = [];
    for (const slot of this.hooks) {
      if (typeof slot.cleanup !== 'function') continue;
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    this.dom?.remove();
    this.dom = null;
    this.vnode = null;

    if (errors.length > 0) throw errors[0];
  }
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/**
 * VDOM 안의 컴포넌트 메모를 전부 펼친다. diff·vdomToDom은 메모를 모르므로 그 전에 해야 한다 (R4, R5)
 *   h('ul', null, h(TodoItem, { key: 1, todo }))
 *   → h('ul', null, h('li', { key: 1 }, ...))
 *
 * - type이 함수면: "지금 = 자식"으로 표시한 뒤 type(props) 실행 → 결과도 다시 expand
 *   자식 안에서 useState를 부르면 표시를 보고 에러가 난다 (R5)
 * - key는 두 곳 중 어디에 적어도 된다 (R8)
 *     h(TodoItem, { key: t.id })            부모 쪽: 펼친 결과 루트로 옮긴다. 안 옮기면 diff가 key로 짝을 못 짓는다
 *     TodoItem 안에서 h('li', { key: ... })  자식 쪽: 펼친 결과 루트에 이미 있다
 *   둘 다 있으면 자식 쪽(펼친 루트에 있던 key)을 쓴다
 * - type이 문자열이면: children만 펼친다
 * - 컴포넌트가 null·숫자처럼 vnode가 아닌 값을 돌려주면 h의 자식과 같은 규칙으로 바꾼다 (toChildVnode)
 */
function expand(vnode) {
  vnode = toChildVnode(vnode);
  if (typeof vnode.type === 'function') {
    const props = { ...vnode.props, children: vnode.children };
    const saved = currentRender.owner;
    currentRender.owner = CHILD;
    let result;
    try {
      result = vnode.type(props);
    } finally {
      currentRender.owner = saved;
    }
    const expanded = expand(result);
    if (expanded.key === undefined && vnode.key !== undefined) {
      return { ...expanded, key: vnode.key };   // 자식 쪽에 key가 없을 때만 부모 쪽 key를 쓴다
    }
    return expanded;
  }

  return { ...vnode, children: vnode.children.map(expand) };
}
