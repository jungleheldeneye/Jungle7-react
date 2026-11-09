/**
 * VDOM 노드: { type, key, props, children }
 * - 텍스트 노드는 문자열
 * - 속성 이름은 HTML 그대로 (class), 속성이 없으면 props는 {}
 * 규칙: notes/implementation-rules.md
 */

// property로 넣어야 화면에 반영되는 속성 (attribute는 초깃값일 뿐)
const PROPERTY_PROPS = new Set(['value', 'checked']);

/** 공백뿐인 텍스트 노드와 주석은 버린다 */
export function shouldSkip(node) {
  if (node.nodeType === Node.COMMENT_NODE) return true;
  return node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '';
}

/** 실제 DOM에서 버릴 노드를 지운다 (VDOM과 childNodes 번호를 맞추기 위해 처음 한 번 호출) */
export function stripBlankNodes(node) {
  for (const child of [...node.childNodes]) {
    if (shouldSkip(child)) child.remove();
    else if (child.nodeType === Node.ELEMENT_NODE) stripBlankNodes(child);
  }
}

/** 자식 정리: 배열은 펼치고, null/undefined/true/false는 버리고, 숫자는 문자열로 */
function normalizeChildren(children, out = []) {
  for (const child of children) {
    if (Array.isArray(child)) normalizeChildren(child, out);
    else if (child === null || child === undefined || typeof child === 'boolean') continue;
    else if (typeof child === 'number') out.push(String(child));
    else out.push(child);
  }
  return out;
}

/**
 * h(type, props, ...children) → VDOM 노드
 * type이 함수(컴포넌트)면 바로 호출해서 결과 VDOM을 돌려준다.
 */
export function h(type, props, ...children) {
  const { key = null, ...rest } = props ?? {};
  const kids = normalizeChildren(children);

  if (typeof type === 'function') {
    const vnode = type({ ...rest, children: kids });
    // 컴포넌트에 준 key는 결과 VDOM으로 옮긴다
    if (key !== null && vnode !== null && typeof vnode === 'object') {
      return { ...vnode, key };
    }
    return vnode;
  }

  return { type, key, props: rest, children: kids };
}

/** 실제 DOM 노드 → VDOM (버릴 노드면 null) */
export function domToVdom(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return shouldSkip(node) ? null : node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const props = {};
  for (const attr of node.attributes) props[attr.name] = attr.value;

  const children = [];
  for (const child of node.childNodes) {
    const vchild = domToVdom(child);
    if (vchild !== null) children.push(vchild);
  }

  return { type: node.tagName.toLowerCase(), key: null, props, children };
}

/** VDOM → 실제 DOM 노드 */
export function vdomToDom(vnode) {
  if (typeof vnode === 'string') return document.createTextNode(vnode);

  const el = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) setProp(el, name, value);
  for (const child of vnode.children) el.appendChild(vdomToDom(child));
  return el;
}

function setAttr(el, name, value) {
  if (value === null || value === undefined || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : String(value));
}

/**
 * 속성 하나를 실제 DOM에 설정 (vdomToDom과 patch가 같이 씀)
 * - onClick 같은 함수 props: property 대입, null이면 제거
 * - value, checked: attribute(HTML에 보이는 값)와 property(화면에 보이는 값)를 둘 다 맞춤
 * - 나머지: attribute, null이면 제거
 */
export function setProp(el, name, value) {
  if (/^on[A-Z]/.test(name)) {
    el[name.toLowerCase()] = typeof value === 'function' ? value : null;
    return;
  }

  setAttr(el, name, value);

  if (PROPERTY_PROPS.has(name)) {
    const next = name === 'checked'
      ? value !== null && value !== undefined && value !== false // HTML의 checked=""도 true
      : String(value ?? '');
    // 같은 값이면 다시 넣지 않음 (입력 중 커서 튐 방지)
    if (el[name] !== next) el[name] = next;
  }
}
