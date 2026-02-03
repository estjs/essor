/**
 * event prefix, used to distinguish event handler properties
 */
export const EVENT_PREFIX = 'on';

/**
 * update prefix, used to identify update callback properties
 */
export const UPDATE_PREFIX = 'update';

/**
 * children property name
 */
export const CHILDREN_PROP = 'children';
/**
 * Key name for the Spread attribute
 */
export const SPREAD_NAME = '_$spread$';

/**
 * used to get the DOM element reference
 */
export const REF_KEY = 'ref';
/**
 * Component key property name
 */
export const KEY_PROP = 'key' as const;

/**
 * SVG namespace constant
 */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * XML namespace for xlink attributes
 */
export const XLINK_NAMESPACE = 'http://www.w3.org/2000/xlink';

/**
 * xmlns namespace for SVG elements
 */
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

/**
 * Defines various states of components for state management and debugging
 */
export enum COMPONENT_STATE {
  /** Initial state */
  INITIAL,
  /** Mounting */
  MOUNTING,
  /** MOUNTED */
  MOUNTED,
  /** Updating */
  UPDATING,
  /** Destroying */
  DESTROYING,
  /** destroy */
  DESTROYED,
}

export const NORMAL_COMPONENT = Symbol(__DEV__ ? 'Normal Component' : '');
export const FRAGMENT_COMPONENT = Symbol(__DEV__ ? 'Fragment Component' : '');
export const PORTAL_COMPONENT = Symbol(__DEV__ ? 'Portal Component' : '');
export const SUSPENSE_COMPONENT = Symbol(__DEV__ ? 'Suspense Component' : '');
