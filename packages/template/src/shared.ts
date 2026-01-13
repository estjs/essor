let isHydrationActive = false;

/**
 * Start hydration mode
 */
export function startHydration(): void {
  isHydrationActive = true;
}

/**
 * End hydration mode
 */
export function endHydration(): void {
  isHydrationActive = false;
}

/**
 * Check if hydration is currently active
 * @returns {boolean} true if hydration is active, false otherwise
 */
export function isHydrating(): boolean {
  return isHydrationActive;
}
