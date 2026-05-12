export const UNMOUNTED_SENTINEL = 'idle';

(globalThis as { __essorHmrSentinelVersion?: string }).__essorHmrSentinelVersion =
  UNMOUNTED_SENTINEL;

export function UnmountedSentinel() {
  return <span data-test="hmr-unmounted-sentinel">{UNMOUNTED_SENTINEL}</span>;
}
