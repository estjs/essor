import { capitalize, isArray } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import type { State } from '../types';
import type {
  Expression,
  Identifier,
  ObjectProperty,
  SpreadElement,
  StringLiteral,
} from '@babel/types';

/**
 * Process child nodes
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
 * Handle child nodes
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
 * Process attributes
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

/**
 * Generate child node mappings
 * @param props Properties object
 * @returns Child node mapping and index array
 */
export function generateChildrenMaps(props: Record<string, any>) {
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
 * Common function: Process component element
 * @param path Node path
 * @param state Babel state
 * @param transformJSX JSX transformation function
 * @param tagName Tag name
 * @param props Properties object
 */
export function handleComponentElement(
  path: any,
  state: State,
  transformJSX: Function,
  tagName: string,
  props: Record<string, any>,
): void {
  // This function extracts common logic for processing component elements across client, ssr and ssg modes
  addImport(importObject.createComponent);

  // Get child elements
  const children = path
    .get('children')
    .filter(
      (child: any) =>
        child.isJSXElement() ||
        child.isJSXFragment() ||
        (child.isJSXExpressionContainer() && !child.get('expression').isJSXEmptyExpression()),
    )
    .map((child: any) => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        transformJSX(child);
        return child.node;
      } else if (child.isJSXExpressionContainer()) {
        return child.get('expression').node;
      }
      return null;
    })
    .filter(Boolean);

  if (children.length > 0) {
    props.children = children;
  }
}

/**
 * Common function: Create component node
 * @param state Babel state
 * @param tagName Component tag name
 * @param props Properties object
 */
export function createComponentNode(
  state: State,
  tagName: string,
  props: Record<string, any>,
): t.CallExpression {
  const isFragment = tagName === 'Fragment';
  const fnName = isFragment ? 'Fragment' : 'createComponent';

  addImport(importObject[fnName]);

  const propsArg = createPropsObjectExpression(props, true);
  const args = isFragment ? [propsArg] : [t.identifier(tagName), propsArg];

  return t.callExpression(state.imports[fnName], args);
}

export type JSXElement = t.JSXElement | t.JSXFragment;

export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

/**
 * Base result interface
 */
export interface Result {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
}

/**
 * Client render result
 */
export interface ClientResult extends Result {
  template: string;
}

/**
 * Server-side render result
 */
export interface SSRResult extends Result {
  template: string;
}

/**
 * Static site generation result
 */
export interface SSGResult extends Result {
  template: string[];
  dynamics: DynamicContent[];
}

/**
 * Generic content interface
 */
export interface DynamicContent {
  type: 'attr' | 'text';
  node: Expression;
  attrName?: string;
}

export interface TransformContext {
  state: State;
  path: NodePath<JSXElement>;
  result: ClientResult | SSRResult | SSGResult;
}

export function createClientResult(): ClientResult {
  return {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: '',
  };
}

export function createSSGResult(): SSGResult {
  return {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    dynamics: [],
    template: [],
  };
}
export function createSSRResult(): SSRResult {
  return {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: '',
  };
}

/**
 * Checks if the given Babel path has a sibling element.
 *
 * @param {NodePath} path - The Babel path to check.
 * @return {boolean} True if the path has a sibling element, false otherwise.
 */
export function hasSiblingElement(path) {
  // Get all siblings (both previous and next)
  const siblings = path.getAllPrevSiblings().concat(path.getAllNextSiblings());

  // Check for non-self-closing sibling elements or JSXExpressionContainer
  const hasSibling = siblings.some(
    siblingPath => siblingPath.isJSXElement() || siblingPath.isJSXExpressionContainer(),
  );

  return hasSibling;
}

/**
 * Retrieves the name of a JSX attribute.
 *
 * @param {t.JSXAttribute} attribute - The JSX attribute to retrieve the name from.
 * @return {string} The name of the attribute.
 * @throws {Error} If the attribute type is unsupported.
 */
export function getAttrName(attribute: t.JSXAttribute): string {
  if (t.isJSXIdentifier(attribute.name)) {
    return attribute.name.name;
  }
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }
  throw new Error('Unsupported attribute type');
}

/**
 * Retrieves the tag name of a JSX element.
 *
 * @param {t.JSXElement} node - The JSX element.
 * @return {string} The tag name of the JSX element.
 */
export function getTagName(node: t.JSXElement): string {
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
}

/**
 * Converts a JSX element name to a string representation.
 *
 * case1: <MyComponent />
 * case2: <SomeLibrary.SomeComponent />;
 * case3: <namespace:ComponentName />;
 * case4: <SomeLibrary.Nested.ComponentName />;
 *
 * @param {t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName} node The JSX element name to convert.
 * @returns {string} The string representation of the JSX element name.
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
) {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name;
  }

  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * Determines if the given tagName is a component.
 *
 *  case1: <MyComponent />
 *  case2: <SomeLibrary.SomeComponent />;
 *  case3: <_component />;
 *
 * @param {string} tagName - The name of the tag to check.
 * @return {boolean} True if the tagName is a component, false otherwise.
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-z]/i.test(tagName[0])
  );
}

/**
 * Determines if the given path represents a text child node in a JSX expression.
 *
 * @param {NodePath<JSXChild>} path - The path to the potential text child node.
 * @return {boolean} True if the path represents a text child node, false otherwise.
 */
export function isTextChild(path: NodePath<JSXChild>): boolean {
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isJSXText() || expression.isStringLiteral() || expression.isNumericLiteral()) {
      return true;
    }
  }
  if (path.isJSXText() || path.isStringLiteral() || path.isNullLiteral()) {
    return true;
  }
  return false;
}

/**
 * Sets the text content of a JSX node.
 *
 * @param {NodePath<JSXChild>} path - The path to the JSX node.
 * @param {string} text - The text to set.
 * @return {void}
 */
export function setNodeText(path: NodePath<JSXChild>, text: string): void {
  if (path.isJSXText()) {
    path.node.value = text;
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      expression.replaceWith(t.stringLiteral(text));
    }
  }
}

// Trim and replace multiple spaces/newlines with a single space
export function replaceSpace(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0;
}

export function hasObjectExpression(
  prop: string,
  value: t.ObjectExpression,
  props: Record<string, any>,
  state: State,
  isCt = false,
): string {
  let ct = '';
  const hasConditional = value.properties.some(
    property => t.isObjectProperty(property) && t.isConditionalExpression(property.value),
  );

  if (hasConditional) {
    addImport(importObject.computed);
    props[prop] = t.callExpression(state.imports.computed, [t.arrowFunctionExpression([], value)]);
  } else if (isCt) {
    value.properties.forEach(property => {
      if (t.isObjectProperty(property)) {
        ct += `${(property.key as Identifier).name || (property.key as StringLiteral).value}:${(property.value as StringLiteral).value};`;
      }
    });

    delete props[prop];
  }
  return ct;
}

export function getNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) {
    return replaceSpace(path.node);
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}

/**
 * Creates a props object expression from a props record
 */
export function createPropsObjectExpression(
  props: Record<string, any>,
  isComponent = false,
): t.ObjectExpression {
  const result: (ObjectProperty | SpreadElement)[] = [];

  for (const prop in props) {
    let value = props[prop];
    if (!isComponent && prop === 'children') {
      continue;
    }

    if (Array.isArray(value)) {
      value = t.arrayExpression(value);
    } else if (typeof value === 'object' && value !== null && !t.isNode(value)) {
      value = createPropsObjectExpression(value);
    } else if (typeof value === 'string') {
      value = t.stringLiteral(value);
    } else if (typeof value === 'number') {
      value = t.numericLiteral(value);
    } else if (typeof value === 'boolean') {
      value = t.booleanLiteral(value);
    } else if (value === undefined) {
      value = t.tsUndefinedKeyword();
    } else if (value === null) {
      value = t.nullLiteral();
    }

    if (prop === '_$spread$') {
      result.push(t.spreadElement(value));
    } else {
      result.push(t.objectProperty(t.stringLiteral(prop), value));
    }
  }

  return t.objectExpression(result);
}

/**
 * Process JSX attributes and return props object
 */
export function processJSXAttributes(
  path: NodePath<t.JSXElement>,
  state: State,
  transformJSX: (path: NodePath<JSXElement>) => void,
): { props: Record<string, any>; hasExpression: boolean } {
  const props: Record<string, any> = {};
  let hasExpression = false;

  path
    .get('openingElement')
    .get('attributes')
    .forEach(attribute => {
      if (attribute.isJSXAttribute()) {
        const name = getAttrName(attribute.node);
        const value = attribute.get('value');

        if (!value.node) {
          props[name] = true;
        } else if (value.isStringLiteral()) {
          props[name] = value.node.value;
        } else if (value.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          processJSXAttributeExpression(expression, name, props, path, state, transformJSX);
          hasExpression = true;
        } else if (value.isJSXElement() || value.isJSXFragment()) {
          transformJSX(value);
          props[name] = value.node;
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        props._$spread$ = attribute.get('argument').node;
        hasExpression = true;
      }
    });

  return { props, hasExpression };
}

/**
 * Process JSX attribute expression
 */
function processJSXAttributeExpression(
  expression: NodePath,
  name: string,
  props: Record<string, any>,
  path: NodePath<t.JSXElement>,
  state: State,
  transformJSX: (path: NodePath<JSXElement>) => void,
): void {
  if (expression.isStringLiteral()) {
    props[name] = expression.node.value;
  } else if (expression.isNumericLiteral()) {
    props[name] = expression.node.value;
  } else if (expression.isJSXElement() || expression.isJSXFragment()) {
    transformJSX(expression);
    props[name] = expression.node;
  } else if (expression.isExpression()) {
    if (/^key|ref|on.+$/.test(name)) {
      props[name] = expression.node;
    } else if (/^bind:.+/.test(name)) {
      processBind(name, expression, props, path);
    } else if (expression.isConditionalExpression()) {
      addImport(importObject.computed);
      props[name] = t.callExpression(state.imports.computed, [
        t.arrowFunctionExpression([], expression.node),
      ]);
    } else {
      props[name] = expression.node;
    }
  }
}

/**
 * Process bind attribute
 */
function processBind(
  name: string,
  expression: NodePath,
  props: Record<string, any>,
  path: NodePath<t.JSXElement>,
): void {
  const value = path.scope.generateUidIdentifier('value');
  const bindName = name.slice(5).toLowerCase();
  props[bindName] = expression.node;
  props[`update${capitalize(bindName)}`] = t.arrowFunctionExpression(
    [value],
    t.assignmentExpression('=', expression.node as t.OptionalMemberExpression, value),
  );
}

/**
 * Get child elements
 */
export function getChildren(
  path: NodePath<JSXElement>,
  transformJSX: (path: NodePath<JSXElement>) => void,
): t.Expression[] {
  // Get all child nodes, correctly handle nested components and expressions
  return path
    .get('children')
    .filter(isValidChild)
    .map(child => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        // For JSX elements, process recursively
        transformJSX(child);
        return child.node;
      } else if (child.isJSXExpressionContainer()) {
        const expression = child.get('expression');
        if (!expression.isJSXEmptyExpression()) {
          return expression.node as t.Expression;
        }
      } else if (child.isJSXText()) {
        const text = replaceSpace(child.node);
        if (text) {
          return t.stringLiteral(text);
        }
      }
      // Filter out invalid nodes
      return null;
    })
    .filter(Boolean) as t.Expression[];
}

/**
 * Analyze JSX component for expression properties
 * @param path JSX element path
 */
export function hasExpressionProps(path: NodePath<JSXElement>): boolean {
  let hasExpression = false;

  // Use a simpler approach to traverse attributes to avoid type errors
  const element = path.get('openingElement') as NodePath<t.JSXOpeningElement>;
  if (element.isJSXOpeningElement()) {
    const attributes = element.get('attributes') as NodePath<
      t.JSXAttribute | t.JSXSpreadAttribute
    >[];
    for (const attribute of attributes) {
      if (attribute.isJSXAttribute()) {
        const value = attribute.get('value');
        if (value && value.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          if (
            expression &&
            expression.isExpression() &&
            !expression.isStringLiteral() &&
            !expression.isNumericLiteral()
          ) {
            hasExpression = true;
            break;
          }
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        hasExpression = true;
        break;
      }
    }
  }
  return hasExpression;
}
export function analyzeChildrenComplexity(path: NodePath<JSXElement>): {
  hasComplexChildren: boolean;
  childCount: number;
  hasExpressionChildren: boolean;
} {
  let hasComplexChildren = false;
  let hasExpressionChildren = false;
  let childCount = 0;

  // Manually iterate through child nodes to avoid type issues
  const children = path.get('children');
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!isValidChild(child)) continue;

      childCount++;

      if (child.isJSXElement() || child.isJSXFragment()) {
        // Manually check if there are valid child nodes
        const nestedChildren = child.get('children');
        if (Array.isArray(nestedChildren) && nestedChildren.length > 0) {
          for (const nestedChild of nestedChildren) {
            if (isValidChild(nestedChild as NodePath<JSXChild>)) {
              hasComplexChildren = true;
              break;
            }
          }
        }
      } else if (child.isJSXExpressionContainer()) {
        const expression = child.get('expression');
        if (
          expression &&
          !expression.isStringLiteral() &&
          !expression.isNumericLiteral() &&
          !expression.isJSXEmptyExpression()
        ) {
          hasExpressionChildren = true;
          hasComplexChildren = true;
        }
      }
    }
  }

  return { hasComplexChildren, childCount, hasExpressionChildren };
}
