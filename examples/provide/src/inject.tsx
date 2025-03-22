import { inject } from '@estjs/core';
import { ProvideKey } from './main';

export default function InjectComponent() {
  const injectValue = inject(ProvideKey, { count: -1 })!;
  return <div>{injectValue.count}</div>;
}
