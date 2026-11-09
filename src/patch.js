import { setProp, vdomToDom } from './vdom.js';

/**
 * 변경 목록을 rootNode 기준으로 실제 DOM에 반영
 * 적용 후의 루트 노드를 반환한다. 루트를 삭제하면 null을 반환한다.
 */
export function patch(rootNode, patches) {
  // 삭제나 교체로 자식 위치가 달라지기 전에 대상을 찾는다.
  const operations = patches.map((change) => {
    const { type, path } = change;
    const targetPath = type === 'CREATE' ? path.slice(0, -1) : path;
    const before = change.beforePath ? findNode(rootNode, change.beforePath) : null;
    return { change, target: findNode(rootNode, targetPath), before };
  });

  let root = rootNode;
  for (const { change, target, before } of operations) {
    switch (change.type) {
      case 'CREATE': {
        const node = vdomToDom(change.vnode);
        if (change.path.length === 0) root = node;
        else if (before) target.insertBefore(node, before);
        else target.appendChild(node);
        break;
      }
      case 'MOVE':
        target.parentNode.insertBefore(target, before);
        break;
      case 'REMOVE':
        target.remove();
        if (target === root) root = null;
        break;
      case 'REPLACE': {
        const node = vdomToDom(change.vnode);
        target.replaceWith(node);
        if (target === root) root = node;
        break;
      }
      case 'TEXT':
        target.data = change.value;
        break;
      case 'PROPS':
        for (const [name, value] of Object.entries(change.props)) {
          setProp(target, name, value, change.previousProps?.[name]);
        }
        break;
    }
  }

  return root;
}

function findNode(root, path) {
  let node = root;
  for (const index of path) {
    // domToVdom과 같은 자식만 세어 VDOM 경로를 실제 DOM에 대응시킨다.
    const children = Array.from(node.childNodes).filter((child) =>
      child.nodeType === Node.ELEMENT_NODE ||
      (child.nodeType === Node.TEXT_NODE && child.data.trim() !== ''),
    );
    node = children[index];
    if (!node) throw new Error(`DOM 노드를 찾을 수 없습니다: [${path.join(', ')}]`);
  }
  return node;
}
