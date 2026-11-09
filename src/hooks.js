/**
 * hooks
 * - current: 지금 렌더 중인 FunctionComponent (렌더 밖에서는 null)
 * - index: 이번 렌더에서 몇 번째 hook인지 (setCurrent에서 0으로)
 * - 칸은 종류별 객체: { kind: 'state', value }, { kind: 'effect', deps, cleanup }, { kind: 'memo', value, deps }
 */
let current = null;
let index = 0;

export function setCurrent(component) {
  current = component;
  index = 0;
}

/** 이번 렌더에서 사용한 hook 칸 수 */
export function getHookIndex() {
  return index;
}

/** 이번 순번의 칸을 꺼낸다. 첫 렌더면 만들고, 종류가 다르면 오류 */
function getSlot(kind, create) {
  if (current === null) {
    throw new Error('hook은 컴포넌트 렌더 중에만 부를 수 있어요');
  }
  const i = index++;
  const hooks = current.hooks;
  if (hooks[i] === undefined) {
    hooks[i] = { kind, ...create() };
  } else if (hooks[i].kind !== kind) {
    throw new Error(`${i}번 hook 순서가 바뀌었어요: ${hooks[i].kind} → ${kind}`);
  }
  return [hooks[i], i];
}

/** deps 비교: 없음 → 매번, 처음 → 변경, 길이가 다르면 변경, 항목별 Object.is */
export function depsChanged(prev, next) {
  if (next === undefined || prev === undefined) return true;
  if (prev.length !== next.length) return true;
  return next.some((dep, i) => !Object.is(dep, prev[i]));
}

export function useState(initialValue) {
  const component = current;
  const [slot, i] = getSlot('state', () => ({ value: initialValue }));

  // 번호 i를 고정해 둔다 (나중에 클릭으로 불릴 때 index는 다른 값)
  const setState = (next) => {
    const s = component.hooks[i];
    const value = typeof next === 'function' ? next(s.value) : next;
    if (Object.is(value, s.value)) return; // 같은 값이면 렌더 건너뜀
    s.value = value;
    component.scheduleUpdate(); // 모아서 한 번 그림
  };

  return [slot.value, setState];
}

/** 렌더 중에는 모아 두기만 하고, patch 직후 FunctionComponent가 실행한다 */
export function useEffect(effect, deps) {
  const component = current;
  const [slot] = getSlot('effect', () => ({ deps: undefined, cleanup: null }));
  if (depsChanged(slot.deps, deps)) {
    slot.deps = deps;
    component.pendingEffects.push({ slot, effect });
  }
}

/** 렌더 중 바로 계산, deps가 같으면 이전 값 재사용 */
export function useMemo(factory, deps) {
  const [slot] = getSlot('memo', () => ({ value: undefined, deps: undefined }));
  if (depsChanged(slot.deps, deps)) {
    slot.value = factory();
    slot.deps = deps;
  }
  return slot.value;
}
