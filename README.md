# Jungle7 Mini React

Virtual DOM, Diff, Patch와 함수형 컴포넌트, Hooks(useState / useEffect / useMemo)를 Vanilla JS로 직접 구현합니다.

## 구조

```
docs/     요구사항, 설계 (합의 후 수정)
tests/    공통 테스트
src/      미니 React 본체 (vdom, diff, patch, component, hooks)
pages/
  phase1/ Phase 1 검증 페이지
  demo/   미니 React로 만든 테스트 페이지
```

## 실행

ES 모듈을 쓰므로 로컬 서버로 엽니다.

```bash
npx serve .
# → http://localhost:3000/pages/phase1/
```

## 작업 규칙

- 각자 `이름/impl` 브랜치에서 작업
- `src/`의 파일명과 함수명은 바꾸지 않기 (같은 테스트로 비교하기 위해)
- `docs/`, `tests/` 수정은 팀 합의 후
