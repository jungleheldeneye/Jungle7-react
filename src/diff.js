/**
 * 두 VDOM을 비교해 변경 목록을 반환
 *
 *   { type: 'CREATE',  path, node }   새 노드 추가 (path는 들어갈 위치까지 포함)
 *   { type: 'REMOVE',  path }         노드 삭제
 *   { type: 'REPLACE', path, node }   통째로 교체
 *   { type: 'PROPS',   path, props }  속성 변경 (null이면 삭제)
 *   { type: 'TEXT',    path, value }  글자 변경
 *
 * path는 루트부터의 자식 번호, []는 루트. 자식은 번호 순서로 비교한다.
 */
export function diff(oldVnode, newVnode) {
  const patches = [];
  walk(oldVnode, newVnode, [], patches);
  return patches;
}

function walk(oldNode, newNode, path, patches) {
  if (oldNode === undefined) {
    patches.push({ type: 'CREATE', path, node: newNode });
    return;
  }
  if (newNode === undefined) {
    patches.push({ type: 'REMOVE', path });
    return;
  }

  const oldIsText = typeof oldNode === 'string';
  const newIsText = typeof newNode === 'string';

  // 둘 다 문자열
  if (oldIsText && newIsText) {
    if (oldNode !== newNode) patches.push({ type: 'TEXT', path, value: newNode });
    return;
  }

  // 문자열과 요소, 또는 type이 다름
  if (oldIsText || newIsText || oldNode.type !== newNode.type) {
    patches.push({ type: 'REPLACE', path, node: newNode });
    return;
  }

  // 같은 요소: 속성 비교 후 자식 비교
  const props = diffProps(oldNode.props, newNode.props);
  if (props) patches.push({ type: 'PROPS', path, props });

  const length = Math.max(oldNode.children.length, newNode.children.length);
  for (let i = 0; i < length; i++) {
    walk(oldNode.children[i], newNode.children[i], [...path, i], patches);
  }
}

/** 바뀐 속성만 모은다. 사라진 속성은 null. 바뀐 게 없으면 null 반환 */
function diffProps(oldProps, newProps) {
  const changed = {};
  let hasChange = false;

  for (const [name, value] of Object.entries(newProps)) {
    if (!Object.is(oldProps[name], value)) {
      changed[name] = value;
      hasChange = true;
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      changed[name] = null;
      hasChange = true;
    }
  }

  return hasChange ? changed : null;
}
