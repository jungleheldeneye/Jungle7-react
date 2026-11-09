import { renderWithoutHooks } from './hooks.js';

/**
 * h(type, props, ...children) → VDOM 노드
 * VDOM 노드 모양은 docs/design.md 참고
 */
export function h(type, props, ...children) {
  const { key, ...elementProps } = props ?? {};
  const normalizedChildren = children.flat(Infinity)
    .filter((child) => child != null && typeof child !== 'boolean')
    .map((child) => typeof child === 'number' ? String(child) : child);

  const vnode = typeof type === 'function'
    ? renderWithoutHooks(() => type({ ...elementProps, children: normalizedChildren }))
    : { type, props: elementProps, children: normalizedChildren };
  if (key == null) return vnode;
  if (vnode == null || typeof vnode !== 'object') {
    throw new TypeError('key가 있는 컴포넌트는 요소 VDOM을 반환해야 합니다.');
  }
  return { ...vnode, key: String(key) };
}

/**
 * 실제 DOM 노드 → VDOM
 * 요소는 객체로, 텍스트는 문자열로 변환한다.
 * 공백만 있는 텍스트와 주석은 자식 목록에서 제외한다.
 */
export function domToVdom(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.data.trim() === '' ? null : node.data;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const props = Object.fromEntries(
    Array.from(node.attributes, ({ name, value }) => [name, value]),
  );
  const children = Array.from(node.childNodes, domToVdom)
    .filter((child) => child !== null);

  const vnode = { type: node.localName, props, children };
  // HTML 편집과 이력 이동에서도 키를 다시 읽을 수 있도록 data-key 속성을 보존한다.
  if (Object.hasOwn(props, 'data-key')) vnode.key = props['data-key'];
  return vnode;
}

/** VDOM → 실제 DOM 노드 */
export function vdomToDom(vnode) {
  if (typeof vnode === 'string') {
    return document.createTextNode(vnode);
  }

  const element = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    setProp(element, name, value);
  }
  for (const child of vnode.children) {
    element.appendChild(vdomToDom(child));
  }

  return element;
}

/** DOM 생성과 Patch가 공유하는 속성 및 이벤트 갱신 처리. */
export function setProp(element, name, value, previousValue) {
  const eventName = name.startsWith('on') ? name.slice(2).toLowerCase() : null;
  if (eventName && typeof previousValue === 'function') {
    element.removeEventListener(eventName, previousValue);
  }
  if (eventName && typeof value === 'function') {
    element.removeAttribute(name);
    element.addEventListener(eventName, value);
  } else if (value == null || value === false) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value === true ? '' : value);
  }
}
