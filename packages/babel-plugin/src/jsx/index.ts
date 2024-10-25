import { types as t } from '@babel/core';
import { capitalize, isArray } from '@estjs/shared';
import { imports } from '../program';
import {
  type JSXChild,
  type JSXElement,
  getAttrName,
  getTagName,
  hasSiblingElement,
  isComponent as isComponentName,
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

let isSSG = false;

function addToTemplate(result: Result, content: string, join = false): void {
  if (isSSG) {
    if (join && result.template.length > 0) {
      (result.template as string[])[result.template.length - 1] += content;
    } else {
      (result.template as string[]).push(content);
    }
  } else {
    result.template += content;
  }
}

export function transformJSX(path: NodePath<JSXElement>): void {
  const state: State = path.state;
  isSSG = state.opts.ssg;

  const result: Result = {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: isSSG ? [] : '',
  };
  transformJSXElement(path, result, true);

  path.replaceWith(createEssorNode(path, result));
}
// Trim and replace multiple spaces/newlines with a single space
function replaceSpace(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

function createEssorNode(path: NodePath<JSXElement>, result: Result): t.CallExpression {
  const state: State = path.state;
  const isComponent = path.isJSXElement() && isComponentName(getTagName(path.node));

  const tmpl = isComponent
    ? t.identifier(getTagName(path.node))
    : path.scope.generateUidIdentifier('_tmpl$');

  if (!isComponent) {
    const template = isSSG
      ? t.arrayExpression((result.template as string[]).map(t.stringLiteral))
      : t.callExpression(state.template, [t.stringLiteral(result.template as string)]);
    state.tmplDeclaration.declarations.push(t.variableDeclarator(tmpl, template));
    if (!isSSG) {
      imports.add('template');
    }
  }

  const key = result.props.key;
  delete result.props.key;

  const args = [tmpl, createProps(result.props)];
  if (key) {
    args.push(key);
  }

  const fnName = isSSG ? 'ssg' : 'h';
  imports.add(fnName);
  return t.callExpression(state[fnName], args);
}

function createProps(props: Record<string, any>): t.ObjectExpression {
  const toAstNode = value => {
    if (isArray(value)) {
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
      case undefined:
        return t.tsUndefinedKeyword();
      case null:
        return t.nullLiteral();
      default:
        return value;
    }
  };

  const result = Object.entries(props).map(([prop, value]) =>
    prop === '_$spread$'
      ? t.spreadElement(toAstNode(value))
      : t.objectProperty(t.stringLiteral(prop), toAstNode(value)),
  );

  return t.objectExpression(result);
}

function transformJSXElement(
  path: NodePath<JSXElement>,
  result: Result,
  isRoot: boolean = false,
): void {
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const tagIsComponent = isComponentName(tagName);
    const isSelfClose = !tagIsComponent && selfClosingTags.includes(tagName);
    const isSvg = svgTags.includes(tagName) && result.index === 1;
    const { props, hasExpression } = getAttrProps(path);

    //  key
    if (props.key) {
      result.props.key = props.key;
      delete props.key;
    }

    if (tagIsComponent) {
      handleComponentElement(path, result, isRoot, props);
    } else {
      handleHTMLElement(path, result, tagName, isSelfClose, isSvg, props, hasExpression);
    }
  } else {
    result.index--;
    transformChildren(path, result);
  }
}

function handleComponentElement(
  path: NodePath<JSXElement>,
  result: Result,
  isRoot: boolean,
  props: Record<string, any>,
): void {
  if (isRoot) {
    result.props = props;
    const children = getChildren(path);
    if (children.length > 0) {
      const childrenGenerator =
        children.length === 1 ? children[0] : t.arrayExpression(children as JSXElement[]);

      // Check if children is a conditional expression
      if (t.isConditionalExpression(childrenGenerator)) {
        result.props.children = t.arrowFunctionExpression([], childrenGenerator);
      } else {
        result.props.children = childrenGenerator;
      }
    }
  } else {
    transformJSX(path);
    replaceChild(path.node, result);
  }
}

function handleHTMLElement(
  path: NodePath<JSXElement>,
  result: Result,
  tagName: string,
  isSelfClose: boolean,
  isSvg: boolean,
  props: Record<string, any>,
  hasExpression: boolean,
): void {
  if (isSvg) {
    result.template = isSSG ? [`<svg _svg_  data-hk="${result.index}">`] : `<svg _svg_ >`;
  }

  addToTemplate(result, `<${tagName}${isSSG ? ` data-hk="${result.index}"` : ''}`, true);
  handleAttributes(props, result);
  addToTemplate(result, isSelfClose ? '/>' : '>', !hasExpression);

  if (!isSelfClose) {
    transformChildren(path, result);
    if (hasSiblingElement(path) || isSSG) {
      addToTemplate(result, `</${tagName}>`);
    }
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
      addToTemplate(result, `${expression.node.value}`, true);
    } else if (expression.isExpression()) {
      replaceChild(expression.node, result);
    } else if (t.isJSXEmptyExpression(expression.node)) {
      // it is empty expression
      // just for tracking value
    } else {
      throw new Error('Unsupported child type');
    }
  } else if (child.isJSXText()) {
    addToTemplate(result, replaceSpace(child.node), true);
  } else {
    throw new Error('Unsupported child type');
  }
}
function getNodeText(path: NodePath<JSXChild>): string {
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

function isStyleClassName(name: string): name is 'style' | 'class' {
  return name === 'class' || name === 'style';
}

function handleAttributes(props: Record<string, any>, result: Result): void {
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
      addToTemplate(result, ` ${prop}`);
      delete props[prop];
    } else if (value === false) {
      delete props[prop];
    } else if (typeof value === 'string' || typeof value === 'number') {
      addToTemplate(result, ` ${prop}="${value}"`);
      delete props[prop];
    } else if (t.isConditionalExpression(value)) {
      props[prop] = t.arrowFunctionExpression([], value);
    } else if (t.isObjectExpression(value)) {
      const val = handleObjectExpression(prop, value, props, isStyleClassName(prop));
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
    result.props[result.index] = props;
  }

  if (klass.trim()) {
    addToTemplate(result, ` class="${klass.trim()}"`);
  }
  if (style.trim()) {
    addToTemplate(result, ` style="${style.trim()}"`);
  }
}

function handleObjectExpression(
  prop: string,
  value: t.ObjectExpression,
  props: Record<string, any>,
  isCt = false,
): string {
  let ct = '';
  const hasConditional = value.properties.some(
    property => t.isObjectProperty(property) && t.isConditionalExpression(property.value),
  );

  if (hasConditional) {
    props[prop] = t.arrowFunctionExpression([], value);
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
        child.replaceWith(t.stringLiteral(replaceSpace(child.node)));
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

