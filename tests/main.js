/**
 * 테스트 표를 그리고 행마다 하나씩 돌린다
 * 상태: 통과 / 실패 / 보류 / 미구현 / 수동
 */
import { cases } from './cases.js';
import { mountManual } from './manual.js';
import { errorText } from './helpers.js';

const tbody = document.querySelector('#results tbody');
const tsv = document.getElementById('tsv');
const summary = document.getElementById('summary');

const COLUMNS = ['ID', 'R-ID', '시나리오', '기대값', '상태', '관찰값'];

async function runCase(c) {
  if (c.status) {
    let observed = c.note;
    if (c.auto) {
      try {
        observed += ` / ${await c.auto()}`;
      } catch (error) {
        observed += ` / 자동 흉내 중 에러: ${errorText(error)}`;
      }
    }
    return { status: c.status, observed };
  }
  try {
    const { pass, observed } = await c.run();
    return { status: pass ? '통과' : '실패', observed };
  } catch (error) {
    return { status: '실패', observed: `테스트 중 에러: ${errorText(error)}` };
  }
}

function addRow(c, result) {
  const tr = document.createElement('tr');
  [c.id, c.rid, c.scenario, c.expected, result.status, result.observed].forEach((value, i) => {
    const td = document.createElement('td');
    td.textContent = value;
    if (i === 4) td.className = `status s-${result.status}`;
    if (i === 5) td.className = 'observed';
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}

/** 스프레드시트에 붙여 넣기 좋게: 칸 안의 탭·줄바꿈은 공백으로 */
const cell = (value) => String(value).replace(/[\t\r\n]+/g, ' ');

async function runAll() {
  tbody.replaceChildren();
  document.getElementById('sandbox').replaceChildren();
  const rows = [];
  for (const c of cases) {
    const result = await runCase(c);   // 하나씩 차례로 (앞 테스트의 microtask가 뒤와 섞이지 않게)
    addRow(c, result);
    rows.push([c.id, c.rid, c.scenario, c.expected, result.status, result.observed]);
  }
  tsv.value = [COLUMNS, ...rows].map((r) => r.map(cell).join('\t')).join('\n');

  const counts = {};
  rows.forEach((r) => { counts[r[4]] = (counts[r[4]] || 0) + 1; });
  summary.textContent = ['통과', '실패', '보류', '미구현', '수동']
    .map((s) => `${s} ${counts[s] || 0}`).join(' · ');
}

document.getElementById('rerun').onclick = runAll;
document.getElementById('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(tsv.value);
  } catch {
    tsv.select();
    document.execCommand('copy');
  }
  document.getElementById('copy').textContent = '복사됨';
  setTimeout(() => { document.getElementById('copy').textContent = '복사'; }, 1200);
};
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.onclick = () => navigator.clipboard.writeText(document.getElementById(button.dataset.copy).value);
});

mountManual();
runAll();
