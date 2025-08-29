export interface ReactiveNode {
  // dependency link head
  depLink?: Link;
  // subscriber link head
  subLink?: Link;

  // dependency link tail,fastest way to get the last link
  depTail?: Link;
  // subscriber link tail,fastest way to get the last link
  subTail?: Link;

  // flag
  flag: ReactiveFlags;
}

export interface Link {
  depNode: ReactiveNode | Computed | Effect;
  subNode: ReactiveNode | Computed | Effect;

  prevSubLink?: Link;
  nextSubLink?: Link;

  prevDepLink?: Link;
  nextDepLink?: Link;
}

/**
 * Reactive flags
 */
export enum ReactiveFlags {
  NONE = 0, // no state
  MUTABLE = 1, // mutable state,can be changed,link: computed
  WATCHING = 1 << 1, // watching state, is active effect
  RECURSED_CHECK = 1 << 2, // in recursive check process, check loop
  RECURSED = 1 << 3, // nark looped
  DIRTY = 1 << 4, // dirty state, need to be re-evaluated
  PENDING = 1 << 5, // pending state, need to be processed,check is dirty
}

/**
 * link  reactive nodes
 * @param depNode dependency node
 * @param subNode subscriber node
 */
export function linkReactiveNode(depNode: ReactiveNode, subNode: ReactiveNode) {
  const preDepTail = subNode.depTail;

  // check if the dependency node is already linked to the subscriber node
  if (preDepTail && preDepTail.depNode === depNode) {
    return;
  }

  let nextDepLink: Link | undefined;

  // check if the subscriber node is in the recursive check process
  if (subNode.flag & ReactiveFlags.RECURSED_CHECK) {
    nextDepLink = preDepTail ? preDepTail?.nextDepLink : subNode.depLink;

    // check if the dependency node is already linked to the subscriber node
    if (nextDepLink && nextDepLink.depNode === depNode) {
      // update the dependency node tail
      subNode.depTail = nextDepLink;
      return;
    }
  }
}
