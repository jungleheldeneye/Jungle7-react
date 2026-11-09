/**
 * 코드 → VDOM (R2, R4, R8)
 *   h('li', { class: 'done', key: 3 }, '빨래')
 *   → { type: 'li', props: { class: 'done' }, key: 3, children: [#text '빨래'] }
 * type이 컴포넌트 함수여도 실행하지 않고 담아만 둔다 (R5)
 */
export function h(type, props, ...children) {
  const { key, ...rest } = props || {};   // key는 props 밖으로 (6-2)
  return {
    type,
    props: rest,
    key,
    children: children
      .flat()                              // 배열 자식은 펴서 늘어놓는다 (6-3)
      .map((child) => (typeof child === 'string' ? textVnode(child) : child)),
  };
}

/** 글자 노드 VDOM. h와 domToVdom이 같은 모양을 쓰도록 한 곳에 둔다 (6-2) */
function textVnode(nodeValue) {
  return { type: '#text', props: { nodeValue }, children: [] };
}

const TEXT_NODE = 3;
const COMMENT_NODE = 8;

/**
 * 실제 DOM 노드 → VDOM (R3)
 * 공백만 있는 글자와 주석도 버리지 않는다 (docs/design.md 6-2)
 *   <li class="done">빨래</li>
 *   → { type: 'li', props: { class: 'done' }, key: undefined,
 *       children: [{ type: '#text', props: { nodeValue: '빨래' }, children: [] }] }
 */
export function domToVdom(node) {
  if (node.nodeType === TEXT_NODE) {
    return textVnode(node.nodeValue);
  }
  if (node.nodeType === COMMENT_NODE) {
    return { type: '#comment', props: { nodeValue: node.nodeValue }, children: [] };
  }

  const props = {};
  for (const attr of node.attributes) {
    props[attr.name] = attr.value;
  }
  return {
    type: node.tagName.toLowerCase(),
    props,
    key: undefined,   // 실제 DOM에는 key가 없다 (6-2)
    children: [...node.childNodes].map(domToVdom),
  };
}

/**
 * VDOM → 실제 DOM 노드 (R3). domToVdom의 반대
 *   { type: 'li', props: { class: 'done' }, children: [#text '빨래'] }
 *   → <li class="done">빨래</li>
 * key는 props 밖에 있어서 DOM에 들어가지 않는다 (6-2)
 */
export function vdomToDom(vnode) {
  if (vnode.type === '#text') {
    return document.createTextNode(vnode.props.nodeValue);
  }
  if (vnode.type === '#comment') {
    return document.createComment(vnode.props.nodeValue);
  }

  const el = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    if (typeof value === 'function') {
      el[name] = value;               // 이벤트: el.onclick = fn (6-3)
    } else {
      el.setAttribute(name, value);   // 그 외: class="done"
    }
  }
  for (const child of vnode.children) {
    el.appendChild(vdomToDom(child));
  }
  return el;
}
