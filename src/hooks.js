let activeRender = null;

export function renderWithHooks(instance, render) {
  const previousRender = activeRender;
  const context = { instance, hooks: [], effects: [] };
  activeRender = context;

  try {
    const vnode = render();
    if (instance.vnode !== undefined && context.hooks.length !== instance.hooks.length) {
      throw new Error('Hook 호출 개수는 렌더마다 같아야 합니다.');
    }
    return { vnode, hooks: context.hooks, effects: context.effects };
  } finally {
    activeRender = previousRender;
  }
}

export function renderWithoutHooks(render) {
  const previousRender = activeRender;
  activeRender = null;
  try {
    return render();
  } finally {
    activeRender = previousRender;
  }
}

function getSlot(type) {
  if (!activeRender) throw new Error('Hook은 루트 컴포넌트의 렌더 중에만 호출할 수 있습니다.');

  const { instance, hooks } = activeRender;
  const index = hooks.length;
  const previous = instance.hooks[index];
  if (previous && previous.type !== type) {
    throw new Error('Hook 호출 순서는 렌더마다 같아야 합니다.');
  }
  return { instance, hooks, index, previous };
}

function sameDeps(previous, next) {
  return previous !== undefined && next !== undefined &&
    previous.length === next.length && next.every((value, index) => Object.is(value, previous[index]));
}

export function useState(initialValue) {
  const { instance, hooks, index, previous } = getSlot('state');
  const slot = previous ?? {
    type: 'state',
    value: typeof initialValue === 'function' ? initialValue() : initialValue,
    setState(nextValue) {
      if (activeRender?.instance === instance) {
        throw new Error('렌더 중에는 상태를 변경할 수 없습니다.');
      }
      if (instance.hooks[index] !== slot) return;
      const next = typeof nextValue === 'function' ? nextValue(slot.value) : nextValue;
      if (Object.is(slot.value, next)) return;
      slot.value = next;
      instance.update();
    },
  };
  hooks.push(slot);
  return [slot.value, slot.setState];
}

export function useEffect(effect, deps) {
  const { hooks, previous } = getSlot('effect');
  if (previous && sameDeps(previous.deps, deps)) {
    hooks.push(previous);
    return;
  }

  const slot = { type: 'effect', deps: deps?.slice(), cleanup: undefined };
  hooks.push(slot);
  activeRender.effects.push(() => {
    previous?.cleanup?.();
    const cleanup = effect();
    if (typeof cleanup === 'function') slot.cleanup = cleanup;
  });
}

export function useMemo(factory, deps) {
  const { hooks, previous } = getSlot('memo');
  const slot = previous && sameDeps(previous.deps, deps)
    ? previous
    : { type: 'memo', deps: deps?.slice(), value: factory() };
  hooks.push(slot);
  return slot.value;
}
