import { inject } from 'essor';
import { type InjectionKey, provide, reactive } from 'essor';

const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');

function InjectComponent() {
  const injectValue = inject(ProvideKey, { count: -1 })!;
  return <div>{injectValue.count}</div>;
}
export function SignalProvider() {
  const value = reactive({ count: 0 });
  provide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent />;
}
