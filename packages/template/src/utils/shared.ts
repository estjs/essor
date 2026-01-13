/** Whether hydration is currently active */
let isHydrationActive = false;

/**
 * Start hydration mode
 * Called when beginning client-side hydration of server-rendered content
 */
export function startHydration(): void {
  isHydrationActive = true;
}

/**
 * End hydration mode
 * Called when hydration is complete
 */
export function endHydration(): void {
  isHydrationActive = false;
}

/**
 * Check if hydration is currently active
 * @returns true if hydration is in progress
 */
export function isHydrating(): boolean {
  return isHydrationActive;
}
