# 미니 React

## 명세
- 무엇을 만드는지는 `docs/design.md`를 따른다. 명세에 없는 기능은 만들지 않는다
- 모든 코드는 요구사항 R1~R9 중 하나 때문에 존재해야 한다. R-ID를 댈 수 없으면 넣지 않고 먼저 물어본다
- 명세 6번 "각자 정하고 기록할 것"을 정할 때는 혼자 정하지 말고 후보와 대가를 보여주고 물어본다. 정한 것은 `docs/design.md` 6-3 "그 외 결정 기록"에 한 줄로 남긴다 (VDOM 모양은 6-2, 결정 기준은 6-1)

## 작업 방식
- 한 번에 한 조각만 구현한다 (조각 1: `h`, `domToVdom`, `vdomToDom`)
- 테스트는 사람이 정한다. `tests/` 안의 파일은 수정하지 않는다. 테스트가 틀렸다고 생각되면 고치지 말고 이유를 말한다
- 구현 후 테스트를 돌려 결과를 보여준다
- 설명은 쉬운 말로, 구체적인 예시부터

## 커밋
- 커밋 메시지와 PR 설명에 `Co-Authored-By: Claude ...`, "Generated with Claude Code" 같은 AI 작성자 표시를 넣지 않는다 (GitHub 컨트리뷰터에 Claude가 뜨지 않게)

## 구조
- `src/`: vdom.js, diff.js, patch.js, component.js, hooks.js
- `tests/`: 테스트
- `pages/phase1/`: 실제 DOM 조작 확인 페이지