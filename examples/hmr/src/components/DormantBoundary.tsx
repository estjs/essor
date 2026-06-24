export const DORMANT_BOUNDARY_LABEL = 'dormant';

export function DormantBoundary() {
  return <span data-test="hmr-dormant-boundary">{DORMANT_BOUNDARY_LABEL}</span>;
}
