/**
 * 코드 → VDOM (R2, R4, R8)
 *   h('li', { class: 'done', key: 3 }, '빨래')
 *   → { type: 'li', props: { class: 'done' }, key: 3, children: [#text '빨래'] }
 * type이 컴포넌트 함수여도 실행하지 않고 담아만 둔다 (R5)
 */
export function h(type, props, ...children) {
  const { key, ...rest } = props || {};   // key는 props 밖으로 (6-2) -> 왼쪽 값이 비어있으면 {} 선택 
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
    setProp(el, name, value);   // patch와 같은 규칙 한 곳 (6-3 속성 넣기)
  }
  for (const child of vnode.children) {
    el.appendChild(vdomToDom(child));
  }
  return el;
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/**
 * 속성 하나를 실제 노드에 넣거나 지운다. value가 undefined면 사라진 속성이다 (6-3 사라진 속성)
 *   setProp(<li>, 'class', 'done')  → <li class="done">
 *   setProp(<li>, 'class', undefined) → <li>
 * 처음 만들 때(vdomToDom)와 고칠 때(patch)가 같이 쓴다. 규칙이 한 곳에 있어야
 * "patch 결과 = 처음부터 그린 것"(2-2 patch 보장)이 어긋나지 않는다 (R3)
 */
export function setProp(node, name, value) {
  switch (name) {
    case 'nodeValue':
      // 글자·주석: '0' → '1'. 글자 노드엔 setAttribute가 없어서 property로 (6-2)
      node.nodeValue = value;
      return;

    case 'value':
      // 입력창: HTML(attribute)과 화면 칸(property)을 둘 다 고친다 (6-3 patch의 value)
      // 사용자가 친 뒤엔 attribute만 바꾸면 화면이 안 따라와서 칸도 고친다
      if (value === undefined) {
        node.removeAttribute('value');   // 사라짐
        node.value = '';
      } else {
        node.setAttribute('value', value);   // 바뀜: '밥' → ''
        node.value = value;
      }
      return;

    default:
      if (typeof value === 'function') {
        // 이벤트가 생기거나 바뀜: onclick = 새 함수 (6-3 속성 넣기)
        node[name] = value;
      } else if (value === undefined && typeof node[name] === 'function') {
        // 이벤트가 사라짐: 지금 node.onclick에 함수가 있으면 null로 뗀다
        node[name] = null;
      } else if (value === undefined) {
        // 그 외 속성이 사라짐: class
        node.removeAttribute(name);
      } else {
        // 그 외 속성이 생기거나 바뀜: class="done"
        node.setAttribute(name, value);
      }
  }
}
