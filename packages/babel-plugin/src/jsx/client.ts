import { types as t } from '@babel/core';
import { escapeHTML } from '@estjs/shared';
import { type CompileContext, genUid, registerTemplate, useImport } from '../context';
import { HYDRATION_ANCHOR_ATTR } from '../constants';
import { serializeStaticAttrs } from './utils';
import {
  type IRBind,
  type IRComponent,
  type IRDynamicAttr,
  type IRElement,
  type IREvent,
  type IRExpression,
  type IRFor,
  type IRNode,
  type IRSpread,
  IRType,
  hasDynamicBoundary,
} from './ir';
import {
  createBindingSetter,
  createEffectKey,
  createPatchCall,
  createRefExpression,
  createSpreadEffectKey,
} from './emitters';
import { buildComponentInvocation, buildForCall, renderChildExpressions } from './shared';
import type { RenderMode } from '../options';

// ─── Internal Constants ───────────────────

const MEMO_STATE_ID = '_p$';
const MEMO_NEXT_VALUE_ID = '_v$';

// ─── Template Building + Flat Node Map ────
// Walk the IR tree once, producing (a) the HTML template string and (b) the
// flat per-DOM-node list used by the navigation planner. Dynamic children
// become `<!>` comment anchors in the template.

interface FlatNode {
  id: number;
  kind: 'element' | 'text' | 'anchor';
  irElement?: IRElement; // only for kind='element'
  dynamicChild?: IRExpression | IRComponent | IRFor; // only for kind='anchor'
  anchorKind?: 'comment' | 'element' | 'tail';
  staticIndex?: number;
  markerIndex?: number; // only for kind='anchor'
  parentId: number; // -1 for root
  childIndex: number; // position in parent's DOM children (0-based)
  domChildIndex: number; // logical DOM position used for sibling navigation
  needsRef: boolean;
}

function hasOwnEffects(element: IRElement): boolean {
  return (
    element.dynamicAttrs.length > 0 ||
    element.events.length > 0 ||
    element.spreads.length > 0 ||
    element.ref != null ||
    element.binds.length > 0
  );
}

function isDynamicChild(node: IRNode | undefined): node is IRExpression | IRComponent | IRFor {
  return (
    node?.type === IRType.EXPRESSION || node?.type === IRType.COMPONENT || node?.type === IRType.FOR
  );
}

/**
 * Single-pass walker that produces both the HTML template string and the
 * flat node list. `mode` controls HTML escaping on text nodes (hydrate keeps
 * raw text because the server already emitted it).
 */
function buildTemplateAndFlatten(
  root: IRElement,
  mode: RenderMode,
): { template: string; nodes: FlatNode[] } {
  const nodes: FlatNode[] = [];
  let template = '';
  let nextId = 0;

  function visit(
    element: IRElement,
    parentId: number,
    childIndex: number,
    forcedStaticIndex?: number,
  ): void {
    const myId = nextId++;
    const staticAttrs =
      mode === 'hydrate' && forcedStaticIndex !== undefined
        ? [
            ...element.staticAttrs,
            { name: HYDRATION_ANCHOR_ATTR, value: String(forcedStaticIndex) },
          ]
        : element.staticAttrs;
    const attrs = serializeStaticAttrs(staticAttrs);

    if (element.selfClosing) {
      template += `<${element.tag}${attrs}/>`;
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

    template += `<${element.tag}${attrs}>`;

    const hasDynamicChildren = element.children.some(isDynamicChild);

    nodes.push({
      id: myId,
      kind: 'element',
      irElement: element,
      staticIndex: forcedStaticIndex,
      parentId,
      childIndex,
      domChildIndex: childIndex,
      needsRef: hasOwnEffects(element) || hasDynamicChildren,
    });

    let templateChildIndex = 0;
    let domChildIndex = 0;
    let markerIndex = 0;
    let pendingAnchorIndex: number | undefined;
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      switch (child.type) {
        case IRType.TEXT:
          template += mode === 'hydrate' ? child.value : escapeHTML(child.value);
          nodes.push({
            id: nextId++,
            kind: 'text',
            parentId: myId,
            childIndex: templateChildIndex++,
            domChildIndex: domChildIndex++,
            needsRef: false,
          });
          break;
        case IRType.ELEMENT:
          visit(child, myId, templateChildIndex++, pendingAnchorIndex);
          domChildIndex++;
          pendingAnchorIndex = undefined;
          break;
        case IRType.EXPRESSION:
        case IRType.COMPONENT:
        case IRType.FOR: {
          const next = element.children[i + 1];
          const anchorKind =
            mode === 'hydrate' && !hasDynamicBoundary(element.children, i)
              ? next?.type === IRType.ELEMENT
                ? 'element'
                : 'tail'
              : 'comment';
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
          break;
        }
      }
    }

    template += `</${element.tag}>`;
  }

  visit(root, -1, 0);
  return { template, nodes };
}

/**
 * Checks whether an IR subtree can be emitted as static HTML (no effects,
 * no dynamic children). Static subtrees skip the flattening/planning paths.
 */
function isStaticSubtree(node: IRNode): boolean {
  if (node.type !== IRType.ELEMENT) return node.type === IRType.TEXT;
  return (
    node.dynamicAttrs.length === 0 &&
    node.events.length === 0 &&
    node.spreads.length === 0 &&
    !node.ref &&
    node.binds.length === 0 &&
    node.children.every(isStaticSubtree)
  );
}

/**
 * Builds a template string for a fully-static subtree (used only when
 * `isStaticSubtree` is true, so no anchors are needed).
 */
function buildStaticTemplateString(node: IRNode, mode: RenderMode): string {
  switch (node.type) {
    case IRType.TEXT:
      return mode === 'hydrate' ? node.value : escapeHTML(node.value);
    case IRType.ELEMENT: {
      const attrs = serializeStaticAttrs(node.staticAttrs);
      if (node.selfClosing) return `<${node.tag}${attrs}/>`;
      let html = `<${node.tag}${attrs}>`;
      for (const child of node.children) html += buildStaticTemplateString(child, mode);
      return `${html}</${node.tag}>`;
    }
    default:
      return '';
  }
}

// ─── Navigation Planning ───────────────────
// For each node that needs a DOM reference, plan how to navigate
// from the root using `child()` and `next()` calls.

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

/**
 * Computes `child()` and `next()` steps for nodes that need DOM references.
 */
function planNavigation(nodes: FlatNode[], mode: RenderMode): NavigationStep[] {
  const steps: NavigationStep[] = [];
  const navigated = new Set<number>();

  // Root (id=0) is always available via the template clone
  navigated.add(0);

  // Build lookups for O(1) access
  const nodeMap = new Map<number, FlatNode>();
  const siblingMap = new Map<number, Map<number, FlatNode[]>>(); // parentId -> childIndex -> nodes

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

  /**
   * Ensures a node has a navigation path from an already-known ancestor.
   */
  function ensureNavigated(node: FlatNode): void {
    if (navigated.has(node.id)) return;

    // Ensure parent is navigated first
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
      // First child → child(parent)
      steps.push({
        nodeId: node.id,
        type: 'child',
        fromNodeId: node.parentId,
      });
      navigated.add(node.id);
      return;
    }

    // Not first child → find closest previous navigated sibling
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

    // Previous siblings do not need refs; jump directly from parent to this child.
    steps.push({
      nodeId: node.id,
      type: 'nthChild',
      fromNodeId: node.parentId,
      index: node.domChildIndex,
    });
    navigated.add(node.id);
  }

  // Process nodes in DFS order
  for (const node of nodes) {
    if (node.id === 0) continue;
    if (!node.needsRef) continue;
    ensureNavigated(node);
  }

  return steps;
}

function createNavigationExpression(step: NavigationStep, fromExpr: t.Expression): t.Expression {
  if (step.type === 'child') {
    return t.callExpression(useImport('child'), [fromExpr]);
  }

  if (step.type === 'nthChild') {
    return t.callExpression(useImport('nthChild'), [fromExpr, t.numericLiteral(step.index)]);
  }

  if (step.type === 'hydrationMarker') {
    return t.callExpression(useImport('hydrationMarker'), [fromExpr, t.numericLiteral(step.index)]);
  }

  if (step.type === 'hydrationAnchor') {
    return t.callExpression(useImport('hydrationAnchor'), [fromExpr, t.numericLiteral(step.index)]);
  }

  return t.callExpression(useImport('next'), [fromExpr, t.numericLiteral(step.index)]);
}

// ─── Code Generation State ─────────────────

interface GenState {
  mode: RenderMode;
  effectIndex: number;
}

interface PendingMemoPatch {
  effectKey: string;
  target: t.Expression;
  attrName: string;
  value: t.Expression;
}

type NodeVarMap = Map<number, t.Identifier>;

// ─── Element Code Generation ────────────────

/**
 * Generates element.
 */
function generateElement(node: IRElement, state: GenState): t.Expression {
  const { mode } = state;

  // Fully static subtree → return template call directly.
  if (isStaticSubtree(node)) {
    const tmplId = registerTemplate(buildStaticTemplateString(node, mode));
    return t.callExpression(tmplId, []);
  }

  // Single walk: build template string + flatten, then plan navigation.
  const { template, nodes: flatNodes } = buildTemplateAndFlatten(node, mode);
  const navSteps = planNavigation(flatNodes, mode);

  const body: t.Statement[] = [];
  const tmplId = registerTemplate(template);
  const rootId = genUid('root$');
  body.push(
    t.variableDeclaration('const', [t.variableDeclarator(rootId, t.callExpression(tmplId, []))]),
  );

  // Build var map: nodeId → t.Identifier
  const varMap: NodeVarMap = new Map();
  varMap.set(0, rootId); // root element

  // Phase 1: Emit navigation declarations (flat, sequential)
  emitNavigationDeclarations(navSteps, varMap, rootId, body);

  // Phase 2: Emit effects (events, refs, binds, dynamic attrs, spreads)
  const pendingMemoPatches: PendingMemoPatch[] = [];
  emitElementEffects(flatNodes, varMap, state, body, pendingMemoPatches);
  emitMergedMemoEffect(pendingMemoPatches, body);

  // Phase 3: Emit insert operations (dynamic children)
  emitDynamicChildInserts(flatNodes, varMap, state, body);

  body.push(t.returnStatement(rootId));
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
}

function emitNavigationDeclarations(
  steps: NavigationStep[],
  varMap: NodeVarMap,
  rootId: t.Identifier,
  body: t.Statement[],
): void {
  for (const step of steps) {
    const varName = genUid(
      step.type === 'hydrationMarker' || step.type === 'hydrationAnchor' ? 'hk$' : 'n$',
    );
    const fromExpr = varMap.get(step.fromNodeId) ?? rootId;
    const navExpr = createNavigationExpression(step, fromExpr);

    body.push(t.variableDeclaration('const', [t.variableDeclarator(varName, navExpr)]));
    varMap.set(step.nodeId, varName);
  }
}

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
  for (const event of element.events) {
    emitEvent(event, target, body);
  }

  if (element.ref) {
    body.push(t.expressionStatement(createRefExpression(target, element.ref.value)));
  }

  for (const bind of element.binds) {
    emitBind(bind, target, body);
  }

  for (const attr of element.dynamicAttrs) {
    emitDynamicAttr(attr, target, body, state, pendingMemoPatches);
  }

  for (const spread of element.spreads) {
    emitSpread(spread, target, body, state, pendingMemoPatches);
  }
}

function emitDynamicChildInserts(
  flatNodes: FlatNode[],
  varMap: NodeVarMap,
  state: GenState,
  body: t.Statement[],
): void {
  for (const flatNode of flatNodes) {
    if (flatNode.kind !== 'anchor' || !flatNode.dynamicChild) continue;

    const parent = varMap.get(flatNode.parentId);
    const anchor = varMap.get(flatNode.id);
    if (!parent) continue;
    if (flatNode.anchorKind !== 'tail' && !anchor) continue;

    body.push(
      t.expressionStatement(createInsertCall(parent, flatNode.dynamicChild, anchor, state)),
    );
  }
}

function createInsertCall(
  parent: t.Expression,
  child: IRExpression | IRComponent | IRFor,
  anchor: t.Expression | undefined,
  state: GenState,
): t.CallExpression {
  if (child.type === IRType.FOR) {
    const insert = useImport('insert');
    const args = [parent, generateFor(child, state)];
    if (anchor) args.push(anchor);
    return t.callExpression(insert, args);
  }

  const childExpression = createDynamicChildExpression(child, state);
  const args = [parent, childExpression];
  if (anchor) args.push(anchor);
  return t.callExpression(useImport('insert'), args);
}

function createDynamicChildExpression(
  child: IRExpression | IRComponent | IRFor,
  state: GenState,
): t.Expression {
  switch (child.type) {
    case IRType.EXPRESSION:
      return t.arrowFunctionExpression([], t.cloneNode(child.value, true));
    case IRType.COMPONENT:
      return generateComponent(child, state);
    case IRType.FOR:
      return generateFor(child, state);
  }
}

// ─── Effect Emitters ───────────────────────

/**
 * Emits event.
 */
function emitEvent(event: IREvent, target: t.Expression, body: t.Statement[]): void {
  if (event.delegated) {
    body.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(target, t.stringLiteral(`_$${event.name}`), true),
          event.handler,
        ),
      ),
    );
  } else {
    body.push(
      t.expressionStatement(
        t.callExpression(useImport('addEventListener'), [
          target,
          t.stringLiteral(event.name),
          event.handler,
        ]),
      ),
    );
  }
}

/**
 * Emits bind.
 */
function emitBind(bind: IRBind, target: t.Expression, body: t.Statement[]): void {
  // Tuple syntax: bind:value={[signal, { trim: true }]}
  let valueExpr = bind.value;
  let modifiersArg: t.Expression | null = null;
  if (
    t.isArrayExpression(bind.value) &&
    bind.value.elements.length === 2 &&
    bind.value.elements[0] != null &&
    !t.isSpreadElement(bind.value.elements[0])
  ) {
    valueExpr = bind.value.elements[0] as t.Expression;
    modifiersArg = bind.value.elements[1] as t.Expression;
  }

  const args: t.Expression[] = [
    target,
    t.stringLiteral(bind.name),
    t.arrowFunctionExpression([], t.cloneNode(valueExpr)),
    createBindingSetter(valueExpr, '_v$'),
  ];
  if (modifiersArg) args.push(t.cloneNode(modifiersArg));

  body.push(t.expressionStatement(t.callExpression(useImport('bindElement'), args)));
}

/**
 * Emits dynamic attr.
 */
function emitDynamicAttr(
  attr: IRDynamicAttr,
  target: t.Expression,
  body: t.Statement[],
  state: GenState,
  pendingMemoPatches: PendingMemoPatch[],
): void {
  emitPatchOrEffect(
    target,
    attr.name,
    attr.value,
    attr.kind,
    body,
    () => createEffectKey(attr.name, state.effectIndex++),
    pendingMemoPatches,
  );
}

/**
 * Emits spread.
 */
function emitSpread(
  spread: IRSpread,
  target: t.Expression,
  body: t.Statement[],
  state: GenState,
  pendingMemoPatches: PendingMemoPatch[],
): void {
  emitPatchOrEffect(
    target,
    '_$spread$',
    spread.value,
    spread.kind,
    body,
    () => createSpreadEffectKey(state.effectIndex++),
    pendingMemoPatches,
  );
}

/**
 * Emits patch or effect.
 */
function emitPatchOrEffect(
  target: t.Expression,
  attrName: string,
  value: t.Expression,
  kind: 'static' | 'dynamic',
  body: t.Statement[],
  getEffectKey: () => string,
  pendingMemoPatches: PendingMemoPatch[],
): void {
  if (kind === 'static') {
    body.push(t.expressionStatement(createPatchCall(useImport, target, attrName, value)));
    return;
  }

  pendingMemoPatches.push({
    effectKey: getEffectKey(),
    target,
    attrName,
    value,
  });
}

/**
 * Emits memo effect.
 */
function emitMergedMemoEffect(patches: PendingMemoPatch[], body: t.Statement[]): void {
  if (patches.length === 0) return;

  const memoStateId = t.identifier(MEMO_STATE_ID);
  const effectBody = patches.flatMap((patch) => createMemoPatchStatements(patch, memoStateId));
  effectBody.push(t.returnStatement(memoStateId));

  body.push(
    t.expressionStatement(
      t.callExpression(useImport('memoEffect'), [
        t.arrowFunctionExpression([memoStateId], t.blockStatement(effectBody)),
        createMemoInitialState(patches),
      ]),
    ),
  );
}

function createMemoPatchStatements(
  patch: PendingMemoPatch,
  memoStateId: t.Identifier,
): t.Statement[] {
  const effectState = t.memberExpression(memoStateId, t.identifier(patch.effectKey));
  const valueId = genUid(MEMO_NEXT_VALUE_ID);
  const updateCall = createPatchCall(useImport, patch.target, patch.attrName, valueId, {
    previousValue: effectState,
    nextValue: t.assignmentExpression('=', effectState, valueId),
  });

  return [
    t.variableDeclaration('var', [t.variableDeclarator(valueId, t.cloneNode(patch.value, true))]),
    t.expressionStatement(
      t.logicalExpression('&&', t.binaryExpression('!==', valueId, effectState), updateCall),
    ),
  ];
}

function createMemoInitialState(patches: PendingMemoPatch[]): t.ObjectExpression {
  return t.objectExpression(
    patches.map((patch) =>
      t.objectProperty(t.identifier(patch.effectKey), t.identifier('undefined')),
    ),
  );
}

// ─── Component Generation ──────────────────

/**
 * Generates component.
 */
function generateComponent(node: IRComponent, state: GenState): t.Expression {
  const renderedChildren = renderChildExpressions(node.children, (child) =>
    generateNode(child, state),
  );
  return buildComponentInvocation(node.tag, node, {
    wrap: true,
    dynamicPropsAsGetters: true,
    lazyChildren: true,
    renderedChildren,
  });
}

/**
 * Generates for.
 */
function generateFor(node: IRFor, state: GenState): t.Expression {
  const bodyExpr = generateForBody(node.body, state);
  return buildForCall(node, bodyExpr);
}

/**
 * Generates for body.
 */
function generateForBody(node: IRNode, state: GenState): t.Expression {
  if (node.type === IRType.COMPONENT) {
    return generateInlineComponent(node, state);
  }
  return generateNode(node, state);
}

/**
 * Generates inline component (used inside For callback bodies).
 */
function generateInlineComponent(node: IRComponent, state: GenState): t.Expression {
  const renderedChildren = renderChildExpressions(node.children, (child) =>
    generateNode(child, state),
  );
  return buildComponentInvocation(node.tag, node, {
    wrap: false,
    dynamicPropsAsGetters: false,
    forceStringLiteralKeys: true,
    renderedChildren,
  });
}

// ─── Generic Node Generation ───────────────

/**
 * Generates node.
 */
function generateNode(node: IRNode, state: GenState): t.Expression {
  switch (node.type) {
    case IRType.ELEMENT:
      return generateElement(node, state);
    case IRType.COMPONENT:
      return generateComponent(node, state);
    case IRType.TEXT:
      return t.stringLiteral(node.value);
    case IRType.EXPRESSION:
      return t.cloneNode(node.value, true);
    case IRType.FOR:
      return generateFor(node, state);
  }
}

/**
 * Generates client.
 */
export function generateClient(ir: IRNode, ctx: CompileContext): t.Expression {
  const state: GenState = {
    mode: ctx.options.mode! as RenderMode,
    effectIndex: 0,
  };

  return generateNode(ir, state);
}
