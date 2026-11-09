import { vdomToDom, setProp } from './vdom.js';

/**
 * 변경 목록을 rootNode 기준으로 실제 DOM에 반영
 * (path가 []인 REPLACE는 rootNode 자체를 교체할 수 있음)
 *
 * 앞에서 지우면 뒤 번호가 밀리므로, 대상 노드를 먼저 전부 찾아 둔 뒤 적용한다.
 * CREATE는 아직 없는 노드를 가리키므로 부모와 끼워 넣을 위치를 찾아 둔다.
 *
 * @returns 반영 후의 루트 노드 (루트가 교체됐으면 새 노드)
 */
export function patch(rootNode, patches) {
  const find = (path) => path.reduce((node, i) => node?.childNodes[i], rootNode);

  // 1. 대상 찾기
  const jobs = patches.map((p) => {
    if (p.type === 'CREATE') {
      const parent = find(p.path.slice(0, -1));
      const before = parent?.childNodes[p.path[p.path.length - 1]] ?? null;
      return { p, parent, before };
    }
    return { p, target: find(p.path) };
  });

  // 2. 적용
  let root = rootNode;
  for (const { p, target, parent, before } of jobs) {
    switch (p.type) {
      case 'CREATE':
        parent.insertBefore(vdomToDom(p.node), before);
        break;
      case 'REMOVE':
        target.remove();
        break;
      case 'REPLACE': {
        const next = vdomToDom(p.node);
        target.replaceWith(next);
        if (target === rootNode) root = next;
        break;
      }
      case 'PROPS':
        for (const [name, value] of Object.entries(p.props)) setProp(target, name, value);
        break;
      case 'TEXT':
        target.nodeValue = p.value;
        break;
      default:
        throw new Error(`알 수 없는 변경 타입: ${p.type}`);
    }
  }
  return root;
}
