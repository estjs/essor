/**
 * Node Type Enum
 * @description Defines the types of different nodes in the JSX tree, used for internal processing and optimization.
 */
export enum NODE_TYPE {
  // normal
  NORMAL = 0,
  // component
  COMPONENT = 1,
  // text
  TEXT = 2,
  // fragment
  FRAGMENT = 3,
  // expression
  EXPRESSION = 4,
  // svg
  SVG = 5,
  // comment
  COMMENT = 6,
}

/**
 * Element Flags Enum
 * @description Defines special flags for HTML elements, used for rendering optimization.
 */
export enum ELEMENT_FLAGS {
  // Self-closing tag (e.g. <img />)
  SELF_CLOSING = 0,
  // Within SVG scope (e.g. <svg><path/></svg>)
  IN_SVG_SCOPE = 1,
}

/**
 * Key name for the CSS class attribute
 */
export const CLASS_NAME = 'class';

/**
 * Key name for the Style attribute
 */
export const STYLE_NAME = 'style';

/**
 * Prefix for event attributes
 */
export const EVENT_ATTR_NAME = 'on';

/**
 * Tag name for Fragment components
 */
export const FRAGMENT_NAME = 'Fragment';

/**
 * data-idx regex for hydration
 */
export const DATA_IDX_REGEX = /^\d+-\d+$/;
