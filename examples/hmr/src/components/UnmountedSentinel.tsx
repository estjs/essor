export const UNMOUNTED_SENTINEL = '';

export function UnmountedSentinel() {
  return <span data-test="hmr-unmounted-sentinel">{UNMOUNTED_SENTINEL}</span>;
}
