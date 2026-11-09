import { h } from '../../src/vdom.js';

// 항목을 만들 때 발급한 ID를 데이터와 함께 보관한다.
export function createListItem(item) {
  return { ...item, id: item.id ?? globalThis.crypto.randomUUID() };
}

export function List({ items, renderItem, getKey = (item) => item.id, listProps = {} }) {
  const children = items.map((item) => {
    const key = getKey(item);
    if (key == null) {
      throw new Error('List 항목의 id 또는 getKey 결과를 확인해 주세요.');
    }
    return h(() => renderItem(item), { key });
  });
  return h('ul', listProps, children);
}
