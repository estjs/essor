import { types as t } from '@babel/core';
import { startsWith } from 'essor-shared';
import { imports } from '../program';
import { selfClosingTags, svgTags } from './constants';
import type { OptionalMemberExpression } from '@babel/types';
import type { State } from '../types';
import type { NodePath } from '@babel/core';
type JSXElement = t.JSXElement | t.JSXFragment;
interface Result {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
  template: string;
}

type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

export function transformJSXClient(path: NodePath<JSXElement>): void {
  const result: Result = {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: '',
  };
  transformJSXElement(path, result, true);

  path.replaceWith(createEssorNode(path, result));
}

function createEssorNode(path: NodePath<JSXElement>, result: Result): t.CallExpression {
  const state: State = path.state;

  let tmpl: t.Identifier;
  if (path.isJSXElement() && isComponent(getTagName(path.node))) {
    tmpl = t.identifier(getTagName(path.node));
  } else {
    tmpl = path.scope.generateUidIdentifier('_tmpl$');
    const template = t.callExpression(state.template, [t.stringLiteral(result.template)]);
    const declarator = t.variableDeclarator(tmpl, template);
    state.tmplDeclaration.declarations.push(declarator);
    imports.add('template');
  }

  const args = [tmpl, createProps(result.props)];
  const key = result.props.key || result.props[0]?.key;
  if (key) {
    args.push(key);
  }
  imports.add('h');
  return t.callExpression(state.h, args);
}

function createProps(props) {
  const toAstNode = value => {
    if (Array.isArray(value)) {
      return t.arrayExpression(value.map(toAstNode));
    }
    if (value && typeof value === 'object' && !t.isNode(value)) {
      return createProps(value);
    }

    switch (typeof value) {
      case 'string':
        return t.stringLiteral(value);
      case 'number':
        return t.numericLiteral(value);
      case 'boolean':
        return t.booleanLiteral(value);
      case 'undefined':
        return t.tsUndefinedKeyword();
      case undefined:
        return t.tsUndefinedKeyword();
      case null:
        return t.nullLiteral();
      default:
        return value;
    }
  };

  const result = Object.keys(props)
    .filter(prop => prop !== 'key')
    .map(prop => {
      const value = toAstNode(props[prop]);
      return prop === '_$spread$'
        ? t.spreadElement(value)
        : t.objectProperty(t.stringLiteral(prop), value);
    });

  return t.objectExpression(result);
}
function transformJSXElement(
  path: NodePath<JSXElement>,
  result: Result,
  isRoot: boolean = false,
): void {
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const tagIsComponent = isComponent(tagName);
    const isSelfClose = !tagIsComponent && selfClosingTags.includes(tagName);
    const isSvg = svgTags.includes(tagName) && result.index === 1;
    const props = getAttrProps(path);
    if (tagIsComponent) {
      if (isRoot) {
        result.props = props;
        const children = getChildren(path) as any;
        if (children.length > 0) {
          const childrenGenerator =
            children.length === 1 ? children[0] : t.arrayExpression(children);
          result.props.children = childrenGenerator;
        }
      } else {
        transformJSXClient(path);
        replaceChild(path.node, result);
      }
    } else {
      if (isSvg) {
        result.template = '<svg _svg_>';
      }
      result.template += `<${tagName}`;
      handleAttributes(props, result);
      result.template += isSelfClose ? '/>' : '>';
      if (!isSelfClose) {
        transformChildren(path, result);
        result.template += `</${tagName}>`;
      }
    }
  } else {
    result.index--;
    transformChildren(path, result);
  }
}

function transformChildren(path: NodePath<JSXElement>, result: Result): void {
  const parentIndex = result.index;
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
      result.parentIndex = parentIndex;
      result.isLastChild = i === arr.length - 1;
      transformChild(child, result);
    });
}

function transformChild(child: NodePath<JSXChild>, result: Result): void {
  result.index++;
  if (child.isJSXElement() || child.isJSXFragment()) {
    transformJSXElement(child, result, false);
  } else if (child.isJSXExpressionContainer()) {
    const expression = child.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      result.template += String(expression.node.value);
    } else if (expression.isExpression()) {
      replaceChild(expression.node, result);
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    result.template += String(child.node.value);
  } else {
    throw new Error('Unsupported child type');
  }
}

function getNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) {
    return path.node.value;
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}
function setNodeText(path: NodePath<JSXChild>, text: string): void {
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

function handleAttributes(props: Record<string, any>, result: Result): void {
  let klass = '';
  let style = '';

  for (const prop in props) {
    const value = props[prop];

    if (prop === 'class' && typeof value === 'string') {
      klass += ` ${value}`;
      delete props[prop];
      continue;
    }
    if (startsWith(prop, 'class:')) {
      if (value === true) {
        const name = prop.replace(/^class:/, '');
        klass += ` ${name}`;
        delete props[prop];
        continue;
      }
      if (value === false) {
        delete props[prop];
        continue;
      }
    }

    if (prop === 'style' && typeof value === 'string') {
      style += `${value}${value.at(-1) === ';' ? '' : ';'}`;
      delete props[prop];
      continue;
    }
    if (startsWith(prop, 'style:') && (typeof value === 'string' || typeof value === 'number')) {
      const name = prop.replace(/^style:/, '');
      style += `${name}:${value};`;
      delete props[prop];
      continue;
    }

    if (value === true) {
      result.template += ` ${prop}`;
      delete props[prop];
    }
    if (value === false) {
      delete props[prop];
    }
    if (typeof value === 'string' || typeof value === 'number') {
      result.template += ` ${prop}="${value}"`;
      delete props[prop];
    }
  }

  if (Object.keys(props).length > 0) {
    result.props[result.index] = props;
  }

  klass = klass.trim();
  style = style.trim();

  if (klass) {
    result.template += ` class="${klass}"`;
  }
  if (style) {
    result.template += ` style="${style}"`;
  }
}

function replaceChild(node: t.Expression, result: Result): void {
  if (result.isLastChild) {
    result.index--;
  } else {
    result.template += '<!-->';
  }
  result.props[result.parentIndex] ??= {};
  result.props[result.parentIndex].children ??= [];
  result.props[result.parentIndex].children.push(
    t.arrayExpression([
      t.arrowFunctionExpression([], node),
      result.isLastChild ? t.nullLiteral() : t.identifier(String(result.index)),
    ]),
  );
}

function getChildren(path: NodePath<JSXElement>): JSXChild[] {
  return path
    .get('children')
    .filter(child => isValidChild(child))
    .map(child => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        transformJSXClient(child);
      } else if (child.isJSXExpressionContainer()) {
        child.replaceWith(child.get('expression'));
      } else if (child.isJSXText()) {
        child.replaceWith(t.stringLiteral(child.node.value));
      } else {
        throw new Error('Unsupported child type');
      }
      return child.node;
    });
}

export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0;
}
export function getAttrProps(path: NodePath<t.JSXElement>): Record<string, any> {
  const props: Record<string, any> = {};

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
              transformJSXClient(expression);
              props[name] = expression.node;
            } else if (expression.isExpression()) {
              if (/^key|ref|on.+$/.test(name)) {
                props[name] = expression.node;
              } else if (/^bind:.+/.test(name)) {
                const value = path.scope.generateUidIdentifier('value');
                const bindName = name.slice(5).toLocaleLowerCase();
                props[bindName] = expression.node;
                props[`update:${bindName}`] = t.arrowFunctionExpression(
                  [value],
                  t.assignmentExpression('=', expression.node as OptionalMemberExpression, value),
                );
              } else {
                if (expression.isConditionalExpression()) {
                  props[name] = t.arrowFunctionExpression([], expression.node);
                } else {
                  props[name] = expression.node;
                }
              }
            }
          } else if (value.isJSXElement() || value.isJSXFragment()) {
            transformJSXClient(value);
            props[name] = value.node;
          }
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        props._$spread$ = attribute.get('argument').node;
      } else {
        throw new Error('Unsupported attribute type');
      }
    });

  return props;
}
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
 * Determines if the given tagName is a component.
 *
 *  case1: <MyComponent />
 *  case2: <SomeLibrary.SomeComponent />;
 *  case3: <_component />;
 *
 * @param {string} tagName - The name of the tag to check.
 * @return {boolean} True if the tagName is a component, false otherwise.
 */
export function isComponent(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^A-Za-z]/.test(tagName[0])
  );
}

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
