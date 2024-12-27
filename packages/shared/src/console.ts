export function warn(msg: string, ..._args: any[]): void;
export function warn(msg: string, ...args): void {
  // eslint-disable-next-line prefer-spread
  console.warn.apply(console, [`[aube warn]: ${msg}`].concat(args) as [string, ...any[]]);
}

export function info(msg: string, ..._args: any[]): void;
export function info(msg: string, ...args): void {
  // eslint-disable-next-line prefer-spread, no-console
  console.info.apply(console, [`[aube info]: ${msg}`].concat(args) as [string, ...any[]]);
}

export function error(msg: string, ..._args: any[]): void;
export function error(msg: string, ...args): void {
  // eslint-disable-next-line prefer-spread
  console.error.apply(console, [`[aube error]: ${msg}`].concat(args) as [string, ...any[]]);
}
