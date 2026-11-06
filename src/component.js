/**
 * 함수형 컴포넌트를 감싸는 클래스
 * - hooks: 상태 저장용 배열
 * - mount(container): 처음 렌더링
 * - update(): 상태 변경 후 다시 렌더링 (VDOM 생성 → diff → patch)
 */
export class FunctionComponent {
  constructor(component, props = {}) {
    this.component = component;
    this.props = props;
    this.hooks = [];
  }

  mount(container) {
    throw new Error('not implemented');
  }

  update() {
    throw new Error('not implemented');
  }
}
