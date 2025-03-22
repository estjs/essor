import { capitalize, isSVGTag, isSelfClosingTag } from '@estjs/shared';
import { types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import {
  type ClientResult,
  type JSXChild,
  type JSXElement,
  createClientResult,
  createPropsObjectExpression,
  getAttrName,
  getChildren,
  getNodeText,
  getTagName,
  hasObjectExpression,
  hasSiblingElement,
  isComponentName,
  isTextChild,
  isValidChild,
  processJSXAttributes,
  replaceSpace,
  setNodeText,
} from './common';
import { generateChildrenMaps, processChildren } from './common';
import type { State } from '../types';
import type { Identifier } from '@babel/types';
import type { NodePath } from '@babel/core';
let currentResult: ClientResult;

export function addTemplate(content: string): void {
  currentResult.template += content;
}

/**
 *  transformJSX enter
 * @param path NodePath<JSXElement>
 */
export function transformJSX(path: NodePath<JSXElement>) {
  const preResult = currentResult;
  currentResult = createClientResult();

  transformJSXElement(path, true);

  // Check if it's a root component and currently in client rendering mode
  const state: State = path.state;
  const isRoot =
    path.parent && (t.isReturnStatement(path.parent) || t.isVariableDeclarator(path.parent));
  const isClientMode = state.opts.mode === 'client';
  // Check if HMR functionality is enabled
  const isHmrEnabled = state.opts.hmr !== false; // Enabled by default unless explicitly set to false

  if (isClientMode && isHmrEnabled && path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const isComponent = isComponentName(tagName);

    // Only apply HMR wrapping to component types
    if (isComponent) {
      // Check if it's a root-level component (function return value or variable declaration)
      if (isRoot) {
        // Create HMR wrapper node
        // const hmrWrapped = createHMRWrapper(path, tagName, currentResult.props);
        // path.replaceWith(hmrWrapped);
      } else {
        // Nested component processing - ensure the component can be tracked
        path.replaceWith(createNestedComponentNode(path, tagName));
      }
    } else {
      path.replaceWith(createClientNode(path));
    }
  } else {
    path.replaceWith(createClientNode(path));
  }

  currentResult = preResult;
}

/**
 *
 */
function transformJSXElement(path: NodePath<JSXElement>, isRoot = false) {
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const isComponent = isComponentName(tagName);

    // Component not self closing
    const isSelfClosing = !isComponent && isSelfClosingTag(tagName);

    // Find svg start tag
    const isSvg = isSVGTag(tagName) && currentResult?.index === 1;

    const { props } = processJSXAttributes(path, path.state, transformJSX);

    if (isComponent) {
      if (isRoot) {
        currentResult.props = props;
        const children = getChildren(path, transformJSX);
        if (children.length > 0) {
          currentResult.props.children = children;
        }

        // TODO: Hot reload will cause errors
        // HMR: Add hot update support to root components
        // const hmrWrapped = createHMRWrapper(path, tagName, currentResult.props);
        // path.replaceWith(hmrWrapped);
      } else {
        transformJSX(path);
        replaceChild(path.node);
      }
    } else {
      if (isSvg) {
        addTemplate('<svg _svg_>');
      }

      addTemplate(`<${tagName}`);
      handleAttributes(props, path.state);
      addTemplate(isSelfClosing ? '/>' : '>');

      if (!isSelfClosing) {
        transformChildren(path);
        if (hasSiblingElement(path)) {
          addTemplate(`</${tagName}>`);
        }
      }
    }
  } else {
    currentResult.index--;
    transformChildren(path);
  }
}

/**
 * 创建客户端渲染节点
 * @param path - JSX 元素的路径
 * @returns 转换后的表达式节点
 */
function createClientNode(path: NodePath<JSXElement>): t.CallExpression {
  const state: State = path.state;
  const isJSXFragment = path.isJSXFragment();
  const isComponent = path.isJSXElement() && isComponentName(getTagName(path.node));

  const tmpl = isComponent
    ? t.identifier(getTagName(path.node))
    : path.scope.generateUidIdentifier('_tmpl$');

  let templateNode;
  if (!isComponent) {
    templateNode = t.callExpression(state.imports.template, [
      t.stringLiteral(currentResult.template as string),
    ]);
    state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));
    addImport(importObject.template);
  }

  const propsArg = createPropsObjectExpression(currentResult.props, isComponent);
  const args = isComponent && getTagName(path.node) === 'Fragment' ? [propsArg] : [tmpl, propsArg];

  const fnName =
    isJSXFragment || (isComponent && getTagName(path.node) === 'Fragment')
      ? 'Fragment'
      : 'createComponent';
  addImport(importObject[fnName]);
  if (isComponent) {
    return t.callExpression(state.imports[fnName], args);
  }

  const { childrenIndexMap, idxs } = generateChildrenMaps(currentResult.props);

  const body: t.Statement[] = [];
  const el = path.scope.generateUidIdentifier('el');
  const nodes = path.scope.generateUidIdentifier('nodes');
  body.push(t.variableDeclaration('const', [t.variableDeclarator(el, t.callExpression(tmpl, []))]));
  if (childrenIndexMap?.length) {
    addImport(importObject.mapNodes);
    body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          nodes,
          t.callExpression(state.imports.mapNodes, [
            el,
            t.arrayExpression(idxs.map(key => t.numericLiteral(+key))),
          ]),
        ),
      ]),
    );

    processChildren(childrenIndexMap, nodes, body, state);
  }
  body.push(t.returnStatement(el));

  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
}

function handleAttributes(props: Record<string, any>, state: State): void {
  let klass = '';
  let style = '';

  for (const [prop, value] of Object.entries(props)) {
    if (prop === 'class' && typeof value === 'string') {
      klass += ` ${value}`;
      delete props[prop];
    } else if (prop === 'style' && typeof value === 'string') {
      style += `${value}${value.at(-1) === ';' ? '' : ';'}`;
      delete props[prop];
    } else if (value === true) {
      addTemplate(` ${prop}`);
      delete props[prop];
    } else if (value === false) {
      delete props[prop];
    } else if (typeof value === 'string' || typeof value === 'number') {
      addTemplate(` ${prop}="${value}"`);
      delete props[prop];
    } else if (t.isConditionalExpression(value)) {
      addImport(importObject.computed);
      props[prop] = t.callExpression(state.imports.computed, [
        t.arrowFunctionExpression([], value),
      ]);
    } else if (t.isObjectExpression(value)) {
      const val = hasObjectExpression(
        prop,
        value,
        props,
        state,
        prop === 'class' || prop === 'style',
      );
      if (val) {
        if (prop === 'class') {
          klass += ` ${val}`;
        }
        if (prop === 'style') {
          style += `${val}${val.at(-1) === ';' ? '' : ';'}`;
        }
      }
    }
  }

  if (Object.keys(props).length > 0) {
    currentResult.props[currentResult.index] = props;
  }

  if (klass.trim()) {
    addTemplate(` class="${klass.trim()}"`);
  }
  if (style.trim()) {
    addTemplate(` style="${style.trim()}"`);
  }
}

/**
 * Given a JSXElement path, returns an object with the properties of the
 * element and a boolean indicating whether the element has any expression
 * properties.
 *
 * @param path - The path to the JSXElement
 * @returns An object with the properties of the element and a boolean
 * indicating whether the element has any expression properties.
 */
export function getAttrProps(
  path: NodePath<t.JSXElement>,
  state: State,
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
        } else {
          if (value.isJSXExpressionContainer()) {
            const expression = value.get('expression');
            if (expression.isStringLiteral()) {
              props[name] = expression.node.value;
            } else if (expression.isNumericLiteral()) {
              props[name] = expression.node.value;
            } else if (expression.isJSXElement() || expression.isJSXFragment()) {
              transformJSX(expression);
              props[name] = expression.node;
            } else if (expression.isExpression()) {
              hasExpression = true;
              if (/^key|ref|on.+$/.test(name)) {
                props[name] = expression.node;
              } else if (/^bind:.+/.test(name)) {
                const value = path.scope.generateUidIdentifier('value');
                const bindName = name.slice(5).toLocaleLowerCase();
                props[bindName] = expression.node;
                props[`update${capitalize(bindName)}`] = t.arrowFunctionExpression(
                  [value],
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(
                      t.identifier((expression.node as Identifier).name),
                      t.identifier('value'),
                    ),
                    value,
                  ),
                );
              } else {
                if (expression.isConditionalExpression()) {
                  addImport(importObject.computed);
                  props[name] = t.callExpression(state.imports.computed, [
                    t.arrowFunctionExpression([], expression.node),
                  ]);
                } else {
                  props[name] = expression.node;
                }
              }
            }
          } else if (value.isJSXElement() || value.isJSXFragment()) {
            transformJSX(value);
            props[name] = value.node;
          }
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        props._$spread$ = attribute.get('argument').node;
        hasExpression = true;
      } else {
        throw new Error('Unsupported attribute type');
      }
    });
  return {
    props,
    hasExpression,
  };
}

function replaceChild(node: t.Expression): void {
  if (currentResult.isLastChild) {
    currentResult.index--;
  } else {
    addTemplate('<!>');
  }
  currentResult.props[currentResult.parentIndex] ??= {};
  currentResult.props[currentResult.parentIndex].children ??= [];

  if (t.isJSXElement(node)) {
    const tagName = getTagName(node);
    if (isComponentName(tagName)) {
      // 获取组件的 props
      const props = currentResult.props[currentResult.index] || {};
      currentResult.props[currentResult.parentIndex].children.push({
        node: t.callExpression(t.identifier('createComponent'), [
          t.identifier(tagName),
          createProps(props),
        ]),
        before: currentResult.isLastChild ? null : String(currentResult.index),
      });
      return;
    }
  }

  currentResult.props[currentResult.parentIndex].children.push({
    node,
    before: currentResult.isLastChild ? null : String(currentResult.index),
  });
}
function transformChildren(path: NodePath<JSXElement>): void {
  const parentIndex = currentResult.index;
  path
    .get('children')
    .reduce((pre, cur) => {
      if (isValidChild(cur)) {
        const lastChild = pre.at(-1);
        if (lastChild && isTextChild(cur) && isTextChild(lastChild)) {
          setNodeText(lastChild, getNodeText(lastChild) + getNodeText(cur));
        } else {
          pre.push(cur);
        }
      }
      return pre;
    }, [] as NodePath<JSXChild>[])
    .forEach((child, i, arr) => {
      currentResult.parentIndex = parentIndex;
      currentResult.isLastChild = i === arr.length - 1;
      transformChild(child);
    });
}
function transformChild(child: NodePath<JSXChild>): void {
  currentResult.index++;
  if (child.isJSXElement() || child.isJSXFragment()) {
    transformJSXElement(child);
  } else if (child.isJSXExpressionContainer()) {
    const expression = child.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      addTemplate(`${expression.node.value}`);
    } else if (expression.isExpression()) {
      replaceChild(expression.node);
    } else if (t.isJSXEmptyExpression(expression.node)) {
      // It is empty expression
      // Just for tracking value
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    addTemplate(replaceSpace(child.node));
  } else {
    throw new Error('Unsupported child type');
  }
}

function createProps(props: Record<string, any>, isComponent = false): t.ObjectExpression {
  const result: (t.ObjectProperty | t.SpreadElement)[] = [];
  for (const prop in props) {
    let value = props[prop];
    if (!isComponent && prop === 'children') {
      continue;
    }
    if (Array.isArray(value)) {
      value = t.arrayExpression(value);
    }
    if (typeof value === 'object' && value !== null && !t.isNode(value)) {
      value = createProps(value);
    }
    if (typeof value === 'string') {
      value = t.stringLiteral(value);
    }
    if (typeof value === 'number') {
      value = t.numericLiteral(value);
    }
    if (typeof value === 'boolean') {
      value = t.booleanLiteral(value);
    }
    if (value === undefined) {
      value = t.tsUndefinedKeyword();
    }
    if (value === null) {
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
 * HMR: Create nested component rendering node
 * @param path - JSX element path
 * @param componentName - Component name
 * @returns Component expression node
 */
function createNestedComponentNode(
  path: NodePath<JSXElement>,
  componentName: string,
): t.Expression {
  const state: State = path.state;
  const propsArg = createPropsObjectExpression(currentResult.props, true);

  // Add component metadata for future component update tracking
  const metadataProperty = t.objectProperty(
    t.stringLiteral('__hmrComponent'),
    t.stringLiteral(componentName),
  );

  // Add to props object
  if (t.isObjectExpression(propsArg)) {
    propsArg.properties.push(metadataProperty);
  }

  // Create component node
  return t.callExpression(state.imports.createComponent, [t.identifier(componentName), propsArg]);
}

/**
 * HMR: Create hot update wrapper for component
 * @param path - JSX element path
 * @param componentName - Component name
 * @param props - Component properties
 * @returns Wrapped expression node
 */
function createHMRWrapper(
  path: NodePath<JSXElement>,
  componentName: string,
  props: Record<string, any>,
): t.Expression {
  // HMR: Add hot update related runtime function imports
  addImport(importObject.createHMR);
  addImport(importObject.acceptHMR);

  // HMR: Get current filename and location info for module identification
  const filename = (path.hub as any).file?.opts?.filename || '';
  const location = path.node.loc ? `${path.node.loc.start.line}:${path.node.loc.start.column}` : '';

  // Create component props parameter
  const propsArg = createPropsObjectExpression(props, true);

  // Add HMR metadata to props
  if (t.isObjectExpression(propsArg)) {
    propsArg.properties.push(
      t.objectProperty(t.stringLiteral('__hmrRoot'), t.booleanLiteral(true)),
    );
  }

  // HMR: Create hot update wrapper
  return t.callExpression(path.state.imports.createHMR, [
    // Component identification info (name:location)
    t.stringLiteral(`${componentName}${location ? `:${location}` : ''}`),
    // Component itself
    t.identifier(componentName),
    // Component properties
    propsArg,
    // File path (for HMR registration)
    t.stringLiteral(filename),
    // Hot update acceptance handler function
    t.arrowFunctionExpression(
      [t.identifier('newModule')],
      t.blockStatement([
        // Accept hot update and replace component
        t.expressionStatement(
          t.callExpression(path.state.imports.acceptHMR, [
            t.identifier('newModule'),
            t.identifier(componentName),
          ]),
        ),
      ]),
    ),
  ]);
}
