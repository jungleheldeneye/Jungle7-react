# 설계

## 전체 흐름

```
Phase 1: [HTML] --domToVdom--> VDOM --diff(이전, 새)--> 변경 목록 --patch--> [실제 DOM]
Phase 2: setState → 컴포넌트 다시 실행 → 새 VDOM → diff → patch
```

## 파일

| 파일 | 함수 |
| --- | --- |
| `src/vdom.js` | `h`, `domToVdom`, `vdomToDom` |
| `src/diff.js` | `diff(oldVnode, newVnode)` → 변경 목록 |
| `src/patch.js` | `patch(rootNode, patches)` |
| `src/component.js` | `FunctionComponent` (hooks, mount, update) |
| `src/hooks.js` | `useState`, `useEffect`, `useMemo` |
| `pages/phase1/` | 실제 영역 / 테스트 영역 / Patch / 뒤로·앞으로 검증 페이지 |
| `pages/demo/` | 미니 React로 만든 테스트 페이지 |

## 합의할 것 (TODO)

- [ ] VDOM 노드 모양: `{ type, props, children }`
- [ ] 텍스트 노드 표현: 문자열 vs `{ type: '#text', value }`
- [ ] 공백만 있는 텍스트 노드, 주석: 버릴지
- [ ] key 위치: props 안 vs 별도 필드
- [ ] 변경 목록 형식: `{ type: 'CREATE' | 'REMOVE' | 'REPLACE' | 'PROPS' | 'TEXT', path, ... }`
- [ ] 사라진 속성 표시 방법 (예: `null`)
- [ ] Patch 방식: 대상 노드를 먼저 다 찾고 적용 (인덱스 밀림 방지)
- [ ] 이벤트(`onClick` 등 함수 props), `value`/`checked`는 property로 설정
- [ ] hooks 배열과 hook 순번 관리 방식
