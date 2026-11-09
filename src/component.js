import { vdomToDom } from './vdom.js';
import { diff } from './diff.js';
import { patch } from './patch.js';
import { renderWithHooks } from './hooks.js';

/**
 * 함수형 컴포넌트를 감싸는 클래스
 * - hooks: 상태 저장용 배열
 * - mount(container): 처음 렌더링
 * - update(): 상태 변경 후 다시 렌더링 (VDOM 생성 → diff → patch)
 */
export class FunctionComponent {
  constructor(component, props = {}, initialState = {}) {
    this.component = component;
    this.props = props;
    this.hooks = [];
    this.container = null;
    this.isUpdating = false;
    this.updateQueued = false;
    this.state = initialState;
    this.setState = (nextState) => {
      const next = typeof nextState === 'function' ? nextState(this.state) : nextState;
      if (Object.is(next, this.state)) return;
      this.state = next;
      this.update();
    };
  }

  mount(container, onCommit) {
    if (this.container) throw new Error('이미 마운트된 컴포넌트입니다.');
    this.container = container;
    this.onCommit = onCommit;
    try {
      this.update();
    } catch (error) {
      if (this.vnode === undefined) this.container = null;
      throw error;
    }
  }

  update() {
    if (!this.container) return;
    if (this.isUpdating) {
      this.updateQueued = true;
      return;
    }

    this.isUpdating = true;
    try {
      do {
        this.updateQueued = false;
        this.commit();
      } while (this.updateQueued && this.container);
    } finally {
      this.isUpdating = false;
    }
  }

  commit() {
    const previousVdom = this.vnode;
    const { vnode, hooks, effects } = renderWithHooks(this, () =>
      this.component(this.props, { state: this.state, setState: this.setState }),
    );
    const patches = previousVdom === undefined ? [] : diff(previousVdom, vnode);

    if (previousVdom === undefined) {
      this.rootNode = vdomToDom(vnode);
      this.container.replaceChildren(this.rootNode);
    } else {
      this.rootNode = patch(this.rootNode, patches);
    }

    this.vnode = vnode;
    this.hooks = hooks;
    for (const effect of effects) effect();
    this.onCommit?.({ previousVdom, vnode, patches });
  }

  unmount() {
    const hooks = this.hooks;
    this.hooks = [];
    this.container = null;
    this.vnode = undefined;
    this.rootNode?.remove();
    this.rootNode = null;
    for (const hook of hooks) {
      if (hook.type === 'effect') hook.cleanup?.();
    }
  }
}
