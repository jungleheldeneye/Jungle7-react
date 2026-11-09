/**
 * 두 VDOM을 비교해 변경 목록을 반환
 * path는 루트([])부터 내려가는 자식 인덱스 배열이다.
 * CREATE와 REPLACE는 vnode, TEXT는 value, PROPS는 props를 담는다.
 * PROPS에서 값이 null인 속성은 삭제 대상이다.
 * MOVE의 path는 변경 전 위치, nextPath는 변경 후 위치다.
 * CREATE/MOVE에 beforePath가 있으면 변경 전 경로로 찾은 노드 앞에 놓는다.
 */
export function diff(previousNode, nextNode) {
  const patches = [];
  compareNodes(previousNode, nextNode, [], patches);
  return patches;
}

class DuplicateKeyError extends Error {
  constructor(key) {
    super(`같은 부모 아래에 key ${JSON.stringify(key)}가 여러 번 나와요.`);
    this.name = 'DuplicateKeyError';
  }
}

function addPatch(patches, change, nextPath = change.path) {
  patches.push(nextPath === change.path ? change : { ...change, nextPath });
}

function compareNodes(previousNode, nextNode, path, patches, nextPath = path) {
  if (previousNode === nextNode) return;

  if (previousNode == null) {
    if (nextNode != null) {
      addPatch(patches, { type: 'CREATE', path, vnode: nextNode }, nextPath);
    }
    return;
  }

  if (nextNode == null) {
    patches.push({ type: 'REMOVE', path });
    return;
  }

  const sameType = typeof previousNode === typeof nextNode && previousNode.type === nextNode.type;
  const sameKey = (previousNode.key ?? null) === (nextNode.key ?? null);
  if (!sameType || !sameKey) {
    addPatch(patches, { type: 'REPLACE', path, vnode: nextNode }, nextPath);
    return;
  }

  if (typeof nextNode === 'string') {
    addPatch(patches, { type: 'TEXT', path, value: nextNode }, nextPath);
    return;
  }

  compareProps(previousNode.props, nextNode.props, path, patches, nextPath);

  const previousChildren = previousNode.children;
  const nextChildren = nextNode.children;
  const hasKey = (child) => child?.key != null;
  if (previousChildren.some(hasKey) || nextChildren.some(hasKey)) {
    compareKeyedChildren(previousChildren, nextChildren, path, nextPath, patches);
    return;
  }

  const childCount = Math.max(previousChildren.length, nextChildren.length);
  for (let index = 0; index < childCount; index += 1) {
    const childPath = [...path, index];
    const nextChildPath = nextPath === path ? childPath : [...nextPath, index];
    compareNodes(previousChildren[index], nextChildren[index], childPath, patches, nextChildPath);
  }
}

function compareKeyedChildren(previousChildren, nextChildren, path, nextPath, patches) {
  const previousByKey = new Map();
  const previousWithoutKey = [];
  previousChildren.forEach((child, index) => {
    const key = child?.key;
    if (key == null) {
      previousWithoutKey.push(index);
    } else {
      if (previousByKey.has(key)) throw new DuplicateKeyError(key);
      previousByKey.set(key, index);
    }
  });

  const seenKeys = new Set();
  let unkeyedIndex = 0;
  const matches = nextChildren.map((child) => {
    const key = child?.key;
    // 키 없는 자식은 키 없는 자식끼리 기존 순서대로 짝짓는다.
    if (key == null) return previousWithoutKey[unkeyedIndex++] ?? -1;
    if (seenKeys.has(key)) throw new DuplicateKeyError(key);
    seenKeys.add(key);
    return previousByKey.get(key) ?? -1;
  });

  const matched = new Set(matches);
  previousChildren.forEach((_, index) => {
    if (!matched.has(index)) patches.push({ type: 'REMOVE', path: [...path, index] });
  });

  const stable = findStableChildren(matches);
  let groupStart = 0;
  // 제자리에 둘 노드를 기준점으로 잡고, 그 앞에 들어갈 자식을 순서대로 배치한다.
  for (let anchor = 0; anchor <= matches.length; anchor += 1) {
    if (anchor < matches.length && !stable.has(anchor)) continue;
    const beforePath = anchor < matches.length ? [...path, matches[anchor]] : null;
    for (let index = groupStart; index < anchor; index += 1) {
      const previousIndex = matches[index];
      if (previousIndex === -1) {
        const childPath = [...path, index];
        const change = { type: 'CREATE', path: childPath, vnode: nextChildren[index] };
        if (beforePath) change.beforePath = beforePath;
        addPatch(patches, change, nextPath === path ? childPath : [...nextPath, index]);
      } else {
        const change = { type: 'MOVE', path: [...path, previousIndex], nextPath: [...nextPath, index] };
        if (beforePath) change.beforePath = beforePath;
        patches.push(change);
      }
    }
    groupStart = anchor + 1;
  }

  // 배치를 먼저 적용하므로 태그가 바뀌는 노드도 교체 전의 기준점으로 쓸 수 있다.
  matches.forEach((previousIndex, index) => {
    if (previousIndex === -1) return;
    const childPath = [...path, previousIndex];
    const nextChildPath = nextPath === path && previousIndex === index ? childPath : [...nextPath, index];
    compareNodes(previousChildren[previousIndex], nextChildren[index], childPath, patches, nextChildPath);
  });
}

// 기존 인덱스가 오름차순인 가장 긴 묶음은 이동 없이 상대 순서를 유지할 수 있다.
function findStableChildren(matches) {
  const tails = [];
  const preceding = Array(matches.length).fill(-1);
  matches.forEach((previousIndex, index) => {
    if (previousIndex === -1) return;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (matches[tails[middle]] < previousIndex) low = middle + 1;
      else high = middle;
    }
    if (low > 0) preceding[index] = tails[low - 1];
    tails[low] = index;
  });

  const stable = new Set();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = preceding[index]) {
    stable.add(index);
  }
  return stable;
}

function compareProps(previousProps, nextProps, path, patches, nextPath) {
  const changes = [];

  for (const name of Object.keys(previousProps)) {
    if (!Object.hasOwn(nextProps, name)) changes.push([name, null]);
  }
  for (const [name, nextValue] of Object.entries(nextProps)) {
    const existed = Object.hasOwn(previousProps, name);
    if (!existed || !Object.is(previousProps[name], nextValue)) {
      changes.push([name, nextValue]);
    }
  }

  if (changes.length === 0) return;

  const patch = { type: 'PROPS', path, props: Object.fromEntries(changes) };
  // Patch에서 이전 이벤트 리스너를 떼려면 원래 함수가 필요하다.
  const hasPreviousHandler = changes.some(([name]) => typeof previousProps[name] === 'function');
  if (hasPreviousHandler) {
    patch.previousProps = previousProps;
  }
  addPatch(patches, patch, nextPath);
}
