export function warn(msg: string, ..._args: any[]): void;
export function warn(msg: string, ...args): void {
  // eslint-disable-next-line prefer-spread
  console.warn.apply(console, [`[Essor Router warn]: ${msg}`].concat(args) as [string, ...any[]]);
}
