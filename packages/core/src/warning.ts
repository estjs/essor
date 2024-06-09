export function warn(msg: string, ..._args: any[]): void;
export function warn(msg: string, ...args): void {
  // eslint-disable-next-line prefer-spread
  console.warn.apply(console, [`[Essor warn]: ${msg}`].concat(args) as [string, ...any[]]);
}
