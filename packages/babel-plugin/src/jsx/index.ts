import { types as t } from '@babel/core';
import { capitalize } from '@aube/shared';
import { imports } from '../program';
import {
  type ClientResult,
  type JSXChild,
  type JSXElement,
  type ServerResult,
  createClientResult,
  createServerResult,
  getAttrName,
  getNodeText,
  getTagName,
  hasObjectExpression,
  hasSiblingElement,
  isComponentName,
  isTextChild,
  isValidChild,
  replaceSpace,
  setNodeText,
} from './shared';
import { selfClosingTags, svgTags } from './constants';
import type { State } from '../types';
import type { NodePath } from '@babel/core';
import type { OptionalMemberExpression } from '@babel/types';

let currentResult: ClientResult | ServerResult;
let isServer = false;

function addTemplate(content: string, join = false): void {
  if (isServer) {
    if (join && currentResult.template.length > 0) {
      (currentResult.template as string[])[currentResult.template.length - 1] += content;
    } else {
      (currentResult.template as string[]).push(content);
    }
  } else {
    currentResult.template += content;
  }
}

export function transformJSX(path) {
  isServer = path.state?.opts?.server;
  const preCurrentResult = currentResult;
  currentResult = isServer ? createServerResult() : createClientResult();

  transformJSXElement(path, isServer, true);
  path.replaceWith(isServer ? createServerNode(path) : createClientNode(path));
  currentResult = preCurrentResult;
}

function createClientNode(path: NodePath<JSXElement>): t.CallExpression {
  const state: State = path.state;
  const isJSXFragment = path.isJSXFragment();
  const isComponent = path.isJSXElement() && isComponentName(getTagName(path.node));

  const tmpl = isComponent
    ? t.identifier(getTagName(path.node))
    : path.scope.generateUidIdentifier('_tmpl$');

  let templateNode;
  if (!isComponent) {
    templateNode = t.callExpression(state.template, [
      t.stringLiteral(currentResult.template as string),
    ]);

    state.tmplDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));
    imports.add('template');
  }

  const key = currentResult.props.key ?? currentResult.props[0]?.key;

  const propsArg = createProps(currentResult.props);
  const args =
    isComponent && getTagName(path.node) === 'Fragment'
      ? [t.stringLiteral(''), propsArg]
      : [tmpl, propsArg];

  if (key) {
    args.push(key);
  }

  const fnName =
    isJSXFragment || (isComponent && getTagName(path.node) === 'Fragment') ? 'Fragment' : 'h';
  imports.add(fnName);

  return t.callExpression(state[fnName], args);
}

function createServerNode(path: NodePath<JSXElement>): t.CallExpression {
  const state: State = path.state;
  const isComponent = path.isJSXElement() && isComponentName(getTagName(path.node));

  const tmpl = isComponent
    ? t.identifier(getTagName(path.node))
    : path.scope.generateUidIdentifier('_tmpl$');

  let templateNode;
  if (!isComponent) {
    templateNode = t.arrayExpression((currentResult.template as string[]).map(t.stringLiteral));

    state.tmplDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));
  }

  const key = currentResult.props.key ?? currentResult.props[0]?.key;

  const propsArg = createProps(currentResult.props);
  const args =
    isComponent && getTagName(path.node) === 'Fragment'
      ? [t.stringLiteral(''), propsArg]
      : [tmpl, propsArg];

  if (key) {
    args.push(key);
  }

  const fnName = 'ssg';

  imports.add(fnName);

  return t.callExpression(state[fnName], args);
}

function transformJSXElement(
  path: NodePath<JSXElement>,
  isServer: boolean = false,
  isRoot: boolean = false,
): void {
  const state = path.state;
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const tagIsComponent = isComponentName(tagName);
    const isSelfClose = !tagIsComponent && selfClosingTags.includes(tagName);
    const isSvg = svgTags.includes(tagName) && currentResult.index === 1;
    const { props, hasExpression } = getAttrProps(path, state);

    if (tagIsComponent) {
      if (isRoot) {
        currentResult.props = props;
        const children = getChildren(path);
        if (children.length > 0) {
          const childrenGenerator =
            children.length === 1 ? children[0] : t.arrayExpression(children as JSXElement[]);

          // Check if children is a conditional expression
          if (t.isConditionalExpression(childrenGenerator)) {
            currentResult.props.children = t.arrowFunctionExpression([], childrenGenerator);
          } else {
            currentResult.props.children = childrenGenerator;
          }
        }
      } else {
        transformJSX(path);
        replaceChild(path.node);
      }
    } else {
      if (isSvg) {
        currentResult.template = isServer
          ? [`<svg _svg_  data-hk="${currentResult.index}">`]
          : `<svg _svg_ >`;
      }

      addTemplate(`<${tagName}${isServer ? ` data-hk="${currentResult.index}"` : ''}`, true);
      handleAttributes(props, state);
      addTemplate(isSelfClose ? '/>' : '>', !hasExpression);

      if (!isSelfClose) {
        transformChildren(path);
        if (hasSiblingElement(path) || isServer) {
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
 * Given a JSXElement path, returns an object with the properties of the
 * element and a boolean indicating whether the element has any expression
 * properties.
 *
 * @param path - The path to the JSXElement
 * @returns An object with the properties of the element and a boolean
 * indicating whether the element has any expression properties.
 */
export function getAttrProps(path: NodePath<t.JSXElement>, state: State): Record<string, any> {
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
                // props[bindName] = t.memberExpression(
                //   t.identifier((expression.node as Identifier).name),
                //   t.identifier('value'),
                // );
                props[`update${capitalize(bindName)}`] = t.arrowFunctionExpression(
                  [value],
                  t.assignmentExpression('=', expression.node as OptionalMemberExpression, value),
                );
              } else {
                if (expression.isConditionalExpression()) {
                  imports.add('useComputed');
                  props[name] = t.callExpression(state.useComputed, [
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

function getChildren(path: NodePath<JSXElement>): JSXChild[] {
  return path
    .get('children')
    .filter(child => isValidChild(child))
    .map(child => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        transformJSX(child);
      } else if (child.isJSXExpressionContainer()) {
        child.replaceWith(child.get('expression'));
      } else if (child.isJSXText()) {
        child.replaceWith(t.stringLiteral(replaceSpace(child.node)));
      } else {
        throw new Error('Unsupported child type');
      }
      return child.node;
    });
}
function replaceChild(node: t.Expression): void {
  if (currentResult.isLastChild) {
    currentResult.index--;
  } else {
    addTemplate('<!>');
  }
  currentResult.props[currentResult.parentIndex] ??= {};
  currentResult.props[currentResult.parentIndex].children ??= [];
  currentResult.props[currentResult.parentIndex].children.push(
    t.arrayExpression([
      t.arrowFunctionExpression([], node),
      currentResult.isLastChild ? t.nullLiteral() : t.identifier(String(currentResult.index)),
    ]),
  );
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
      imports.add('useComputed');
      props[prop] = t.callExpression(state.useComputed, [t.arrowFunctionExpression([], value)]);
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
    transformJSXElement(child, false);
  } else if (child.isJSXExpressionContainer()) {
    const expression = child.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      addTemplate(`${expression.node.value}`, true);
    } else if (expression.isExpression()) {
      replaceChild(expression.node);
    } else if (t.isJSXEmptyExpression(expression.node)) {
      // it is empty expression
      // just for tracking value
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    addTemplate(replaceSpace(child.node), true);
  } else {
    throw new Error('Unsupported child type');
  }
}
function createProps(props: Record<string, any>): t.ObjectExpression {
  const result: (t.ObjectProperty | t.SpreadElement)[] = [];
  for (const prop in props) {
    let value = props[prop];
    if (prop === 'key') {
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
