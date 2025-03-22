// 工具函数导出
export {
  noop,
  extend,
  hasChanged,
  coerceArray,
  hasOwn,
  startsWith,
  isExclude,
  isOn,
  generateUniqueId,
  isBrowser,
  cacheStringFunction,
  EMPTY_OBJ,
  EMPTY_ARR,
  ExcludeType,
  getGlobalThis,
} from './base';

export {
  isString,
  isObject,
  isArray,
  isMap,
  isSet,
  isWeakMap,
  isWeakSet,
  isFunction,
  isNil,
  isPromise,
  isSymbol,
  isFalsy,
  isPlainObject,
  isPrimitive,
  isHTMLElement,
  isStringNumber,
  type StringNumber,
} from './is';

export { camelCase, kebabCase, capitalize } from './string';

export { warn, info, error } from './logger';

export { escapeHTML, escapeHTMLComment, getEscapedCssVarName } from './escape';
export { isHTMLTag, isSVGTag, isMathMLTag, isVoidTag, isSelfClosingTag } from './dom';
export {
  isRenderAbleAttrValue,
  isKnownSvgAttr,
  isKnownHtmlAttr,
  isSSRSafeAttrName,
  includeBooleanAttr,
  propsToAttrMap,
  isSpecialBooleanAttr,
  isBooleanAttr,
} from './dom';
