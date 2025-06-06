import { insert } from '../binding';
import { createContext, withContext } from '../context';
/**
 * Fragment 组件的类型定义
 */
export interface FragmentProps {
  children: JSX.Element | JSX.Element[] | (() => JSX.Element | JSX.Element[]) | null;
}

/**
 * Fragment 组件 - 用于包裹多个子元素而不创建额外的 DOM 节点
 * 优化性能，支持响应式更新
 */
export function Fragment(props: FragmentProps): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const context = createContext();
  withContext(context, () => {
    insert(fragment, () => props.children);
  });

  return fragment;
}

/**
 * 判断是否为 Fragment 节点
 */
export function isFragment(node: unknown): boolean {
  return node instanceof DocumentFragment;
}
