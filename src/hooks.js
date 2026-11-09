import { currentRender, CHILD } from './component.js';

/**
 * 값 하나를 기억하고, 바꾸면 화면을 다시 그린다 (R1, R5)
 *   const [count, setCount] = useState(0);
 *   setCount(count + 1)      // 새 값
 *   setCount((c) => c + 1)   // 이전 값으로 계산. 한 번에 여러 번 불러도 앞 결과를 이어 받는다
 *
 * 칸 모양: { value }
 *   1. nextSlot('useState')로 이번 칸을 받는다
 *   2. 처음이면(칸이 비었으면) { value: initialValue }로 채운다
 *   3. setState를 만든다
 *      - next가 함수면 next(칸.value)로 새 값을 구한다
 *      - Object.is(새 값, 칸.value)면 아무것도 안 한다 (안 바뀌었는데 다시 그리지 않기)
 *      - 칸.value = 새 값으로 바꾸고 scheduleUpdate(owner)
 *      setState는 렌더가 끝난 뒤(클릭·effect 안)에 불리므로 currentRender가 아니라
 *      1번에서 받아 둔 owner·칸을 붙잡고 있어야 한다
 *   4. [칸.value, setState]를 돌려준다
 */
export function useState(initialValue) {
  const { owner, slot } = nextSlot('useState');
  if (!('value' in slot)) {
    slot.value = initialValue;
  }

  const setState = (next) => {
    const value = typeof next === 'function' ? next(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    scheduleUpdate(owner);
  };
  return [slot.value, setState];
}

/**
 * 렌더가 화면에 붙은 뒤, deps가 바뀌었을 때만 화면 밖 작업을 한다 (R6)
 *   useEffect(() => { document.title = `${count}번`; }, [count]);
 *   useEffect(() => { const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
 *
 * 칸 모양: { deps, cleanup }
 *   1. nextSlot('useEffect')로 이번 칸을 받는다
 *   2. depsChanged(칸.deps, deps)가 false면 끝 (실행 안 함)
 *   3. 칸.deps = deps
 *   4. 실행할 일을 owner.pendingEffects에 넣기만 한다. 실제 실행은 component.js runEffects가
 *      mount·update가 DOM을 다 고친 뒤에 한다 (지금 실행하면 아직 화면에 안 붙은 상태다)
 *      넣는 일: 지난 cleanup이 있으면 먼저 부르고 → effect() 실행 → 돌려준 값이 함수면 칸.cleanup에 저장
 */
export function useEffect(effect, deps) {
  const { owner, slot } = nextSlot('useEffect');
  if (!depsChanged(slot.deps, deps)) return;
  slot.deps = deps;

  owner.pendingEffects.push(() => {
    if (typeof slot.cleanup === 'function') slot.cleanup();
    const cleanup = effect();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  });
}

/**
 * deps가 그대로면 지난번 계산 결과를 다시 쓴다 (R7)
 *   const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);
 *
 * 칸 모양: { deps, value }
 *   1. nextSlot('useMemo')로 이번 칸을 받는다
 *   2. depsChanged(칸.deps, deps)면 칸.value = factory(), 칸.deps = deps
 *      (useEffect와 달리 렌더 중에 바로 계산한다. 결과가 이번 VDOM에 들어가야 하니까)
 *   3. 칸.value를 돌려준다
 */
export function useMemo(factory, deps) {
  const { slot } = nextSlot('useMemo');
  if (depsChanged(slot.deps, deps)) {
    slot.value = factory();
    slot.deps = deps;
  }
  return slot.value;
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 (쓰이는 순서대로) ───

/**
 * 이번에 쓸 hook 칸과 그 주인을 돌려주고 순번을 하나 올린다 (R5)
 *   App 안: useState(0) → hooks[0], useEffect(...) → hooks[1], useMemo(...) → hooks[2]
 *   다시 그릴 때도 같은 순서로 불리니 같은 칸을 다시 찾는다. 그래서 if·for 안에서 hook을 부르면 안 된다
 *
 *   1. currentRender.owner가 null이면 에러: 컴포넌트 밖에서 hook을 불렀다
 *   2. CHILD면 에러: 자식 컴포넌트는 props만 받는 순수 함수다 (requirements 제약, 명세 4번 질문 1 B)
 *      에러 메시지에 name('useState' 등)을 넣어서 어느 hook인지 보이게 한다
 *   3. index = currentRender.hookIndex++
 *   4. owner.hooks[index]가 비었으면 {}로 만든다
 *   5. { owner, slot: owner.hooks[index] }를 돌려준다
 */
function nextSlot(name) {
  const { owner } = currentRender;
  if (owner === null) {
    throw new Error(`${name}는 컴포넌트를 그리는 중에만 부를 수 있습니다`);
  }
  if (owner === CHILD) {
    throw new Error(`${name}는 루트 컴포넌트에서만 부를 수 있습니다. 자식은 props만 받습니다`);
  }
  const index = currentRender.hookIndex++;
  if (owner.hooks[index] === undefined) {
    owner.hooks[index] = {};
  }
  return { owner, slot: owner.hooks[index] };
}

/**
 * 다시 그리기를 예약한다. 바로 owner.update()를 부르지 않는다
 *   onclick: () => { setA(1); setB(2); setC(3); }  → update는 한 번만
 *
 *   1. owner.updateScheduled가 true면 끝 (이미 예약됨)
 *   2. true로 표시하고 queueMicrotask로 미룬다
 *   3. 미뤄진 일: 표시를 false로 되돌린 뒤 owner.update()
 *
 * 바로 부르면 안 되는 이유
 *   - 렌더 중(useMemo 안 등)에 setState가 불리면 update → renderVnode가 hookIndex를 0으로 돌려
 *     지금 그리던 렌더의 칸 순서가 꼬인다
 *   - setState를 세 번 부르면 렌더·diff·patch도 세 번 돈다
 * 대신 setState 직후엔 화면이 아직 안 바뀌어 있다. 테스트는 await Promise.resolve() 한 번 뒤에 본다
 */
function scheduleUpdate(owner) {
  if (owner.updateScheduled) return;
  owner.updateScheduled = true;
  queueMicrotask(() => {
    owner.updateScheduled = false;
    owner.update();
  });
}

/**
 * deps가 바뀌었나. useEffect·useMemo가 같이 쓴다
 *   oldDeps가 undefined(처음)       → true
 *   newDeps가 undefined(안 넘김)    → true  (매 렌더마다 실행)
 *   [] → []                         → false (처음 한 번만)
 *   [1, 'a'] → [1, 'b']             → true
 *   길이가 다르면                   → true
 *   칸마다 Object.is로 비교. ===와 달리 NaN끼리 같다고 본다
 */
function depsChanged(oldDeps, newDeps) {
  if (oldDeps === undefined || newDeps === undefined) return true;
  if (oldDeps.length !== newDeps.length) return true;
  return newDeps.some((dep, i) => !Object.is(dep, oldDeps[i]));
}
