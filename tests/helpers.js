/**
 * 테스트 도우미. src는 고치지 않고 바깥에서 관찰만 한다
 *   - 렌더 횟수: 테스트용 App 안에서 카운터를 올린다
 *   - 실제 DOM 조작 수: MutationObserver 기록 수 (Phase 1 페이지와 같은 방식)
 *   - diff 결과: diff()를 직접 불러 변경 목록의 길이·종류를 본다
 */

/** setState 뒤 다시 그리기는 microtask로 미뤄진다 (src/hooks.js scheduleUpdate). 한 번 기다리면 된다 */
export const flush = () => Promise.resolve();

/** 이어지는 microtask가 전부 끝날 때까지 기다린다 (T17·T18처럼 effect가 다시 그리기를 부르는 경우) */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 테스트마다 새 container. 화면 밖 #sandbox 안에 붙인다 */
export function sandbox() {
  const el = document.createElement('div');
  document.getElementById('sandbox').appendChild(el);
  return el;
}

/** target 아래의 실제 DOM 조작을 센다. stop()이 요약을 돌려준다 */
export function watchDom(target) {
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(target, { childList: true, attributes: true, characterData: true, subtree: true });
  return {
    stop() {
      records.push(...observer.takeRecords());
      observer.disconnect();
      return {
        total: records.length,
        added: records.reduce((n, r) => n + r.addedNodes.length, 0),
        removed: records.reduce((n, r) => n + r.removedNodes.length, 0),
        attributes: records.filter((r) => r.type === 'attributes').length,
        text: records.filter((r) => r.type === 'characterData').length,
      };
    },
  };
}

export function describeOps(ops) {
  return `실제 DOM 조작 ${ops.total}번 (추가 ${ops.added} · 삭제 ${ops.removed} · 속성 ${ops.attributes} · 텍스트 ${ops.text})`;
}

export function describePatches(patches) {
  const counts = {};
  patches.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });
  const parts = Object.entries(counts).map(([type, n]) => `${type} ${n}`);
  return `diff 변경 ${patches.length}개${parts.length ? ` (${parts.join(' · ')})` : ''}`;
}

/** 변경 하나를 짧은 글자로: PROPS [0] {nodeValue:"나"} */
export function patchToText(p) {
  const extra = p.type === 'PROPS'
    ? ` {${Object.entries(p.props).map(([k, v]) => `${k}:${typeof v === 'function' ? 'ƒ' : JSON.stringify(v)}`).join(', ')}}`
    : p.before !== undefined ? ` before ${p.before}` : '';
  return `${p.type} [${p.path.join(',')}]${extra}`;
}

export function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
