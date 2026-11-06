/**
 * h(type, props, ...children) → VDOM 노드
 * VDOM 노드 모양은 docs/design.md 참고
 */
export function h(type, props, ...children) {
  throw new Error('not implemented');
}

/**
 * 실제 DOM 노드 → VDOM
 * 공백만 있는 텍스트 노드, 주석 처리 규칙은 docs/design.md 참고
 */
export function domToVdom(node) {
  throw new Error('not implemented');
}

/** VDOM → 실제 DOM 노드 */
export function vdomToDom(vnode) {
  throw new Error('not implemented');
}
