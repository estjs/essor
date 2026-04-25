/**
 * Outputs a warning level log message.
 *
 * @param msg - The warning message.
 * @param args - Additional arguments to log.
 * @returns {void}
 */
export function warn(msg: string, ...args: unknown[]): void {
  console.warn(`[Essor warn]: ${msg}`, ...args);
}

/**
 * Outputs an info level log message.
 *
 * @param msg - The info message.
 * @param args - Additional arguments to log.
 * @returns {void}
 */
export function info(msg: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info(`[Essor info]: ${msg}`, ...args);
}

/**
 * Outputs an error level log message.
 *
 * @param msg - The error message.
 * @param args - Additional arguments to log.
 * @returns {void}
 */
export function error(msg: string, ...args: unknown[]): void {
  console.error(`[Essor error]: ${msg}`, ...args);
}
