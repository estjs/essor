import { types as t } from '@babel/core';
import { capitalizeFirstLetter } from '@essor/shared';
import { imports } from '../program';
import {
  type JSXChild,
  type JSXElement,
  getAttrName,
  getTagName,
  hasSiblingElement,
  isComponent,
  isTextChild,
  setNodeText,
} from '../shared';
import { selfClosingTags, svgTags } from './constants';
import type { Identifier, OptionalMemberExpression, StringLiteral } from '@babel/types';
import type { State } from '../types';
import type { NodePath } from '@babel/core';

export interface Result {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
  template: string | string[];
}
let isSsg = false;

function addToTemplate(result: Result, content: string): void {
  if (isSsg) {
    (result.template as string[]).push(content);
  } else {
    result.template += content;
  }
}
export function transformJSX(path: NodePath<JSXElement>): void {
  const state: State = path.state;
  isSsg = state.opts.ssg;

  const result: Result = {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: isSsg ? [] : '',
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

    const template = isSsg
      ? t.arrayExpression((result.template as string[]).map(t.stringLiteral))
      : t.callExpression(state.template, [t.stringLiteral(result.template as string)]);
    const declarator = t.variableDeclarator(tmpl, template);
    state.tmplDeclaration.declarations.push(declarator);
    if (!isSsg) {
      imports.add('template');
    }
  }

  const args = [tmpl, createProps(result.props)];
  const key = result.props.key || result.props[0]?.key;
  if (key) {
    args.push(key);
  }
  imports.add(isSsg ? 'renderTemplate' : 'h');
  return t.callExpression(isSsg ? state.renderTemplate : state.h, args);
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
        transformJSX(path);
        replaceChild(path.node, result);
      }
    } else {
      if (isSvg) {
        result.template = isSsg ? ['<svg _svg_>'] : '<svg _svg_>';
      }

      addToTemplate(result, `<${tagName}`);
      handleAttributes(props, result);
      addToTemplate(result, isSelfClose ? '/>' : '>');
      if (!isSelfClose) {
        transformChildren(path, result);

        if (hasSiblingElement(path)) {
          addToTemplate(result, `</${tagName}>`);
        }
      }
    }
  } else {
    result.index--;
    transformChildren(path, result);
  }
}

function transformChildren(path: NodePath<JSXElement>, result: Result): void {
  const parentIndex = isSsg ? result.template.length : result.index;
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
      addToTemplate(result, String(expression.node.value));
    } else if (expression.isExpression()) {
      replaceChild(expression.node, result);
    } else if (t.isJSXEmptyExpression(expression.node)) {
      // it is empty expression
      // do nothing
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    addToTemplate(result, String(child.node.value));
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

function handleAttributes(props: Record<string, any>, result: Result): void {
  let klass = '';
  let style = '';

  for (const prop in props) {
    let value = props[prop];

    if (prop === 'class' && typeof value === 'string') {
      klass += ` ${value}`;
      delete props[prop];
      continue;
    }

    if (prop === 'style' && typeof value === 'string') {
      style += `${value}${value.at(-1) === ';' ? '' : ';'}`;
      delete props[prop];
      continue;
    }

    if (value === true) {
      addToTemplate(result, ` ${prop}`);
      delete props[prop];
    }
    if (value === false) {
      delete props[prop];
    }
    if (typeof value === 'string' || typeof value === 'number') {
      addToTemplate(result, ` ${prop}="${value}"`);
      delete props[prop];
    }

    // if value is conditional expression
    if (t.isConditionalExpression(value)) {
      const { test, consequent, alternate } = value;
      value = t.arrowFunctionExpression([], t.conditionalExpression(test, consequent, alternate));
      props[prop] = value;
    }

    // if value is object expression and has conditional
    if (t.isObjectExpression(value)) {
      let hasConditional = false;
      value.properties.forEach(property => {
        if (t.isObjectProperty(property) && t.isConditionalExpression(property.value)) {
          hasConditional = true;
        }
      });
      if (hasConditional) {
        value = t.arrowFunctionExpression([], value);
        props[prop] = value;
      } else {
        // TODO: For the time being, only support style
        if (prop === 'style') {
          value.properties.forEach(property => {
            if (t.isObjectProperty(property)) {
              style += `${(property.key as Identifier).name}:${(property.value as StringLiteral).value};`;
            }
          });

          delete props[prop];
        }
      }
    }
  }

  if (Object.keys(props).length > 0) {
    result.props[result.index] = props;
  }

  klass = klass.trim();
  style = style.trim();

  if (klass) {
    addToTemplate(result, ` class="${klass}"`);
  }
  if (style) {
    addToTemplate(result, ` style="${style}"`);
  }
}

function replaceChild(node: t.Expression, result: Result): void {
  if (result.isLastChild) {
    result.index--;
  } else {
    addToTemplate(result, '<!>');
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
        transformJSX(child);
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
              transformJSX(expression);
              props[name] = expression.node;
            } else if (expression.isExpression()) {
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
            transformJSX(value);
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
