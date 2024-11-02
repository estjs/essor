import { removeChild } from './utils';
import { TemplateNode } from './templateNode';

export class FragmentNode extends TemplateNode {
  unmount(): void {
    this.trackMap.forEach(track => {
      // clear track node
      if (track.lastNodes) {
        track.lastNodes.forEach(node => {
          removeChild(node);
        });
      }
      track.cleanup && track.cleanup();
    });

    this.trackMap.clear();
    this.treeMap.clear();

    this.nodes.forEach(node => {
      removeChild(node);
    });

    this.nodes = [];
    this.mounted = false;
  }
}
