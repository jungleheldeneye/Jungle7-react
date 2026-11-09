import { h } from '../../src/vdom.js';
import { useEffect, useMemo, useState } from '../../src/hooks.js';
import { createListItem, List } from '../shared/list.js';

export function TodoList({ todos, onToggle }) {
  return h(List, {
    items: todos,
    listProps: { class: 'todos' },
    renderItem: (todo) => h('li', {},
      h('span', { class: todo.done ? 'done' : '' }, `${todo.title} `),
      h('button', {
        type: 'button',
        'aria-label': `${todo.title} ${todo.done ? '완료 취소' : '완료'}`,
        onClick: () => onToggle(todo.id),
      }, todo.done ? '완료 취소' : '완료'),
    ),
  });
}

export function TodoCount({ total, doneCount }) {
  return h('p', { class: 'count' }, `${total}개 중 ${doneCount}개 완료`);
}

export function TodoApp({ initialTodos }) {
  const [todos, setTodos] = useState(initialTodos);
  const [hideCompleted, setHideCompleted] = useState(false);
  const doneCount = useMemo(() => todos.filter((todo) => todo.done).length, [todos]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Phase 2 · ${doneCount}개 완료`;
    return () => { document.title = previousTitle; };
  }, [doneCount]);

  function addTodo(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('title');
    const title = input.value.trim();
    if (!title) return;

    const todo = createListItem({ title, done: false });
    setTodos((previous) => [...previous, todo]);
    input.value = '';
  }

  function toggleTodo(id) {
    setTodos((previous) => previous.map((todo) =>
      todo.id === id ? { ...todo, done: !todo.done } : todo,
    ));
  }

  const visibleTodos = hideCompleted ? todos.filter((todo) => !todo.done) : todos;
  return h('div', { class: 'card' },
    h('h2', { class: 'title' }, '오늘 할 일'),
    h('form', { class: 'controls', onSubmit: addTodo },
      h('label', {}, '새 할 일', h('input', { type: 'text', name: 'title', required: true })),
      h('button', { type: 'submit' }, '추가'),
    ),
    h('button', { type: 'button', onClick: () => setHideCompleted((value) => !value) },
      hideCompleted ? '완료 항목 보이기' : '완료 항목 숨기기',
    ),
    h(TodoList, { todos: visibleTodos, onToggle: toggleTodo }),
    h(TodoCount, { total: todos.length, doneCount }),
    h('label', {}, '입력값 보존 확인 ', h('input', { id: 'preserved-input', type: 'text', placeholder: '안녕' })),
  );
}
