export const UNMOUNTED_SENTINEL = 'idle';

export function UnmountedSentinel() {
  return <span data-test="hmr-unmounted-sentinel">{UNMOUNTED_SENTINEL}</span>;
}
