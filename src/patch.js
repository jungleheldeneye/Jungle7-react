import { vdomToDom, setProp } from './vdom.js';

/**
 * diff가 만든 변경 목록을 실제 DOM에 반영하고, 반영한 뒤의 루트를 돌려준다 (R3)
 *   <p>0</p> 에 [{ type: 'PROPS', path: [0], props: { nodeValue: '1' } }]
 *   → <p>1</p>, 돌려주는 값은 같은 <p>
 *   <div>..</div> 에 [{ type: 'REPLACE', path: [], vnode: h('section', ...) }]
 *   → <section>..</section>, 돌려주는 값은 새 <section> (6-3 patch 반환값)
 *
 * 1. 고치기 전에 대상 노드를 전부 찾는다. diff의 번호는 모두 "고치기 전" 트리 번호라 지금 찾아야 맞는다
 * 2. 찾아 둔 노드에 목록 순서대로 적용한다. 앞의 REMOVE·MOVE가 번호를 밀어도 이미 노드를 쥐고 있어서 상관없다
 * (6-3 patch가 노드 찾기)
 */
export function patch(rootNode, patches) {
  const jobs = patches.map((change) => findTarget(rootNode, change));
  return jobs.reduce(applyPatch, rootNode);
}

/**
 * 변경 하나가 고칠 노드(target)와, 끼울 때 기준이 되는 노드(anchor)를 찾는다
 *   CREATE { path: [0], before: 2 } → target: 루트의 0번 자식(부모), anchor: 그 부모의 옛 2번 자식
 *   MOVE   { path: [0, 3], before: 0 } → target: 옮길 노드, anchor: 같은 부모의 옛 0번 자식
 */
function findTarget(root, change) {
  const target = nodeAt(root, change.path);
  if (change.before === undefined || change.before === null) {
    // CREATE·MOVE가 아닌 변경이거나, 맨 뒤에 붙이는 경우 (insertBefore(x, null) = 맨 뒤)
    return { change, target, anchor: null };
  } else if (change.type === 'CREATE') {
    // CREATE의 path는 부모라서, 기준점은 그 자식 중에서 찾는다
    return { change, target, anchor: target.childNodes[change.before] };
  } else {
    // MOVE의 path는 옮길 노드라서, 기준점은 그 형제 중에서 찾는다
    return { change, target, anchor: target.parentNode.childNodes[change.before] };
  }
}

/**
 * 찾아 둔 노드에 변경 하나를 적용한다. 이전 루트를 받아 다음 루트를 돌려준다
 */
function applyPatch(root, { change, target, anchor }) {
  switch (change.type) {
    case 'CREATE':
      // 부모 안에서 기준점 앞에 새 노드를 넣는다. 기준점이 없으면 맨 뒤
      target.insertBefore(vdomToDom(change.vnode), anchor);
      return root;

    case 'REMOVE':
      target.remove();
      return root;

    case 'REPLACE': {
      const next = vdomToDom(change.vnode);
      target.replaceWith(next);
      // 루트 자체가 바뀌었으면(<div> → <section>) 새 루트를 다음 변경과 부르는 쪽에 넘긴다
      return target === root ? next : root;
    }

    case 'MOVE':
      // 같은 노드를 기준점 앞으로 옮긴다. insertBefore는 원래 자리에서 빼서 넣어 주니 한 번이면 된다
      // 지우고 새로 만드는 게 아니라 입력창의 글자가 남는다 (R3, R8)
      target.parentNode.insertBefore(target, anchor);
      return root;

    case 'PROPS':
      // { class: 'done', title: undefined } → class는 넣고 title은 지운다. 목록에 없는 속성은 안 건드린다
      Object.entries(change.props).forEach(([name, value]) => setProp(target, name, value));
      return root;
  }
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/** 루트에서 path를 따라 내려간 노드. [] → 루트, [0, 2] → 루트의 0번 자식의 2번 자식 */
function nodeAt(root, path) {
  return path.reduce((node, i) => node.childNodes[i], root);
}
