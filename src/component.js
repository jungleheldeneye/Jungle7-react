import { vdomToDom } from './vdom.js';
import { diff } from './diff.js';
import { patch } from './patch.js';
import { setCurrent, getHookIndex } from './hooks.js';

/**
 * 함수형 컴포넌트를 감싸는 클래스
 * - hooks: 상태 저장용 배열
 * - mount(container): 처음 렌더링
 * - update(): 상태 변경 후 다시 렌더링 (VDOM 생성 → diff → patch)
 */
export class FunctionComponent {
  constructor(component, props = {}) {
    this.component = component;
    this.props = props;
    this.hooks = [];

    this.container = null;
    this.vnode = null;            // 지금 화면에 그려진 VDOM
    this.hookCount = undefined;   // 지난 렌더에서 쓴 hook 칸 수
    this.pendingEffects = [];     // patch 직후 실행할 effect
    this.updateScheduled = false; // Batching: 렌더가 이미 예약됐는지
  }

  /** 컴포넌트 함수를 실행해 새 VDOM을 만든다 */
  render() {
    setCurrent(this);
    try {
      const vnode = this.component(this.props);
      const used = getHookIndex();
      if (this.hookCount !== undefined && used !== this.hookCount) {
        throw new Error(`렌더마다 hook 개수가 같아야 해요 (${this.hookCount} → ${used})`);
      }
      this.hookCount = used;
      return vnode;
    } finally {
      setCurrent(null);
    }
  }

  mount(container) {
    this.container = container;
    this.vnode = this.render();
    container.replaceChildren(vdomToDom(this.vnode));
    this.flushEffects();
  }

  update() {
    this.updateScheduled = false;
    if (this.container === null) return;
    const next = this.render();
    patch(this.container.firstChild, diff(this.vnode, next));
    this.vnode = next;
    this.flushEffects();
  }

  /** setState가 부른다. 여러 번 불려도 렌더는 한 번만 예약 */
  scheduleUpdate() {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    queueMicrotask(() => this.update());
  }

  /** 모아 둔 effect 실행. 이전 cleanup이 있으면 먼저 실행 */
  flushEffects() {
    const effects = this.pendingEffects;
    this.pendingEffects = [];
    for (const { slot, effect } of effects) {
      if (typeof slot.cleanup === 'function') slot.cleanup();
      const cleanup = effect();
      slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
    }
  }
}
