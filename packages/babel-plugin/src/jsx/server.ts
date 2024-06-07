import { capitalizeFirstLetter, startsWith } from 'essor-shared';
import { types as t } from '@babel/core';
import { imports } from '../program';
import { selfClosingTags, svgTags } from './constants';
import { getAttrName, getTagName, isComponent, isTextChild } from './client';
import type { OptionalMemberExpression } from '@babel/types';
import type { State } from '../types';
import type { NodePath } from '@babel/core';
type JSXElement = t.JSXElement | t.JSXFragment;
interface Result {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
  template: string[];
}

type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

export function transformJSXService(path: NodePath<JSXElement>): void {
  const result: Result = {
    index: 0,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: [], // 修改为数组
  };
  transformJSXServiceElement(path, result, true);
  path.replaceWith(createEssorNode(path, result));
}

function createEssorNode(path: NodePath<JSXElement>, result: Result): t.CallExpression {
  const state: State = path.state;

  let tmpl: t.Identifier;
  if (path.isJSXElement() && isComponent(getTagName(path.node))) {
    tmpl = t.identifier(getTagName(path.node));
  } else {
    tmpl = path.scope.generateUidIdentifier('_tmpl$');
    const template = t.callExpression(state.ssrtmpl, [
      t.arrayExpression(result.template.map(t.stringLiteral)),
    ]);
    const declarator = t.variableDeclarator(tmpl, template);
    state.tmplDeclaration.declarations.push(declarator);

    imports.add('ssrtmpl');
  }

  const args = [tmpl, createProps(result.props)];
  const key = result.props.key || result.props[0]?.key;
  if (key) {
    args.push(key);
  }
  imports.add('ssr');
  return t.callExpression(state.ssr, args);
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
function transformJSXServiceElement(
  path: NodePath<JSXElement>,
  result: Result,
  isRoot: boolean = false,
): void {
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const tagIsComponent = isComponent(tagName);
    const isSelfClose = !tagIsComponent && selfClosingTags.includes(tagName);
    const isSvg = svgTags.includes(tagName) && result.index === 1;
    const { props, hasExpression } = getAttrProps(path);
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
        transformJSXService(path);
        replaceChild(path.node, result);
      }
    } else {
      if (isSvg) {
        result.template.push('<svg _svg_>');
      }
      result.template.push(`<${tagName}`);
      handleAttributes(props, result);

      if (hasExpression) {
        result.template.push(isSelfClose ? '/>' : '>');
        result.props ||= {};
      } else {
        result.template[result.template.length - 1] += isSelfClose ? '/>' : '>';
      }
      transformChildren(path, result);

      if (!isSelfClose) {
        result.template.push(`</${tagName}>`);
      }
    }
  } else {
    result.index--;
    transformChildren(path, result);
  }
}

function transformChildren(path: NodePath<JSXElement>, result: Result): void {
  const parentIndex = result.template.length;
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
  if (child.isJSXElement() || child.isJSXFragment()) {
    transformJSXServiceElement(child, result, false);
  } else if (child.isJSXExpressionContainer()) {
    const expression = child.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      result.template[result.template.length - 1] += String(expression.node.value);
    } else if (expression.isExpression()) {
      replaceChild(expression.node, result);
    } else if (t.isJSXEmptyExpression(expression.node)) {
      // it is empty expression
      // do nothing
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    result.template.push(String(child.node.value));
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
      result.template[result.template.length - 1] += ` ${prop}`;
      delete props[prop];
    }
    if (value === false) {
      delete props[prop];
    }
    if (typeof value === 'string' || typeof value === 'number') {
      result.template[result.template.length - 1] += ` ${prop}="${value}"`;
      delete props[prop];
    }
  }

  if (Object.keys(props).length > 0) {
    result.props[result.index] = props;
  }

  klass = klass.trim();
  style = style.trim();

  if (klass) {
    result.template[result.template.length - 1] += ` class="${klass}"`;
  }
  if (style) {
    result.template[result.template.length - 1] += ` style="${style}"`;
  }
}

function replaceChild(node: t.Expression, result: Result): void {
  if (result.isLastChild) {
    result.index--;
  }
  result.props[result.parentIndex] ??= {};
  result.props[result.parentIndex].children ??= [];
  result.props[result.parentIndex].children.push(
    t.arrayExpression([
      t.arrowFunctionExpression([], node),
      t.identifier(String(result.template.length)),
    ]),
  );
}

function getChildren(path: NodePath<JSXElement>): JSXChild[] {
  return path
    .get('children')
    .filter(child => isValidChild(child))
    .map(child => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        transformJSXService(child);
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

function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0;
}
function getAttrProps(path: NodePath<t.JSXElement>): Record<string, any> {
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
              transformJSXService(expression);
              props[name] = expression.node;
            } else if (expression.isExpression()) {
              hasExpression = true;
              if (/^key|ref|on.+$/.test(name)) {
                props[name] = expression.node;
              } else if (/^bind:.+/.test(name)) {
                const value = path.scope.generateUidIdentifier('value');
                const bindName = name.slice(5).toLocaleLowerCase();
                props[bindName] = expression.node;
                props[`update${capitalizeFirstLetter(bindName)}`] = t.arrowFunctionExpression(
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
            transformJSXService(value);
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
