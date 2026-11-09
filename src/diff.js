/**
 * 두 VDOM을 비교해 변경 목록을 만든다 (R3). 실제 DOM은 건드리지 않는다
 *   diff(h('p', null, '0'), h('p', null, '1'))
 *   → [{ type: 'PROPS', path: [0], props: { nodeValue: '1' } }]
 *
 * 변경 5가지 (docs/design.md 6-3)
 *   CREATE  { path, vnode }   그 자리에 새 노드 추가
 *   REMOVE  { path }          그 자리의 노드 삭제
 *   REPLACE { path, vnode }   통째로 바꿈
 *   PROPS   { path, props }   속성만 바꿈. 사라진 속성은 undefined. 글자 변경도 여기 (nodeValue)
 *   MOVE    { path, to }      그 자리의 노드를 빼서, 뺀 뒤 목록의 to번 자리에 넣음 (R8)
 * path: 루트에서 몇 번째 자식을 따라 내려가는지. [0, 2] = 루트의 0번 자식의 2번 자식
 *
 * 변경 목록은 위에서부터 순서대로 적용해야 한다. 각 path는 앞의 변경이 적용된 뒤의 위치다
 */
export function diff(oldVnode, newVnode) {
  return walk(oldVnode, newVnode, []);
}

/** 짝지어진 노드 한 쌍의 변경 목록 */
function walk(oldVnode, newVnode, path) {
  if (oldVnode.type !== newVnode.type) {
    return [{ type: 'REPLACE', path, vnode: newVnode }];   // 통째로 바뀌니 자식은 볼 필요 없다
  }

  const props = diffProps(oldVnode.props, newVnode.props);
  const propsPatches = Object.keys(props).length > 0 ? [{ type: 'PROPS', path, props }] : [];
  return [...propsPatches, ...diffChildren(oldVnode.children, newVnode.children, path)];
}

/**
 * 자식 목록을 비교한다 (R3, R8)
 *   old: A(1) B(2) C(3) D(4)  →  new: C(3) A(1) E(5) B(2)      (괄호 안은 key)
 *   REMOVE [3] (D) → MOVE [2] to 0 (C) → CREATE [2] (E), A·B·C는 walk로 안쪽 비교
 *
 * current는 "지금까지 만든 변경을 적용했다면 실제 DOM 자식 순서가 이렇다"를 흉내 낸 이름 목록이다.
 * 모든 번호를 current에서 읽어서, patch가 목록 순서대로 적용하기만 하면 맞게 한다
 */
function diffChildren(oldChildren, newChildren, path) {
  const oldNames = namesOf(oldChildren);
  const newNames = namesOf(newChildren);
  assertUnique(oldNames);
  assertUnique(newNames);

  // 1. 삭제: new에 없는 옛 자식. 뒤 번호부터 적어서 앞 번호가 밀리지 않게 한다
  const newNameSet = new Set(newNames);
  const removes = oldNames
    .flatMap((name, i) => (newNameSet.has(name) ? [] : [{ type: 'REMOVE', path: [...path, i] }]))
    .reverse();
  const current = oldNames.filter((name) => newNameSet.has(name));
  const oldByName = new Map(oldChildren.map((child, i) => [oldNames[i], child]));

  // 2. 그대로 둘 자식: 남은 옛 자식을 new 순서로 놓고, current 위치가 커지는 가장 긴 줄(LIS)
  //    이 줄은 서로의 앞뒤 순서가 이미 맞아서 움직이지 않아도 된다. 나머지만 옮기면 이동이 가장 적다
  const positionOf = new Map(current.map((name, i) => [name, i]));
  const kept = newNames.filter((name) => oldByName.has(name));
  const stay = new Set(longestIncreasing(kept.map((name) => positionOf.get(name))).map((k) => kept[k]));

  // 3. new 순서대로 한 명씩 자리를 잡는다. 앞 자식이 자리 잡은 결과(current, prevIndex)를 다음 자식이 이어받는다
  const placed = newNames.reduce(
    (state, name, i) => placeChild(state, {
      name,
      path,
      oldChild: oldByName.get(name),
      newChild: newChildren[i],
      stays: stay.has(name),
    }),
    { current, prevIndex: -1, patches: [] },   // prevIndex: 바로 앞 형제가 current에서 몇 번인지. 처음엔 없음
  );
  return [...removes, ...placed.patches];
}

/**
 * 자식 하나를 바로 앞 형제 뒤에 놓는다. 이전 상태를 받아 다음 상태를 돌려준다
 *   그대로 둘 자식: 제자리에서 안쪽만 비교
 *   새 자식:       앞 형제 뒤에 CREATE
 *   옮길 자식:     앞 형제 뒤로 MOVE 하고 안쪽 비교
 */
function placeChild({ current, prevIndex, patches }, { name, path, oldChild, newChild, stays }) {
  if (stays) {
    // 그대로 둘 자식은 항상 앞 형제보다 뒤에 있으니, 그 뒤부터만 찾는다
    const index = current.indexOf(name, prevIndex + 1);
    return {
      current,
      prevIndex: index,
      patches: [...patches, ...walk(oldChild, newChild, [...path, index])],
    };
  }

  const from = current.indexOf(name);   // 새 자식이면 -1
  // 앞 형제 바로 뒤. 앞 형제보다 앞에서 빼냈으면 앞 형제가 한 칸 당겨진다
  const index = from !== -1 && from < prevIndex ? prevIndex : prevIndex + 1;
  const next = (from === -1 ? current : current.toSpliced(from, 1)).toSpliced(index, 0, name);

  if (from === -1) {
    // 새로 만드니 안쪽은 볼 필요 없다
    return {
      current: next,
      prevIndex: index,
      patches: [...patches, { type: 'CREATE', path: [...path, index], vnode: newChild }],
    };
  }

  const move = from !== index ? [{ type: 'MOVE', path: [...path, from], to: index }] : [];
  return {
    current: next,
    prevIndex: index,
    patches: [...patches, ...move, ...walk(oldChild, newChild, [...path, index])],
  };
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/** 바뀐 속성만 모은다. 새로 생겼거나 값이 바뀌면 새 값, 사라졌으면 undefined */
function diffProps(oldProps, newProps) {
  const names = new Set([...Object.keys(newProps), ...Object.keys(oldProps)]);
  return Object.fromEntries(
    [...names]
      .filter((name) => isChangedProp(name, oldProps, newProps))
      .map((name) => [name, newProps[name]]),   // 사라진 속성은 newProps[name]이 undefined
  );
}

/** 속성 하나가 바뀌었나 */
function isChangedProp(name, oldProps, newProps) {
  if (!(name in newProps)) {
    return true;    // 사라짐: 옛 쪽에만 있음                예) class
  } else if (oldProps[name] !== newProps[name]) {
    return true;    // 새로 생겼거나 값이 바뀜               예) href, id
  } else {
    return false;   // 그대로                               예) title
  }
}

/**
 * 짝짓기용 이름들. key가 있으면 'k:키', 없으면 'i:key 없는 형제 중 몇 번째'. 앞 글자로 둘이 섞이지 않게 한다
 *   [A(key 1), input]           → ['k:1', 'i:0']
 *   [B(key 2), A(key 1), input] → ['k:2', 'k:1', 'i:0']   input은 그대로 'i:0'이라 짝이 맞는다
 * 전체 자리 번호를 쓰면 input이 'i:1' → 'i:2'로 바뀌어 지웠다 다시 만들어지고 입력값이 사라진다 (R3)
 * key가 하나도 없으면 전체 자리 번호와 같다
 */
function namesOf(children) {
  // key 없는 자식의 자리 번호 → key 없는 형제 중 몇 번째.  [k, -, k, -] → {1 → 0, 3 → 1}
  const unkeyedOrder = new Map(
    children
      .flatMap((child, i) => (child.key === undefined ? [i] : []))
      .map((i, order) => [i, order]),
  );
  return children.map((child, i) => (child.key === undefined ? `i:${unkeyedOrder.get(i)}` : `k:${child.key}`));
}

/** 형제 사이에 같은 key가 있으면 짝을 정할 수 없어서 에러를 낸다 (6-3) */
function assertUnique(names) {
  // 겹침이 없는 흔한 경우는 Set 한 번으로 끝낸다 (O(n)). 매번 indexOf로 찾으면 1000개에서 비교 100만 번이다
  if (new Set(names).size === names.length) return;
  // 여기는 에러가 날 때만 온다. 어느 이름이 겹쳤는지 찾아 메시지에 넣는다
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate !== undefined) {
    throw new Error(`같은 key가 형제 사이에 두 번 있습니다: ${duplicate.slice(2)}`);
  }
}

/**
 * 가장 긴 증가 부분 수열(LIS)의 칸 번호들. O(n log n)
 *   [3, 0, 1, 2] → [1, 2, 3]   (값 0, 1, 2)
 *
 * tails[len - 1]: 길이 len인 증가하는 줄 중에서, 끝값이 가장 작은 줄의 마지막 칸 번호
 *   끝값이 작을수록 뒤에 더 많이 이어 붙일 수 있으니, 길이마다 그 줄 하나만 기억한다
 *   tails의 끝값들은 항상 커지는 순서라서 이분 탐색으로 자리를 찾을 수 있다
 * prev[i]: i번 칸이 들어간 줄에서 바로 앞 칸. 마지막에 거꾸로 따라가서 줄을 복원한다
 *
 * 이 알고리즘은 tails를 고쳐 가며 쓰는 게 핵심이라, tails만은 바꿔 쓰는 배열로 둔다
 */
function longestIncreasing(values) {
  const tails = [];
  const prev = values.map((value, i) => {
    // value가 들어갈 자리: 끝값이 value 이상인 첫 길이
    const len = firstIndexWhere(tails.length, (k) => values[tails[k]] >= value);
    tails[len] = i;                           // 길이 len + 1인 줄의 끝을 i로 바꾸거나 새로 만든다
    return len > 0 ? tails[len - 1] : -1;     // 한 칸 짧은 줄 뒤에 이어 붙인다
  });

  const chainEndingAt = (i) => (i === -1 ? [] : [...chainEndingAt(prev[i]), i]);
  return chainEndingAt(tails.at(-1) ?? -1);
}

/** 0..length-1 중 isAtLeast(k)가 처음 true가 되는 k (없으면 length). 앞은 false, 뒤는 true로 나뉘어 있어야 한다 */
function firstIndexWhere(length, isAtLeast) {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isAtLeast(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
