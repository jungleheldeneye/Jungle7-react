/**
 * 두 VDOM을 비교해 변경 목록을 만든다 (R3). 실제 DOM은 건드리지 않는다
 *   diff(h('p', null, '0'), h('p', null, '1'))
 *   → [{ type: 'PROPS', path: [0], props: { nodeValue: '1' } }]
 *
 * 변경 5가지 (docs/design.md 6-3)
 *   CREATE  { path, before, vnode }  path(부모) 안에서 옛 before번 노드 앞에 새 노드를 넣음. before가 null이면 맨 뒤
 *   REMOVE  { path }                 그 노드 삭제
 *   REPLACE { path, vnode }          통째로 바꿈
 *   PROPS   { path, props }          속성만 바꿈. 사라진 속성은 undefined. 글자 변경도 여기 (nodeValue)
 *   MOVE    { path, before }         그 노드를 같은 부모의 옛 before번 노드 앞으로 옮김. null이면 맨 뒤 (R8)
 * path: 루트에서 몇 번째 자식을 따라 내려가는지. [0, 2] = 루트의 0번 자식의 2번 자식
 *
 * 모든 번호는 "고치기 전" 트리의 번호다. patch가 고치기 전에 대상을 전부 찾아 두니 앞 변경이 번호를 밀어도 상관없다
 * 순서는 한 부모마다 삭제 → 자리 잡기(CREATE·MOVE) → 짝 맞은 자식의 안쪽 변경
 */
export function diff(oldVnode, newVnode) {
  return walk(oldVnode, newVnode, []);
}

/** 짝지어진 노드 한 쌍의 변경 목록. path는 옛 노드의 위치 */
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
 *   old: A(1) B(2) C(3) D(4)  →  new: C(3) A(1) E(5) B(2)      (괄호 안은 key, 옛 번호 A0 B1 C2 D3)
 *   1. 삭제:      REMOVE [3] (D)
 *   2. 그대로 둘 자식: 새 순서로 놓은 옛 번호 [2, 0, 1] 중 커지는 가장 긴 줄 [0, 1] → A, B는 안 움직인다
 *   3. 자리 잡기: C는 다음 그대로 둘 자식 A(옛 0번) 앞으로 → MOVE [2] before 0
 *                E는 다음 그대로 둘 자식 B(옛 1번) 앞에    → CREATE [] before 1
 *   4. 안쪽 비교: C·A·B를 옛 위치 [2], [0], [1]로 walk
 * 그대로 둘 자식은 움직이지 않으니, 나머지를 "새 순서에서 바로 다음에 오는 그대로 둘 자식" 앞에 끼우면 순서가 맞는다
 */
function diffChildren(oldChildren, newChildren, path) {
  // 둘 다 자식이 없으면(글자·주석·빈 태그) 볼 게 없다. 노드 절반이 글자라 이름·Map 만들기를 건너뛰면 빨라진다
  if (oldChildren.length === 0 && newChildren.length === 0) return [];

  const oldNames = namesOf(oldChildren);
  const newNames = namesOf(newChildren);
  assertUnique(oldNames);
  assertUnique(newNames);
  const oldIndexOf = new Map(oldNames.map((name, i) => [name, i]));
  const newNameSet = new Set(newNames);

  // 1. 삭제: new에 없는 옛 자식. patch가 미리 찾아 두니 번호 순서는 상관없다
  const removes = oldNames.flatMap((name, i) => (newNameSet.has(name) ? [] : [{ type: 'REMOVE', path: [...path, i] }]));

  // 2. 그대로 둘 자식: 짝 있는 새 자식들의 옛 번호를 새 순서로 놓고, 커지는 가장 긴 줄(LIS)
  //    이 줄은 서로의 앞뒤 순서가 이미 맞아서 움직이지 않아도 된다. 나머지만 옮기면 이동이 가장 적다
  const matchedNew = newNames.flatMap((name, i) => (oldIndexOf.has(name) ? [i] : []));   // 짝 있는 새 번호들
  const stayNew = longestIncreasing(matchedNew.map((i) => oldIndexOf.get(newNames[i]))).map((k) => matchedNew[k]);
  const stays = new Set(stayNew);   // 새 번호로 찾기

  // 3. 자리 잡기: 그대로 둘 자식이 아니면, 새 순서에서 바로 뒤에 오는 그대로 둘 자식(옛 번호) 앞에 놓는다
  const placements = newChildren.flatMap((child, i) => {
    if (stays.has(i)) return [];   // 그대로 둘 자식: 할 일 없음
    const k = firstIndexWhere(stayNew.length, (j) => stayNew[j] > i);   // i 뒤의 첫 그대로 둘 자식
    const before = k < stayNew.length ? oldIndexOf.get(newNames[stayNew[k]]) : null;   // 뒤에 없으면 맨 뒤
    const from = oldIndexOf.get(newNames[i]);
    if (from === undefined) {
      return [{ type: 'CREATE', path, before, vnode: child }];   // 새 자식: E
    } else {
      return [{ type: 'MOVE', path: [...path, from], before }];   // 옮길 자식: C
    }
  });

  // 4. 안쪽 비교: 짝 있는 자식은 옛 위치 그대로 walk. 새 자식은 통째로 만드니 볼 필요 없다
  //    자리 잡기보다 뒤에 둬서, 기준점이 REPLACE되더라도 이미 끼운 뒤가 된다
  const inner = newChildren.flatMap((child, i) => {
    const from = oldIndexOf.get(newNames[i]);
    return from === undefined ? [] : walk(oldChildren[from], child, [...path, from]);
  });

  return [...removes, ...placements, ...inner];
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
 * 가장 긴 증가 부분 수열(LIS)의 칸 번호들 (오름차순). O(n log n)
 *   [3, 0, 1, 2] → [1, 2, 3]   (값 0, 1, 2)
 *
 * tails[len - 1]: 길이 len인 증가하는 줄 중에서, 끝값이 가장 작은 줄의 마지막 칸 번호
 *   끝값이 작을수록 뒤에 더 많이 이어 붙일 수 있으니, 길이마다 그 줄 하나만 기억한다
 *   tails의 끝값들은 항상 커지는 순서라서 이분 탐색으로 자리를 찾을 수 있다
 * prev[i]: i번 칸이 들어간 줄에서 바로 앞 칸. 마지막에 거꾸로 따라가서 줄을 복원한다
 *
 * 이 알고리즘은 tails를 고쳐 가며 쓰는 게 핵심이라, tails는 바꿔 쓰는 배열로 둔다
 */
function longestIncreasing(values) {
  const tails = [];
  const prev = values.map((value, i) => {
    // value가 들어갈 자리: 끝값이 value 이상인 첫 길이
    const len = firstIndexWhere(tails.length, (k) => values[tails[k]] >= value);
    tails[len] = i;                           // 길이 len + 1인 줄의 끝을 i로 바꾸거나 새로 만든다
    return len > 0 ? tails[len - 1] : -1;     // 한 칸 짧은 줄 뒤에 이어 붙인다
  });

  // 줄 복원: 마지막 칸에서 prev를 따라 거꾸로 가며 뒤에서부터 채운다. O(n)
  // 전엔 [...앞줄, i]로 칸마다 앞줄을 복사해서 O(n²)이었고(5000개에서 36ms), 재귀라 20000개에서 스택이 넘쳤다
  // tails처럼 칸을 채워 가는 게 알고리즘 자체라 chain도 바꿔 쓰는 배열로 둔다
  const chain = new Array(tails.length);
  for (let k = tails.length - 1, i = tails.at(-1); k >= 0; k -= 1, i = prev[i]) {
    chain[k] = i;
  }
  return chain;
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
