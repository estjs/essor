import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { createDefaultTree, createTree, isTreeNode } from '../src/jsx/tree';

describe('jSX tree creation', () => {
  it('creates default tree skeleton', () => {
    const tree = createDefaultTree();
    expect(tree.root).toBe(true);
    expect(tree.children).toEqual([]);
    expect(tree.type).toBeDefined();
  });

  it('converts JSX to rich tree nodes with indices', () => {
    const ast = parse(
      `
      const view = (
        <section>
          <h1>Title</h1>
          <span>{value}</span>
        </section>
      );
    `,
      { sourceType: 'module', plugins: ['jsx'] },
    );

    let jsxPath: any;
    traverse(ast, {
      JSXElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    const tree = createTree(jsxPath);
    expect(isTreeNode(tree)).toBe(true);
    expect(tree.children).toHaveLength(2);
    const [heading, spanNode] = tree.children as any[];
    expect(heading.tag).toBe('h1');
    expect(spanNode.children[0].type).toBeDefined();
  });
});
