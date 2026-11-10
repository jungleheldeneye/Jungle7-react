/**
 * VDOM을 들여쓴 글자로 그린다. Phase 1·Phase 2 탭이 같이 쓴다
 *   changes: path('0.1') → 그 노드에 온 변경 목록. 고치기 전 트리에만 넘겨서 강조한다
 *
 * Phase 2의 "expand 전" VDOM에는 type이 함수인 컴포넌트 메모가 있어서 <TodoItem key=1 /> 로 보여 준다
 * 함수 props(onclick)는 ƒ로, 객체 props(todo)는 JSON으로 적는다
 */
export function renderVdomTree(output, vnode, changes = new Map(), emptyText = '바깥 태그 하나로 감싸면 VDOM을 볼 수 있어요.') {
  if (!vnode) {
    output.textContent = emptyText;
    return;
  }

  const tree = document.createDocumentFragment();

  function append(text, highlight = false, className = '') {
    if (highlight || className) {
      const mark = document.createElement(highlight ? 'mark' : 'span');
      if (className) mark.className = className;
      mark.textContent = text;
      tree.append(mark);
    } else {
      tree.append(text);
    }
  }

  function visit(node, path) {
    const types = (changes.get(path.join('.')) ?? []).map((change) => change.type);
    const propsChange = changes.get(path.join('.'))?.find((change) => change.type === 'PROPS');
    // 노드 자체가 지워지거나 바뀌거나 옮겨지면 태그를 강조. PROPS는 속성만, CREATE는 "이 안에 추가"라 태그는 그대로
    const nodeChanged = types.some((type) => type === 'REMOVE' || type === 'REPLACE' || type === 'MOVE');
    const isComponent = typeof node.type === 'function';
    const isLeaf = node.type === '#text' || node.type === '#comment';
    const indent = '  '.repeat(path.length);
    append(indent);

    // 글자·주석은 { type: '#text' | '#comment', props: { nodeValue } } 모양 (6-2). 글자 변경은 PROPS로 온다
    if (node.type === '#text') {
      append(JSON.stringify(node.props.nodeValue), types.length > 0);
    } else if (node.type === '#comment') {
      append(`<!--${node.props.nodeValue}-->`, types.length > 0);
    } else {
      const name = isComponent ? node.type.name : node.type;
      append(`<${name}`, nodeChanged, isComponent ? 'component-tag' : '');
      // Phase 1은 data-key 속성이 곧 key라 따로 적지 않는다
      if (node.key !== undefined && node.props['data-key'] !== node.key) {
        append(` key=${JSON.stringify(node.key)}`, false, 'key-attr');
      }
      for (const [prop, value] of Object.entries(node.props)) {
        append(` ${prop}=${formatValue(value)}`, Boolean(propsChange && Object.hasOwn(propsChange.props, prop)));
      }
      append(isComponent && node.children.length === 0 ? ' />' : '>');
    }

    if (types.length > 0) append(` [${types.join(', ')}]`, true);
    append('\n');

    if (!isLeaf && !(isComponent && node.children.length === 0)) {
      node.children.forEach((child, index) => visit(child, [...path, index]));
      append(`${indent}</${isComponent ? node.type.name : node.type}>\n`);
    }
  }

  visit(vnode, []);
  output.replaceChildren(tree);
}

function formatValue(value) {
  if (typeof value === 'function') return 'ƒ';
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}
