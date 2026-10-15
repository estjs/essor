/**
 * Client + hydrate code generation.
 *
 * Implements fine-grained DOM templates, reactive bindings, navigation planning,
 * merged memoEffects, and hydration range tracking.
 */
import * as t from '@babel/types';
import {
  HYDRATION_ANCHOR_ATTR,
  SPREAD_NAME,
  escapeHTML,
  isDelegatedEvent,
  isSelfClosingTag,
  startsWith,
} from '@estjs/shared';
import { isWholeTextTag, serializeStaticWholeText } from '../shared/text';
import { UNIVERSAL_BUILTINS } from '../constants';
import { createBindingSetter, unwrapBindTuple } from '../shared/bind';
import { parseJSX } from '../parse';
import { serializeStaticAttrs } from './shared';
import type {
  CompileContext,
  CompileMode,
  IRBind,
  IRDynamicProp,
  IRElement,
  IREvent,
  IRNode,
  IRRef,
  IRSpread,
  IRStaticProp,
} from '../types';

const HMR_COMPONENT_NAME = '__$createHMRComponent$__';
const MEMO_STATE_ID = '_p$';
const MEMO_NEXT_VALUE_ID = '_v$';

export type DynamicAnchorKind = 'comment' | 'element' | 'tail';

interface FlatNode {
  id: number;
  kind: 'element' | 'text' | 'anchor';
  irElement?: IRElement;
  dynamicChild?: IRNode;
  anchorKind?: DynamicAnchorKind;
  markerIndex?: number;
  staticIndex?: number;
  parentId: number;
  childIndex: number;
  domChildIndex: number;
  needsRef: boolean;
  wholeTextChildren?: IRNode[];
}

interface NavStep {
  nodeId: number;
  fromNodeId: number;
}

interface ChildNavStep extends NavStep {
  type: 'child';
}

interface IndexedNavStep extends NavStep {
  type: 'next' | 'nthChild';
  index: number;
}

interface HydrationNavStep extends NavStep {
  type: 'hydrationMarker' | 'hydrationAnchor';
  index: number;
}

type NavigationStep = ChildNavStep | IndexedNavStep | HydrationNavStep;

interface GenState {
  ctx: CompileContext;
  mode: CompileMode;
  effectIndex: number;
}

interface PendingMemoPatch {
  effectKey: string;
  target: t.Expression;
  attrName: string;
  value: t.Expression;
  isSVG?: boolean;
}

type NodeVarMap = Map<number, t.Identifier>;

// ===== Tag Helpers =====

function openTag(tag: string, attrs: string): string {
  return `<${tag}${attrs}>`;
}

function selfClosingTag(tag: string, attrs: string): string {
  return `<${tag}${attrs} />`;
}

function shouldCloseTag(
  tag: string,
  isLastElement: boolean,
  hasClosingParent: boolean,
  omitClosingTags: boolean,
): boolean {
  return !isSelfClosingTag(tag) && (!omitClosingTags || !isLastElement || hasClosingParent);
}

function closeTag(
  tag: string,
  isLastElement: boolean,
  hasClosingParent: boolean,
  omitClosingTags: boolean,
): string {
  return shouldCloseTag(tag, isLastElement, hasClosingParent, omitClosingTags) ? `</${tag}>` : '';
}

// ===== Dynamic Boundary & Anchors =====

function isDynamicChild(node: IRNode): boolean {
  if (node.type === 'expression') return true;
  if (node.type === 'element') {
    return node.isComponent || node.importName === 'For' || node.tag === 'For';
  }
  return false;
}

function hasDynamicBoundary(children: IRNode[], index: number): boolean {
  const prev = children[index - 1];
  const next = children[index + 1];
  const isText = (n: IRNode | undefined) => n?.type === 'text';
  const isDynamic = (n: IRNode | undefined) => n != null && isDynamicChild(n);
  return isText(prev) || isText(next) || isDynamic(prev) || isDynamic(next);
}

export function getDynamicAnchorKind(
  children: IRNode[],
  index: number,
  mode: CompileMode,
): DynamicAnchorKind {
  if (!hasDynamicBoundary(children, index)) {
    const next = children[index + 1];
    if (
      (mode === 'hydrate' || mode === 'server') &&
      next?.type === 'element' &&
      !next.isComponent
    ) {
      return 'element';
    }
    if (!next) {
      return 'tail';
    }
  }
  return 'comment';
}

function findLastOmittableElementIndex(children: IRNode[], mode: CompileMode): number {
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!child) continue;
    if (child.type === 'element' && !child.isComponent) {
      return i;
    }
    if (isDynamicChild(child)) {
      if (getDynamicAnchorKind(children, i, mode) === 'tail') continue;
      return -1;
    }
    return -1;
  }
  return -1;
}

function hasOwnEffects(element: IRElement): boolean {
  const { props } = element;
  return (
    props.dynamic.some((p) => !p.isOverridden) ||
    props.events.length > 0 ||
    props.binds.length > 0 ||
    props.spreads.length > 0 ||
    props.ref != null
  );
}

function isStaticSubtree(node: IRNode): boolean {
  if (node.type === 'text') return true;
  if (node.type !== 'element') return false;
  if (node.isComponent || node.isDynamic) return false;
  if (hasOwnEffects(node)) return false;
  return node.children.every(isStaticSubtree);
}

function buildStaticTemplateString(
  element: IRElement,
  mode: CompileMode,
  omitClosingTags = false,
  isLast = true,
  hasClosingParent = false,
): string {
  const attrs = serializeStaticAttrs(element.props.static);
  if (isSelfClosingTag(element.tag)) {
    return selfClosingTag(element.tag, attrs);
  }

  const closes = shouldCloseTag(element.tag, isLast, hasClosingParent, omitClosingTags);
  let html = openTag(element.tag, attrs);

  if (isWholeTextTag(element.tag)) {
    const text = element.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
    html += serializeStaticWholeText(element.tag, text);
    html += closeTag(element.tag, isLast, hasClosingParent, omitClosingTags);
    return html;
  }

  const lastIndex = findLastOmittableElementIndex(element.children, mode);
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (child.type === 'text') {
      html += mode === 'hydrate' ? child.value : escapeHTML(child.value);
    } else if (child.type === 'element') {
      html += buildStaticTemplateString(child, mode, omitClosingTags, i === lastIndex, closes);
    }
  }

  html += closeTag(element.tag, isLast, hasClosingParent, omitClosingTags);
  return html;
}

// ===== Whole-text Part Detection =====

function getDynamicWholeTextParts(element: IRElement): IRNode[] | null {
  if (!isWholeTextTag(element.tag)) return null;
  const hasDynamic = element.children.some((c) => c.type === 'expression');
  return hasDynamic ? element.children : null;
}

// ===== Template Building + Node Flattening =====

function buildTemplateAndFlatten(
  root: IRElement,
  mode: CompileMode,
  omitClosingTags = false,
): { template: string; nodes: FlatNode[] } {
  const nodes: FlatNode[] = [];
  let template = '';
  let nextId = 0;

  function visit(
    element: IRElement,
    parentId: number,
    childIndex: number,
    forcedStaticIndex?: number,
    isLastElement = false,
    hasClosingParent = false,
  ): void {
    const myId = nextId++;
    const staticAttrsList =
      mode === 'hydrate' && forcedStaticIndex !== undefined
        ? [
            ...element.props.static,
            {
              name: HYDRATION_ANCHOR_ATTR,
              value: t.stringLiteral(String(forcedStaticIndex)),
              order: 9999,
            },
          ]
        : element.props.static;
    const attrs = serializeStaticAttrs(staticAttrsList);

    if (isSelfClosingTag(element.tag)) {
      template += selfClosingTag(element.tag, attrs);
      nodes.push({
        id: myId,
        kind: 'element',
        irElement: element,
        staticIndex: forcedStaticIndex,
        parentId,
        childIndex,
        domChildIndex: childIndex,
        needsRef: hasOwnEffects(element),
      });
      return;
    }

    const closes = shouldCloseTag(element.tag, isLastElement, hasClosingParent, omitClosingTags);
    template += openTag(element.tag, attrs);

    const hasDynamic = element.children.some(isDynamicChild);
    const wholeTextChildren = getDynamicWholeTextParts(element);

    nodes.push({
      id: myId,
      kind: 'element',
      irElement: element,
      staticIndex: forcedStaticIndex,
      parentId,
      childIndex,
      domChildIndex: childIndex,
      needsRef: hasOwnEffects(element) || hasDynamic,
      wholeTextChildren: wholeTextChildren ?? undefined,
    });

    if (wholeTextChildren) {
      template += closeTag(element.tag, isLastElement, hasClosingParent, omitClosingTags);
      return;
    }

    if (isWholeTextTag(element.tag)) {
      const text = element.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
      template += serializeStaticWholeText(element.tag, text);
      template += closeTag(element.tag, isLastElement, hasClosingParent, omitClosingTags);
      return;
    }

    let templateChildIndex = 0;
    let domChildIndex = 0;
    let markerIndex = 0;
    let pendingAnchorIndex: number | undefined;
    const lastElementIndex = findLastOmittableElementIndex(element.children, mode);

    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      if (child.type === 'text') {
        template += mode === 'hydrate' ? child.value : escapeHTML(child.value);
        nodes.push({
          id: nextId++,
          kind: 'text',
          parentId: myId,
          childIndex: templateChildIndex++,
          domChildIndex: domChildIndex++,
          needsRef: false,
        });
      } else if (child.type === 'element' && !child.isComponent) {
        visit(
          child,
          myId,
          templateChildIndex++,
          pendingAnchorIndex,
          i === lastElementIndex,
          closes,
        );
        domChildIndex++;
        pendingAnchorIndex = undefined;
      } else if (isDynamicChild(child)) {
        const anchorKind = getDynamicAnchorKind(element.children, i, mode);
        const index = markerIndex++;
        if (anchorKind === 'comment') {
          template += '<!>';
        } else if (anchorKind === 'element') {
          pendingAnchorIndex = index;
        }

        nodes.push({
          id: nextId++,
          kind: 'anchor',
          dynamicChild: child,
          anchorKind,
          markerIndex: index,
          parentId: myId,
          childIndex: templateChildIndex,
          domChildIndex,
          needsRef: true,
        });

        if (anchorKind === 'comment') {
          templateChildIndex++;
          domChildIndex++;
        } else {
          domChildIndex++;
        }
      }
    }

    template += closeTag(element.tag, isLastElement, hasClosingParent, omitClosingTags);
  }

  visit(root, -1, 0, undefined, true, false);
  return { template, nodes };
}

// ===== Navigation Planner =====

function planNavigation(nodes: FlatNode[], mode: CompileMode): NavigationStep[] {
  const steps: NavigationStep[] = [];
  const navigated = new Set<number>();
  navigated.add(0);

  const nodeMap = new Map<number, FlatNode>();
  const siblingMap = new Map<number, Map<number, FlatNode[]>>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    if (node.parentId !== -1) {
      if (!siblingMap.has(node.parentId)) {
        siblingMap.set(node.parentId, new Map());
      }
      const siblings = siblingMap.get(node.parentId)!;
      const bucket = siblings.get(node.childIndex);
      if (bucket) {
        bucket.push(node);
      } else {
        siblings.set(node.childIndex, [node]);
      }
    }
  }

  function ensureNavigated(node: FlatNode): void {
    if (navigated.has(node.id)) return;

    if (node.parentId >= 0 && !navigated.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId);
      if (parent) ensureNavigated(parent);
    }

    if (mode === 'hydrate' && node.kind === 'anchor') {
      if (node.anchorKind === 'tail') {
        navigated.add(node.id);
        return;
      }
      steps.push({
        nodeId: node.id,
        type: node.anchorKind === 'element' ? 'hydrationAnchor' : 'hydrationMarker',
        fromNodeId: node.parentId,
        index: node.markerIndex ?? 0,
      });
      navigated.add(node.id);
      return;
    }

    if (mode === 'hydrate' && node.kind === 'element' && node.staticIndex !== undefined) {
      steps.push({
        nodeId: node.id,
        type: 'hydrationAnchor',
        fromNodeId: node.parentId,
        index: node.staticIndex,
      });
      navigated.add(node.id);
      return;
    }

    if (node.childIndex === 0) {
      steps.push({
        nodeId: node.id,
        type: 'child',
        fromNodeId: node.parentId,
      });
      navigated.add(node.id);
      return;
    }

    const parentSiblings = siblingMap.get(node.parentId);
    let prevNav: FlatNode | null = null;

    if (parentSiblings) {
      for (let i = node.childIndex - 1; i >= 0; i--) {
        const siblings = parentSiblings.get(i);
        if (!siblings) continue;

        for (let j = siblings.length - 1; j >= 0; j--) {
          const sib = siblings[j];
          if (sib && mode === 'hydrate' && sib.kind === 'anchor') {
            ensureNavigated(sib);
            prevNav = sib;
            break;
          }
          if (sib && navigated.has(sib.id)) {
            prevNav = sib;
            break;
          }
        }
        if (prevNav) break;
      }
    }

    if (prevNav) {
      steps.push({
        nodeId: node.id,
        type: 'next',
        fromNodeId: prevNav.id,
        index: node.domChildIndex - prevNav.domChildIndex,
      });
      navigated.add(node.id);
      return;
    }

    steps.push({
      nodeId: node.id,
      type: 'nthChild',
      fromNodeId: node.parentId,
      index: node.domChildIndex,
    });
    navigated.add(node.id);
  }

  for (const node of nodes) {
    if (node.id === 0) continue;
    if (!node.needsRef) continue;
    ensureNavigated(node);
  }

  return steps;
}

function createNavigationExpression(
  step: NavigationStep,
  fromExpr: t.Expression,
  ctx: CompileContext,
): t.Expression {
  if (step.type === 'child') {
    return t.callExpression(ctx.imports.get('child'), [fromExpr]);
  }
  if (step.type === 'nthChild') {
    return t.callExpression(ctx.imports.get('nthChild'), [fromExpr, t.numericLiteral(step.index)]);
  }
  if (step.type === 'hydrationMarker') {
    return t.callExpression(ctx.imports.get('hydrationMarker'), [
      fromExpr,
      t.numericLiteral(step.index),
    ]);
  }
  if (step.type === 'hydrationAnchor') {
    return t.callExpression(ctx.imports.get('hydrationAnchor'), [
      fromExpr,
      t.numericLiteral(step.index),
    ]);
  }
  return t.callExpression(ctx.imports.get('next'), [fromExpr, t.numericLiteral(step.index)]);
}

// ===== Code Generation =====

export function generateClient(ir: IRNode, ctx: CompileContext): t.Expression {
  const state: GenState = {
    ctx,
    mode: ctx.mode,
    effectIndex: 0,
  };

  return generateNode(ir, state);
}

function generateNode(node: IRNode, state: GenState): t.Expression {
  switch (node.type) {
    case 'element':
      if (node.importName === 'For' || node.tag === 'For') {
        return generateFor(node, state);
      }
      return node.isComponent ? generateComponent(node, state) : generateElement(node, state);
    case 'fragment':
      return t.arrayExpression(node.children.map((child) => generateNode(child, state)));
    case 'text':
      return t.stringLiteral(node.value);
    case 'expression':
      return t.cloneNode(node.node, true);
  }
}

function generateElement(node: IRElement, state: GenState): t.Expression {
  const { mode, ctx } = state;

  if (isStaticSubtree(node)) {
    const tmplId = ctx.templates.register(
      buildStaticTemplateString(node, mode, ctx.options.omitClosingTags ?? true),
      node.isSVG,
    );
    return t.callExpression(tmplId, []);
  }

  const { template, nodes: flatNodes } = buildTemplateAndFlatten(
    node,
    mode,
    ctx.options.omitClosingTags ?? true,
  );
  const navSteps = planNavigation(flatNodes, mode);

  const body: t.Statement[] = [];
  const tmplId = ctx.templates.register(template, node.isSVG);
  const elId = ctx.uids.generate('el$');
  body.push(
    t.variableDeclaration('const', [t.variableDeclarator(elId, t.callExpression(tmplId, []))]),
  );

  const varMap: NodeVarMap = new Map();
  varMap.set(0, elId);

  // Phase 1: Navigation
  emitNavigationDeclarations(navSteps, varMap, elId, body, ctx);

  // Phase 2: Effects (events, refs, binds, attrs, spreads)
  const pendingMemoPatches: PendingMemoPatch[] = [];
  emitElementEffects(flatNodes, varMap, state, body, pendingMemoPatches);
  emitMergedMemoEffect(pendingMemoPatches, body, ctx);

  // Phase 3: Dynamic child insertions
  emitDynamicChildInserts(flatNodes, varMap, state, body);

  body.push(t.returnStatement(elId));
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
}

function emitNavigationDeclarations(
  steps: NavigationStep[],
  varMap: NodeVarMap,
  elId: t.Identifier,
  body: t.Statement[],
  ctx: CompileContext,
): void {
  for (const step of steps) {
    const isHydration = step.type === 'hydrationMarker' || step.type === 'hydrationAnchor';
    const varName = ctx.uids.generate(isHydration ? 'hk$' : 'n$');
    const fromExpr = varMap.get(step.fromNodeId) ?? elId;
    const navExpr = createNavigationExpression(step, fromExpr, ctx);

    body.push(t.variableDeclaration('const', [t.variableDeclarator(varName, navExpr)]));
    varMap.set(step.nodeId, varName);
  }
}

type ElementOperation =
  | { kind: 'event'; order: number; event: IREvent }
  | { kind: 'ref'; order: number; ref: IRRef }
  | { kind: 'bind'; order: number; bind: IRBind }
  | { kind: 'attr'; order: number; attr: IRDynamicProp }
  | { kind: 'spread'; order: number; spread: IRSpread };

function emitElementEffects(
  flatNodes: FlatNode[],
  varMap: NodeVarMap,
  state: GenState,
  body: t.Statement[],
  pendingMemoPatches: PendingMemoPatch[],
): void {
  for (const flatNode of flatNodes) {
    if (flatNode.kind !== 'element' || !flatNode.irElement) continue;

    const target = varMap.get(flatNode.id);
    if (!target) continue;

    emitElementEffect(flatNode.irElement, target, state, body, pendingMemoPatches);
  }
}

function emitElementEffect(
  element: IRElement,
  target: t.Expression,
  state: GenState,
  body: t.Statement[],
  pendingMemoPatches: PendingMemoPatch[],
): void {
  const { props } = element;
  const operations: ElementOperation[] = [];

  for (const event of props.events) {
    operations.push({ kind: 'event', order: event.order, event });
  }
  if (props.ref) {
    operations.push({ kind: 'ref', order: props.ref.order, ref: props.ref });
  }
  for (const bind of props.binds) {
    operations.push({ kind: 'bind', order: bind.order, bind });
  }
  for (const attr of props.dynamic) {
    if (attr.isOverridden) continue;
    operations.push({ kind: 'attr', order: attr.order, attr });
  }
  for (const spread of props.spreads) {
    operations.push({ kind: 'spread', order: spread.order, spread });
  }

  operations.sort((a, b) => a.order - b.order);

  for (const op of operations) {
    switch (op.kind) {
      case 'event':
        emitEvent(op.event, target, body, state.ctx);
        break;
      case 'ref':
        body.push(t.expressionStatement(createRefExpression(target, op.ref.value)));
        break;
      case 'bind':
        emitBind(op.bind, target, body, state.ctx);
        break;
      case 'attr':
        emitDynamicAttr(op.attr, target, body, state, pendingMemoPatches, element.isSVG);
        break;
      case 'spread':
        emitSpread(op.spread, target, body, state, pendingMemoPatches, element.isSVG);
        break;
    }
  }
}

function emitEvent(
  event: IREvent,
  target: t.Expression,
  body: t.Statement[],
  ctx: CompileContext,
): void {
  const eventName = event.name.startsWith('on')
    ? event.name.slice(2).toLowerCase()
    : event.name.toLowerCase();
  const delegated = isDelegatedEvent(eventName);

  if (delegated) {
    ctx.delegatedEvents?.add(eventName);
    body.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(target, t.stringLiteral(`_$${eventName}`), true),
          event.handler,
        ),
      ),
    );
  } else {
    body.push(
      t.expressionStatement(
        t.callExpression(ctx.imports.get('addEventListener'), [
          target,
          t.stringLiteral(eventName),
          event.handler,
        ]),
      ),
    );
  }
}

function createRefExpression(target: t.Expression, value: t.Expression): t.Expression {
  return t.callExpression(
    t.arrowFunctionExpression(
      [t.identifier('_r$')],
      t.conditionalExpression(
        t.binaryExpression(
          '===',
          t.unaryExpression('typeof', t.identifier('_r$')),
          t.stringLiteral('function'),
        ),
        t.callExpression(t.identifier('_r$'), [target]),
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('_r$'), t.identifier('value')),
          target,
        ),
      ),
    ),
    [value],
  );
}

function emitBind(
  bind: IRBind,
  target: t.Expression,
  body: t.Statement[],
  ctx: CompileContext,
): void {
  const { value: valueExpr, modifiers: modifiersArg } = unwrapBindTuple(bind.value, bind.name);

  const args: t.Expression[] = [
    target,
    t.stringLiteral(bind.name),
    t.arrowFunctionExpression([], t.cloneNode(valueExpr)),
    createBindingSetter(valueExpr, (hint) => ctx.uids.generate(hint), bind.name),
  ];
  if (modifiersArg) args.push(t.cloneNode(modifiersArg));

  body.push(t.expressionStatement(t.callExpression(ctx.imports.get('bindElement'), args)));
}

function getPatchHelperName(attrName: string): 'patchAttr' | 'patchClass' | 'patchStyle' {
  if (attrName === 'class' || attrName === 'className') return 'patchClass';
  if (attrName === 'style') return 'patchStyle';
  return 'patchAttr';
}

function createPatchCall(
  ctx: CompileContext,
  target: t.Expression,
  attrName: string,
  value: t.Expression,
  options: {
    previousValue?: t.Expression | null;
    nextValue?: t.Expression;
    isSVG?: boolean;
    includePreviousValuePlaceholder?: boolean;
  } = {},
): t.CallExpression {
  const helper = getPatchHelperName(attrName);
  const nextVal = options.nextValue ?? value;
  const isAttr = helper === 'patchAttr';
  const emitSVGFlag = helper === 'patchClass' && options.isSVG === true;

  const args: t.Expression[] = isAttr ? [target, t.stringLiteral(attrName)] : [target];

  if (options.previousValue != null || options.includePreviousValuePlaceholder || emitSVGFlag) {
    args.push(options.previousValue ?? t.identifier('undefined'));
  }

  args.push(nextVal);

  if (emitSVGFlag) {
    args.push(t.booleanLiteral(true));
  }

  return t.callExpression(ctx.imports.get(helper), args);
}

function createEffectKey(attrName: string, index: number): string {
  if (attrName === 'class' || attrName === 'className') return `c${index}`;
  if (attrName === 'style') return `s${index}`;
  return `a${index}`;
}

function createSpreadEffectKey(index: number): string {
  return `sp${index}`;
}

function isStaticAttrValue(node: t.Expression): boolean {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isIdentifier(node, { name: 'undefined' })
  );
}

function emitDynamicAttr(
  attr: IRDynamicProp,
  target: t.Expression,
  body: t.Statement[],
  state: GenState,
  pendingMemoPatches: PendingMemoPatch[],
  isSVG: boolean,
): void {
  const attrName = attr.name === 'className' ? 'class' : attr.name;
  if (isStaticAttrValue(attr.value)) {
    body.push(
      t.expressionStatement(createPatchCall(state.ctx, target, attrName, attr.value, { isSVG })),
    );
    return;
  }
  pendingMemoPatches.push({
    effectKey: createEffectKey(attr.name, state.effectIndex++),
    target,
    attrName,
    value: attr.value,
    isSVG,
  });
}

function emitSpread(
  spread: IRSpread,
  target: t.Expression,
  body: t.Statement[],
  state: GenState,
  pendingMemoPatches: PendingMemoPatch[],
  isSVG: boolean,
): void {
  pendingMemoPatches.push({
    effectKey: createSpreadEffectKey(state.effectIndex++),
    target,
    attrName: SPREAD_NAME,
    value: spread.value,
    isSVG,
  });
}

function emitMergedMemoEffect(
  patches: PendingMemoPatch[],
  body: t.Statement[],
  ctx: CompileContext,
): void {
  if (patches.length === 0) return;

  const memoStateId = t.identifier(MEMO_STATE_ID);
  const effectBody = patches.flatMap((patch) => createMemoPatchStatements(patch, memoStateId, ctx));
  effectBody.push(t.returnStatement(memoStateId));

  body.push(
    t.expressionStatement(
      t.callExpression(ctx.imports.get('memoEffect'), [
        t.arrowFunctionExpression([memoStateId], t.blockStatement(effectBody)),
        t.objectExpression(
          patches.map((patch) =>
            t.objectProperty(t.identifier(patch.effectKey), t.identifier('undefined')),
          ),
        ),
      ]),
    ),
  );
}

function createMemoPatchStatements(
  patch: PendingMemoPatch,
  memoStateId: t.Identifier,
  ctx: CompileContext,
): t.Statement[] {
  const effectState = t.memberExpression(memoStateId, t.identifier(patch.effectKey));
  const valueId = ctx.uids.generate(MEMO_NEXT_VALUE_ID);
  const updateCall = createPatchCall(ctx, patch.target, patch.attrName, valueId, {
    previousValue: effectState,
    nextValue: t.assignmentExpression('=', effectState, valueId),
    isSVG: patch.isSVG,
  });

  return [
    t.variableDeclaration('let', [t.variableDeclarator(valueId, t.cloneNode(patch.value, true))]),
    t.expressionStatement(
      t.logicalExpression('&&', t.binaryExpression('!==', valueId, effectState), updateCall),
    ),
  ];
}

// ===== Dynamic Child Inserts =====

function emitDynamicChildInserts(
  flatNodes: FlatNode[],
  varMap: NodeVarMap,
  state: GenState,
  body: t.Statement[],
): void {
  const { ctx, mode } = state;

  for (const flatNode of flatNodes) {
    if (flatNode.kind === 'element' && flatNode.wholeTextChildren) {
      const parent = varMap.get(flatNode.id);
      if (!parent) continue;
      const values = flatNode.wholeTextChildren.map((child) => {
        if (child.type === 'text') return t.stringLiteral(child.value);
        if (child.type === 'expression') return t.cloneNode(child.node, true);
        return t.nullLiteral();
      });
      body.push(
        t.expressionStatement(
          t.callExpression(ctx.imports.get('insertTextContent'), [
            parent,
            t.arrowFunctionExpression([], t.arrayExpression(values)),
          ]),
        ),
      );
      continue;
    }

    if (flatNode.kind !== 'anchor' || !flatNode.dynamicChild) continue;

    const parent = varMap.get(flatNode.parentId);
    const anchor = varMap.get(flatNode.id);
    if (!parent) continue;
    if (flatNode.anchorKind !== 'tail' && !anchor) continue;

    let range: t.Identifier | undefined;
    if (mode === 'hydrate' && flatNode.anchorKind) {
      range = ctx.uids.generate('hr$');
      body.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            range,
            t.callExpression(ctx.imports.get('hydrationRange'), [
              parent,
              t.numericLiteral(flatNode.markerIndex ?? 0),
              t.stringLiteral(flatNode.anchorKind),
            ]),
          ),
        ]),
      );
    }

    body.push(
      t.expressionStatement(createInsertCall(parent, flatNode.dynamicChild, anchor, state, range)),
    );
  }
}

function createInsertCall(
  parent: t.Expression,
  child: IRNode,
  anchor: t.Expression | undefined,
  state: GenState,
  range?: t.Expression,
): t.CallExpression {
  const { ctx } = state;

  if (child.type === 'element' && (child.importName === 'For' || child.tag === 'For')) {
    const insert = ctx.imports.get('insert');
    const args: t.Expression[] = [parent, generateFor(child, state)];
    if (range) args.push(anchor ?? t.identifier('undefined'), range);
    else if (anchor) args.push(anchor);
    return t.callExpression(insert, args);
  }

  const childExpr = createDynamicChildExpression(child, state);
  const args: t.Expression[] = [parent, childExpr];
  if (range) args.push(anchor ?? t.identifier('undefined'), range);
  else if (anchor) args.push(anchor);
  return t.callExpression(ctx.imports.get('insert'), args);
}

function createDynamicChildExpression(child: IRNode, state: GenState): t.Expression {
  switch (child.type) {
    case 'expression':
      return t.arrowFunctionExpression([], t.cloneNode(child.node, true));
    case 'element':
      return child.isComponent ? generateComponent(child, state) : generateElement(child, state);
    case 'fragment':
      return t.arrayExpression(child.children.map((c) => generateNode(c, state)));
    case 'text':
      return t.stringLiteral(child.value);
  }
}

// ===== Component Generation =====

function buildComponentTagExpression(tag: string): t.Expression {
  const [head, ...parts] = tag.split('.');
  return parts.reduce<t.Expression>(
    (expr, part) => t.memberExpression(expr, t.identifier(part)),
    t.identifier(head),
  );
}

function resolveComponentCallee(
  tag: string,
  importName: string | undefined,
  ctx: CompileContext,
): t.Expression {
  if (importName) {
    return ctx.imports.get(importName);
  }
  if (UNIVERSAL_BUILTINS.has(tag)) {
    return ctx.imports.get(tag);
  }
  return buildComponentTagExpression(tag);
}

function generateComponent(node: IRElement, state: GenState): t.Expression {
  const { ctx } = state;
  const isHMR = ctx.options.hmr && ctx.options.mode !== 'server';

  const renderedChildren = node.children
    .map((child) => generateNode(child, state))
    .filter((e) => e != null && !t.isNullLiteral(e));

  const createComponentId = ctx.imports.get('createComponent');
  const callee = resolveComponentCallee(node.tag, node.importName, ctx);

  const props = buildComponentProps(node, {
    dynamicPropsAsGetters: true,
    forceStringLiteralKeys: false,
    renderedChildren,
    ctx,
  });

  const invocation = isHMR ? t.identifier(HMR_COMPONENT_NAME) : createComponentId;

  return t.callExpression(invocation, [callee, props]);
}

export interface ComponentPropsOptions {
  dynamicPropsAsGetters: boolean;
  forceStringLiteralKeys?: boolean;
  renderedChildren?: t.Expression[];
  ctx: CompileContext;
}

export function buildComponentProps(node: IRElement, options: ComponentPropsOptions): t.Expression {
  const { dynamicPropsAsGetters, forceStringLiteralKeys, renderedChildren = [] } = options;

  type OrderedPart =
    | {
        type: 'prop';
        kind: 'static' | 'dynamic';
        order: number;
        sequence: number;
        prop: IRStaticProp | IRDynamicProp;
      }
    | { type: 'spread'; order: number; sequence: number; spread: IRSpread };

  const ordered: OrderedPart[] = [
    ...node.props.static.map((p, sequence) => ({
      type: 'prop' as const,
      kind: 'static' as const,
      order: p.order,
      sequence,
      prop: p,
    })),
    ...node.props.dynamic.map((p, sequence) => ({
      type: 'prop' as const,
      kind: 'dynamic' as const,
      order: p.order,
      sequence,
      prop: p,
    })),
    ...node.props.spreads.map((s, sequence) => ({
      type: 'spread' as const,
      order: s.order,
      sequence,
      spread: s,
    })),
  ].sort((a, b) => a.order - b.order || a.sequence - b.sequence);

  const createKey = (name: string): t.Identifier | t.StringLiteral => {
    return forceStringLiteralKeys || !t.isValidIdentifier(name)
      ? t.stringLiteral(name)
      : t.identifier(name);
  };

  const createPropNode = (
    prop: IRStaticProp | IRDynamicProp,
    kind: 'static' | 'dynamic',
  ): t.ObjectMember => {
    const key = createKey(prop.name);
    const val =
      'value' in prop && typeof prop.value === 'object' && 'type' in prop.value
        ? (prop.value as t.Expression)
        : (prop as IRDynamicProp).value;

    if (dynamicPropsAsGetters && kind === 'dynamic' && !startsWith(prop.name, 'on')) {
      return t.objectMethod(
        'get',
        key,
        [],
        t.blockStatement([t.returnStatement(t.cloneNode(val, true))]),
        false,
        false,
      );
    }
    return t.objectProperty(key, t.cloneNode(val, true));
  };

  const parts: t.Expression[] = [];
  let currentGroup: t.ObjectMember[] = [];

  const flush = (): void => {
    if (currentGroup.length > 0) {
      parts.push(t.objectExpression(currentGroup));
      currentGroup = [];
    }
  };

  for (const entry of ordered) {
    if (entry.type === 'spread') {
      flush();
      parts.push(t.cloneNode(entry.spread.value, true));
    } else {
      currentGroup.push(createPropNode(entry.prop, entry.kind));
    }
  }

  // Children handling
  if (renderedChildren.length > 0) {
    const childrenVal = t.arrayExpression(renderedChildren);
    const key = createKey('children');

    if (dynamicPropsAsGetters) {
      currentGroup.push(
        t.objectMethod(
          'get',
          key,
          [],
          t.blockStatement([t.returnStatement(childrenVal)]),
          false,
          false,
        ),
      );
    } else {
      currentGroup.push(t.objectProperty(key, childrenVal));
    }
  }

  flush();

  if (parts.length === 0) return t.objectExpression([]);
  if (parts.length === 1) return parts[0];
  return t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('assign')), [
    t.objectExpression([]),
    ...parts,
  ]);
}

// ===== For Loop =====

function generateFor(node: IRElement, state: GenState): t.Expression {
  const { ctx } = state;
  const eachProp = node.props.dynamic.find((p) => p.name === 'each');
  const eachExpr = eachProp ? eachProp.value : t.nullLiteral();

  // Child callback is the first child (an expression or arrow function)
  const firstChild = node.children[0];
  let callbackExpr: t.Expression = t.nullLiteral();

  if (firstChild?.type === 'expression') {
    const fnExpr = firstChild.node;
    if (t.isArrowFunctionExpression(fnExpr) || t.isFunctionExpression(fnExpr)) {
      const body = fnExpr.body;
      if (t.isJSXElement(body)) {
        const innerIR = parseJSX(body, ctx, false);
        const inlined =
          innerIR.type === 'element' && innerIR.isComponent
            ? generateInlineComponent(innerIR, state)
            : generateNode(innerIR, state);
        callbackExpr = t.arrowFunctionExpression(fnExpr.params, inlined);
      } else if (t.isBlockStatement(body)) {
        const prelude: t.Statement[] = [];
        let returnJSX: t.JSXElement | t.JSXFragment | null = null;
        for (const stmt of body.body) {
          if (
            t.isReturnStatement(stmt) &&
            stmt.argument &&
            (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))
          ) {
            returnJSX = stmt.argument as t.JSXElement;
            break;
          } else {
            prelude.push(stmt);
          }
        }
        if (returnJSX && t.isJSXElement(returnJSX)) {
          const innerIR = parseJSX(returnJSX, ctx, false);
          const inlined =
            innerIR.type === 'element' && innerIR.isComponent
              ? generateInlineComponent(innerIR, state)
              : generateNode(innerIR, state);
          const blockBody = t.blockStatement([
            ...prelude.map((s) => t.cloneNode(s, true)),
            t.returnStatement(inlined),
          ]);
          callbackExpr = t.arrowFunctionExpression(fnExpr.params, blockBody);
        } else {
          callbackExpr = fnExpr;
        }
      } else {
        callbackExpr = fnExpr;
      }
    } else {
      callbackExpr = fnExpr;
    }
  }

  const propsMembers: t.ObjectMember[] = [
    t.objectMethod(
      'get',
      t.identifier('each'),
      [],
      t.blockStatement([t.returnStatement(t.cloneNode(eachExpr, true))]),
      false,
      false,
    ),
    t.objectProperty(t.identifier('children'), callbackExpr),
  ];

  // Optional key callback
  const keyProp = node.props.dynamic.find((p) => p.name === 'key');
  if (keyProp) {
    propsMembers.push(t.objectProperty(t.identifier('key'), keyProp.value));
  }

  const createComponentId = ctx.imports.get('createComponent');
  const forId = ctx.imports.get('For');

  return t.callExpression(createComponentId, [forId, t.objectExpression(propsMembers)]);
}

function generateInlineComponent(node: IRElement, state: GenState): t.Expression {
  const callee = buildComponentTagExpression(node.tag);
  const renderedChildren = node.children
    .map((c) => generateNode(c, state))
    .filter((e) => e != null && !t.isNullLiteral(e));

  const props = buildComponentProps(node, {
    dynamicPropsAsGetters: false,
    forceStringLiteralKeys: true,
    renderedChildren,
    ctx: state.ctx,
  });

  return t.callExpression(callee, [props]);
}
