import { vdomToDom } from './vdom.js';

/**
 * diff가 만든 변경 목록을 실제 DOM에 반영하고, 반영한 뒤의 루트를 돌려준다 (R3)
 *   <p>0</p> 에 [{ type: 'PROPS', path: [0], props: { nodeValue: '1' } }]
 *   → <p>1</p>, 돌려주는 값은 같은 <p>
 *   <div>..</div> 에 [{ type: 'REPLACE', path: [], vnode: h('section', ...) }]
 *   → <section>..</section>, 돌려주는 값은 새 <section> (6-3 patch 반환값)
 *
 * 변경은 목록 순서대로 하나씩 적용한다. 각 path는 앞 변경이 적용된 뒤의 위치라서
 * 순서를 바꾸거나 건너뛰면 안 된다 (6-3 변경 적용 순서)
 */
export function patch(rootNode, patches) {
  return patches.reduce(applyPatch, rootNode);
}

/**
 * 변경 하나를 적용한다. 이전 루트를 받아 다음 루트를 돌려준다
 * 대상 노드는 변경마다 루트에서 path를 따라 내려가 찾는다 (6-3 patch가 노드 찾기)
 */
function applyPatch(root, change) {
  switch (change.type) {
    case 'CREATE': {
      // path [0, 2] → 루트의 0번 자식 안에서 2번 자리에 끼운다. 2번이 맨 끝 다음이면 맨 뒤에 붙는다
      const parent = nodeAt(root, change.path.slice(0, -1));
      parent.insertBefore(vdomToDom(change.vnode), parent.childNodes[change.path.at(-1)] ?? null);
      return root;
    }

    case 'REMOVE':
      // path [0, 2] → 그 노드를 뺀다. diff가 뒤 번호부터 주니 남은 번호는 밀리지 않는다
      nodeAt(root, change.path).remove();
      return root;

    case 'REPLACE': {
      const next = vdomToDom(change.vnode);
      if (change.path.length === 0) {
        // 루트 자체가 바뀜: <div> → <section>. 옛 루트는 화면에서 빠지니 새 루트를 다음 변경에 넘긴다
        root.replaceWith(next);
        return next;
      } else {
        // 루트 아래 노드가 바뀜: <li> → <p>, 글자 → <b>. 루트는 그대로다
        nodeAt(root, change.path).replaceWith(next);
        return root;
      }
    }

    case 'MOVE': {
      // path [0, 3], to 0 → 0번 자식 안의 3번 노드를 빼서, 뺀 뒤 목록의 0번 자리에 넣는다
      // 같은 노드를 옮기는 것이라 입력창의 글자가 남는다 (R3, R8)
      const node = nodeAt(root, change.path);
      const parent = node.parentNode;
      node.remove();
      parent.insertBefore(node, parent.childNodes[change.to] ?? null);
      return root;
    }

    case 'PROPS': {
      // { class: 'done', title: undefined } → class는 넣고 title은 지운다. 목록에 없는 속성은 안 건드린다
      const node = nodeAt(root, change.path);
      Object.entries(change.props).forEach(([name, value]) => setProp(node, name, value));
      return root;
    }
  }
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/** 루트에서 path를 따라 내려간 노드. [] → 루트, [0, 2] → 루트의 0번 자식의 2번 자식 */
function nodeAt(root, path) {
  return path.reduce((node, i) => node.childNodes[i], root);
}

/**
 * 속성 하나를 실제 노드에 넣거나 지운다. value가 undefined면 사라진 속성이다 (6-3 사라진 속성)
 *   setProp(<li>, 'class', 'done')  → <li class="done">
 *   setProp(<li>, 'class', undefined) → <li>
 */
function setProp(node, name, value) {
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
        // 이벤트가 생기거나 바뀜: onclick = 새 함수. vdomToDom과 같은 규칙 (6-3 속성 넣기)
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
