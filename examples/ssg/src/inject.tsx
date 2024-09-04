import { useInject } from 'essor';
import { ProvideKey } from './main';

export default function InjectComponent() {
  const injectVlaue = useInject(ProvideKey, { count: -1 })!;
  return <div>{injectVlaue.count}</div>;
}
