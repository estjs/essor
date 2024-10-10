export const sharedConfig = {
  currentIndex: 0,
  parentIndexStack: [],
  level: 0,
  componentMap: new Map(),
};

export function enterComponent(temp, index) {
  sharedConfig.componentMap.set(temp, {
    index,
  });
}

export function getComponentIndex(temp) {
  return sharedConfig.componentMap.get(temp).index;
}
