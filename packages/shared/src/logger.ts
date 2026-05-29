export function warn(msg: string, ...args: unknown[]): void {
  console.warn(`[Essor warn]: ${msg}`, ...args);
}

export function info(msg: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info(`[Essor info]: ${msg}`, ...args);
}

export function error(msg: string, ...args: unknown[]): void {
  console.error(`[Essor error]: ${msg}`, ...args);
}
