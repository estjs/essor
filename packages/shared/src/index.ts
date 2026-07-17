// Utility function exports
export {
  noop,
  extend,
  hasChanged,
  coerceArray,
  hasOwn,
  isOn,
  generateUniqueId,
  isBrowser,
  cacheStringFunction,
  EMPTY_OBJ,
  EMPTY_ARR,
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
  isNull,
  isPromise,
  isSymbol,
  isFalsy,
  isPlainObject,
  isPrimitive,
  isHTMLElement,
  isStringNumber,
  isNumber,
  isUndefined,
  isBoolean,
  isNaN,
  isBigint,
  isDate,
  isRegExp,
  type StringNumber,
} from './is';

export { camelCase, kebabCase, capitalize, startsWith } from './string';

export { warn, info, error } from './logger';

export { isUrlAttribute, isUnsafeUrl } from './url';

export { escapeHTML, escapeHTMLComment, getEscapedCssVarName } from './escape';
export {
  isHTMLTag,
  isSVGTag,
  isMathMLTag,
  isSelfClosingTag,
  HYDRATION_ANCHOR_ATTR,
  HYDRATION_RANGE_START_PREFIX,
  SPREAD_NAME,
} from './dom';
export {
  isKnownSvgAttr,
  isKnownHtmlAttr,
  isSSRSafeAttrName,
  includeBooleanAttr,
  propsToAttrMap,
  isSpecialBooleanAttr,
  isDelegatedEvent,
  isBooleanAttr,
} from './dom';

// DOM type guards
export {
  isHtmlInputElement,
  isHtmlSelectElement,
  isHtmlTextAreaElement,
  isHtmlFormElement,
  isTextNode,
  isNode,
} from './dom-types';

// Normalization utilities
export {
  normalizeStyle,
  normalizeClassName,
  styleToString,
  parseStyleString,
  type NormalizedStyle,
  type StyleValue,
  type ClassValue,
} from './normalize';
