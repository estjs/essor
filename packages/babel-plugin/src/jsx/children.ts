/**
 * @file JSX children processing utilities
 */

import { isArray } from '@estjs/shared';
import { types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import type { State } from '../types';

/**
 * Generate child node mappings and indices
 * @param props Properties object
 * @returns Object containing child node mapping and indices
 */
export function generateChildrenMaps(props: Record<string, any>): {
  childrenIndexMap: Array<{
    index: number;
    key: string;
    children?: Array<{
      node: t.Expression;
      before?: boolean;
      index?: number;
    }>;
    [key: string]: any;
  }>;
  idxs: string[];
} {
  let idx = 0;
  const childrenIndexMap = Object.keys(props).reduce<any>((pre, cur) => {
    const item = props[cur];
    const val = {
      ...item,
      key: cur,
      index: idx++,
      children: (item.children || []).map(itx => {
        if (itx.before) {
          itx.index = idx++;
        }
        return itx;
      }),
    };
    pre.push(val);
    return pre;
  }, []);

  const idxs = childrenIndexMap.flatMap(item => {
    return [item.key, ...item.children.map(item => item.before)].filter(Boolean);
  });

  return {
    childrenIndexMap,
    idxs,
  };
}

/**
 * Process child nodes within the JSX transformation
 * @param childrenMap Child node mapping
 * @param nodes Node identifier
 * @param body Statement body
 * @param state Babel state
 */
export function processChildren(
  childrenMap: Array<{
    index: number;
    key: string;
    children?: Array<{
      node: t.Expression;
      before?: boolean;
      index?: number;
    }>;
    [key: string]: any;
  }>,
  nodes: t.Identifier,
  body: t.Statement[],
  state: State,
): void {
  childrenMap.forEach(item => {
    const index = item.index;
    Object.entries(item).forEach(([key, value]) => {
      if (!value || key === 'index' || key === 'key') {
        return;
      }

      if (key === 'children') {
        handleChildNodes(value, index, nodes, body, state);
      } else {
        handleAttributeProcessing(key, value, index, nodes, body, state);
      }
    });
  });
}

/**
 * Handle child nodes during transformation
 * @param value Child nodes
 * @param index Parent index
 * @param nodes Node identifier
 * @param body Statement body
 * @param state Babel state
 */
export function handleChildNodes(
  value: any,
  index: number,
  nodes: t.Identifier,
  body: t.Statement[],
  state: State,
): void {
  addImport(importObject.insert);

  if (isArray(value)) {
    value.forEach(child => {
      const insertArgs = [
        t.memberExpression(nodes, t.numericLiteral(index), true),
        t.arrowFunctionExpression([], child.node),
      ];

      if (child.before) {
        insertArgs.push(t.memberExpression(nodes, t.numericLiteral(+child.index!), true));
      }

      body.push(t.expressionStatement(t.callExpression(state.imports.insert, insertArgs)));
    });
  } else {
    body.push(
      t.expressionStatement(
        t.callExpression(state.imports.insert, [
          t.memberExpression(nodes, t.numericLiteral(index), true),
          value as t.Expression,
        ]),
      ),
    );
  }
}

/**
 * Process attributes during child node transformation
 * @param key Attribute key
 * @param value Attribute value
 * @param index Node index
 * @param nodes Node identifier
 * @param body Statement body
 * @param state Babel state
 */
export function handleAttributeProcessing(
  key: string,
  value: any,
  index: number,
  nodes: t.Identifier,
  body: t.Statement[],
  state: State,
): void {
  const attributeHandlers: Record<string, (value: any) => void> = {
    class: value => {
      addImport(importObject.setClass);
      body.push(createAttributeStatement(state.imports.setClass, nodes, index, value));
    },
    style: value => {
      addImport(importObject.setStyle);
      body.push(createAttributeStatement(state.imports.setStyle, nodes, index, value));
    },
    default: value => {
      addImport(importObject.setAttr);
      body.push(
        createAttributeStatement(state.imports.setAttr, nodes, index, value, t.stringLiteral(key)),
      );
    },
  };

  if (key.startsWith('on')) {
    addImport(importObject.addEventListener);
    body.push(
      createAttributeStatement(
        state.imports.addEventListener,
        nodes,
        index,
        value,
        t.stringLiteral(key.slice(2).toLowerCase()),
      ),
    );
    return;
  }

  const handler = attributeHandlers[key] || attributeHandlers.default;
  handler(value);
}

/**
 * Create attribute setting statement
 * @param method Method identifier
 * @param nodes Node identifier
 * @param index Node index
 * @param value Attribute value
 * @param additionalArg Optional additional argument
 * @returns Expression statement
 */
export function createAttributeStatement(
  method: t.Identifier,
  nodes: t.Identifier,
  index: number,
  value: any,
  additionalArg?: t.Expression,
): t.ExpressionStatement {
  const args = [
    t.memberExpression(nodes, t.numericLiteral(index), true),
    ...(additionalArg ? [additionalArg] : []),
    value as t.Expression,
  ];

  return t.expressionStatement(t.callExpression(method, args));
}
