/**
 * 글자 검사 (R5, R7). 앱 코드를 글자로 읽어서 hook·컴포넌트 규칙 위반을 찾는다
 * 실행하지 않고 글자만 보기 때문에 빠르지만, 변수에 담긴 값은 따라가지 못한다
 *
 *   lint("const item = TodoItem({ todo });")
 *   → [{ line: 1, rule: 'direct-call', message: 'TodoItem(...)처럼 컴포넌트를 직접 불렀습니다. h(TodoItem, props)로 넣으세요' }]
 *
 * 규칙 3가지
 *   direct-call  대문자로 시작하는 함수를 직접 부름: TodoItem({...}) (R5)
 *                new X(...), function X(...) 정의, 브라우저 내장(String(n), Array.from…)은 뺀다
 *   inline-deps  useMemo·useEffect의 deps [ ] 안에 바로 { } · [ ] · .filter( · .map( 가 있음 (R7)
 *                렌더마다 새로 만들어져서 Object.is 비교가 항상 "바뀜"이 된다
 *                const o = {n}; [o]처럼 변수에 담으면 못 잡는다 (글자 검사의 구멍)
 *
 *   missing-key  .map( 안에서 만드는 h(...)에 key가 없음 (R8)
 *                우리 React는 key를 대신 정해 주지 않는다. 항목을 만들 때 넣은 id를 key로 달아야 한다
 *                h('li', null, …) · h('li') · h(TodoItem, { todo })처럼 props가 비었거나 { } 안에 key가 없으면 실패
 *                props가 변수·함수 결과·...펼치기면 안을 볼 수 없어서 못 잡는다. .map(renderItem)처럼 함수를 넘겨도 못 잡는다
 *
 * 줄 끝에 // allow-direct-call 이 있으면 그 줄은 모든 규칙을 건너뛴다
 */
const ALLOW = '// allow-direct-call';
const HOOKS_WITH_DEPS = /\b(useMemo|useEffect)\s*\(/g;
const CAPITAL_CALL = /(^|[^.\w$])([A-Z][\w$]*)\s*\(/g;
const MAP_CALL = /\.map\s*\(/g;
const H_CALL = /(^|[^.\w$])h\s*\(/;

export function lint(source) {
  const problems = [...directCalls(source), ...inlineDeps(source), ...missingKeys(source)];
  return problems.sort((a, b) => a.line - b.line);
}

/**
 * .map( 콜백이 만드는 첫 h(...)에 key가 있나
 *   todos.map((t) => h('li', null, t.text))            → 실패
 *   todos.map((t) => h('li', { key: t.id }, t.text))   → 통과
 *   todos.map((t) => h('li', null, h('span', { key }))) → 실패 (key는 목록에 바로 놓이는 li에 있어야 한다)
 */
function missingKeys(source) {
  const code = stripStringsAndComments(source);
  const lines = source.split('\n');
  const problems = [];
  for (const match of code.matchAll(MAP_CALL)) {
    const open = match.index + match[0].length - 1;          // .map( 의 ( 자리
    const callback = splitTopLevel(code, open + 1, ')').items[0];
    const found = H_CALL.exec(callback);
    if (!found) continue;                                     // h를 안 만드는 map: todos.map((t) => t.id)
    const hOpen = open + 1 + found.index + found[0].length - 1;
    const props = (splitTopLevel(code, hOpen + 1, ')').items[1] ?? '').trim();

    let missing;
    if (props === '' || props === 'null' || props === 'undefined') {
      missing = true;
    } else if (props.startsWith('{') && props.endsWith('}')) {
      const entries = splitTopLevel(props, 1, '}').items.map((e) => e.trim()).filter(Boolean);
      if (entries.some((e) => e.startsWith('...'))) continue;  // 펼친 값 안에 key가 있을 수 있다: 못 본다
      missing = !entries.some((e) => /^key\s*(:|$)/.test(e));   // key: t.id 또는 { key }
    } else {
      continue;                                               // props가 변수·함수 결과: 못 본다
    }
    if (!missing) continue;

    const firstLine = lineOf(code, match.index);
    const line = lineOf(code, hOpen);
    if (lines.slice(firstLine - 1, line).some((text) => text.includes(ALLOW))) continue;
    problems.push({
      line,
      rule: 'missing-key',
      message: '.map( 안에서 만드는 h(...)에 key가 없습니다. 항목을 만들 때 넣은 id를 { key: item.id }로 다세요',
    });
  }
  return problems;
}

/** TodoItem({...})처럼 대문자 함수를 직접 부른 곳 */
function directCalls(source) {
  const problems = [];
  const lines = source.split('\n');
  // 통째로 지운 뒤 줄로 나눈다. 줄마다 지우면 여러 줄 /* */ 주석 안의 App()을 코드로 본다
  stripStringsAndComments(source).split('\n').forEach((code, i) => {
    if (lines[i].includes(ALLOW)) return;
    for (const match of code.matchAll(CAPITAL_CALL)) {
      const name = match[2];
      const before = code.slice(0, match.index + match[1].length);
      if (/\b(new|function|class)\s+$/.test(before)) continue;   // new Map(), function TodoItem(
      if (name in globalThis) continue;                          // String(n), Number(x), Promise(...)
      problems.push({
        line: i + 1,
        rule: 'direct-call',
        message: `${name}(...)처럼 컴포넌트를 직접 불렀습니다. h(${name}, props)로 넣으세요`,
      });
    }
  });
  return problems;
}

/** useMemo·useEffect의 deps 배열 안에 바로 새 객체·배열을 만드는 곳 */
function inlineDeps(source) {
  const code = stripStringsAndComments(source);
  const lines = source.split('\n');
  const problems = [];
  for (const match of code.matchAll(HOOKS_WITH_DEPS)) {
    const open = match.index + match[0].length - 1;          // useMemo( 의 ( 자리
    const args = splitTopLevel(code, open + 1, ')');
    if (args.items.length < 2) continue;                      // deps를 안 넘김
    const deps = args.items.at(-1).trim();
    if (!deps.startsWith('[') || !deps.endsWith(']')) continue;   // deps가 변수 하나: 못 본다

    const line = lineOf(code, match.index);
    const lastLine = lineOf(code, args.end);
    const spanned = lines.slice(line - 1, lastLine);
    if (spanned.some((text) => text.includes(ALLOW))) continue;

    const elements = splitTopLevel(deps, 1, ']').items.map((e) => e.trim()).filter(Boolean);
    const bad = elements.find((e) => e.startsWith('{') || e.startsWith('[') || /\.(filter|map)\s*\(/.test(e));
    if (bad !== undefined) {
      problems.push({
        line,
        rule: 'inline-deps',
        message: `${match[1]}의 deps에 렌더마다 새로 만드는 값이 있습니다: ${bad}. 매번 "바뀜"으로 보여서 매번 다시 실행됩니다`,
      });
    }
  }
  return problems;
}

// ─── 여기부터는 위 흐름이 쓰는 작은 도우미들 ───

/**
 * from부터 읽으며 괄호 깊이 0인 쉼표로 나눈다. 깊이 0에서 close를 만나면 끝
 *   'a, [b, c], { d })' → items ['a', ' [b, c]', ' { d }'], end: ) 자리
 */
function splitTopLevel(text, from, close) {
  const items = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (depth === 0 && ch === close) {
      items.push(text.slice(start, i));
      return { items, end: i };
    } else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  items.push(text.slice(start));
  return { items, end: text.length };
}

/**
 * 문자열 안의 글자와 주석을 공백으로 바꾼다. 줄 번호·위치는 그대로 남는다
 *   "h('p', null, 'Item(1)') // TodoItem()" → "h(' ', null, '       ')              "
 * 문자열 안의 괄호나 대문자 이름을 코드로 착각하지 않게 하려는 것. 템플릿의 ${}까지 따라가지는 않는다
 */
function stripStringsAndComments(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { out += '  '; i += 1; continue; }
      if (ch === quote) { quote = null; out += ch; continue; }
      out += ch === '\n' ? '\n' : ' ';
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i += 1; }
      if (i < text.length) out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : ' '; i += 1; }
      out += '  ';
      i += 1;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      out += ch;
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}
