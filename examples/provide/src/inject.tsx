import { inject } from 'essor';
import { ProvideKey } from './main';

export default function InjectComponent() {
  const injectValue = inject(ProvideKey, { count: -1 })!;
  return <div>{injectValue.count}</div>;
}
