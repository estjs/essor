import { types as t } from '@babel/core';
import { escapeHTML } from '@estjs/shared';
import { type CompileContext, genUid, registerTemplate, useImport } from '../context';
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
const MEMO_NEXT_VALUE_ID = '_v$0';

// ─── Template Building + Flat Node Map ────
// Walk the IR tree once, producing (a) the HTML template string and (b) the
// flat per-DOM-node list used by the navigation planner. Dynamic children
// become `<!>` comment anchors in the template.

interface FlatNode {
  id: number;
  kind: 'element' | 'text' | 'anchor';
  irElement?: IRElement; // only for kind='element'
  dynamicChild?: IRExpression | IRComponent | IRFor; // only for kind='anchor'
  parentId: number; // -1 for root
  childIndex: number; // position in parent's DOM children (0-based)
  needsRef: boolean;
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

  function visit(element: IRElement, parentId: number, childIndex: number): void {
    const myId = nextId++;
    const attrs = serializeStaticAttrs(element.staticAttrs);

    if (element.selfClosing) {
      template += `<${element.tag}${attrs}/>`;
      nodes.push({
        id: myId,
        kind: 'element',
        irElement: element,
        parentId,
        childIndex,
        needsRef:
          element.dynamicAttrs.length > 0 ||
          element.events.length > 0 ||
          element.spreads.length > 0 ||
          element.ref != null ||
          element.binds.length > 0,
      });
      return;
    }

    template += `<${element.tag}${attrs}>`;

    const hasDynamicChild = element.children.some(
      (c) => c.type === IRType.EXPRESSION || c.type === IRType.COMPONENT || c.type === IRType.FOR,
    );
    const hasOwnEffects =
      element.dynamicAttrs.length > 0 ||
      element.events.length > 0 ||
      element.spreads.length > 0 ||
      element.ref != null ||
      element.binds.length > 0;

    nodes.push({
      id: myId,
      kind: 'element',
      irElement: element,
      parentId,
      childIndex,
      needsRef: hasOwnEffects || hasDynamicChild,
    });

    let templateChildIndex = 0;
    for (const child of element.children) {
      switch (child.type) {
        case IRType.TEXT:
          template += mode === 'hydrate' ? child.value : escapeHTML(child.value);
          nodes.push({
            id: nextId++,
            kind: 'text',
            parentId: myId,
            childIndex: templateChildIndex++,
            needsRef: false,
          });
          break;
        case IRType.ELEMENT:
          visit(child, myId, templateChildIndex++);
          break;
        case IRType.EXPRESSION:
        case IRType.COMPONENT:
        case IRType.FOR:
          template += '<!>';
          nodes.push({
            id: nextId++,
            kind: 'anchor',
            dynamicChild: child,
            parentId: myId,
            childIndex: templateChildIndex++,
            needsRef: true,
          });
          break;
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
  type: 'child' | 'next';
  fromNodeId: number;
  distance: number; // for 'next', number of nextSibling hops
}

/**
 * Computes `child()` and `next()` steps for nodes that need DOM references.
 */
function planNavigation(nodes: FlatNode[]): NavStep[] {
  const steps: NavStep[] = [];
  const navigated = new Set<number>();

  // Root (id=0) is always available via the template clone
  navigated.add(0);

  // Build lookups for O(1) access
  const nodeMap = new Map<number, FlatNode>();
  const siblingMap = new Map<number, Map<number, FlatNode>>(); // parentId -> childIndex -> node

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    if (node.parentId !== -1) {
      if (!siblingMap.has(node.parentId)) {
        siblingMap.set(node.parentId, new Map());
      }
      siblingMap.get(node.parentId)!.set(node.childIndex, node);
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

    if (node.childIndex === 0) {
      // First child → child(parent)
      steps.push({
        nodeId: node.id,
        type: 'child',
        fromNodeId: node.parentId,
        distance: 0,
      });
      navigated.add(node.id);
      return;
    }

    // Not first child → find closest previous navigated sibling
    const parentSiblings = siblingMap.get(node.parentId);
    let prevNav: FlatNode | null = null;

    if (parentSiblings) {
      for (let i = node.childIndex - 1; i >= 0; i--) {
        const sib = parentSiblings.get(i);
        if (sib && navigated.has(sib.id)) {
          prevNav = sib;
          break;
        }
      }
    }

    if (prevNav) {
      steps.push({
        nodeId: node.id,
        type: 'next',
        fromNodeId: prevNav.id,
        distance: node.childIndex - prevNav.childIndex,
      });
      navigated.add(node.id);
      return;
    }

    // No previous sibling navigated — navigate to first child, then next() to target
    const firstChild = parentSiblings?.get(0);
    if (firstChild && !navigated.has(firstChild.id)) {
      steps.push({
        nodeId: firstChild.id,
        type: 'child',
        fromNodeId: node.parentId,
        distance: 0,
      });
      navigated.add(firstChild.id);
    }

    steps.push({
      nodeId: node.id,
      type: 'next',
      fromNodeId: firstChild?.id ?? node.parentId,
      distance: node.childIndex,
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

// ─── Code Generation State ─────────────────

interface GenState {
  ctx: CompileContext;
  mode: RenderMode;
  effectIndex: number;
}

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
  const navSteps = planNavigation(flatNodes);

  const body: t.Statement[] = [];
  const tmplId = registerTemplate(template);
  const rootId = genUid('root$');
  body.push(
    t.variableDeclaration('const', [t.variableDeclarator(rootId, t.callExpression(tmplId, []))]),
  );

  // Build var map: nodeId → t.Identifier
  const varMap = new Map<number, t.Identifier>();
  varMap.set(0, rootId); // root element

  // Phase 1: Emit navigation declarations (flat, sequential)
  for (const step of navSteps) {
    const varName = genUid('n$');
    const fromExpr = varMap.get(step.fromNodeId) ?? rootId;

    let navExpr: t.Expression;
    if (step.type === 'child') {
      navExpr = t.callExpression(useImport('child'), [fromExpr]);
    } else {
      navExpr = t.callExpression(useImport('next'), [fromExpr, t.numericLiteral(step.distance)]);
    }

    body.push(t.variableDeclaration('const', [t.variableDeclarator(varName, navExpr)]));
    varMap.set(step.nodeId, varName);
  }

  // Phase 2: Emit effects (events, refs, binds, dynamic attrs, spreads)
  for (const flatNode of flatNodes) {
    if (flatNode.kind !== 'element' || !flatNode.irElement) continue;

    const el = flatNode.irElement;
    const elExpr = varMap.get(flatNode.id);
    if (!elExpr) continue;

    // Events
    for (const event of el.events) {
      emitEvent(event, elExpr, body);
    }

    // Ref
    if (el.ref) {
      body.push(t.expressionStatement(createRefExpression(elExpr, el.ref.value)));
    }

    // Binds
    for (const bind of el.binds) {
      emitBind(bind, elExpr, body);
    }

    // Dynamic attributes
    for (const attr of el.dynamicAttrs) {
      emitDynamicAttr(attr, elExpr, body, state);
    }

    // Spreads
    for (const spread of el.spreads) {
      emitSpread(spread, elExpr, body, state);
    }
  }

  // Phase 3: Emit insert operations (dynamic children)
  for (const flatNode of flatNodes) {
    if (flatNode.kind !== 'anchor' || !flatNode.dynamicChild) continue;

    const parentExpr = varMap.get(flatNode.parentId);
    const anchorExpr = varMap.get(flatNode.id);
    if (!parentExpr || !anchorExpr) continue;

    const child = flatNode.dynamicChild;
    if (child.type === IRType.EXPRESSION) {
      body.push(
        t.expressionStatement(
          t.callExpression(useImport('insert'), [
            parentExpr,
            t.arrowFunctionExpression([], t.cloneNode(child.value, true)),
            anchorExpr,
          ]),
        ),
      );
    } else if (child.type === IRType.COMPONENT) {
      const componentExpr = generateComponent(child, state);
      body.push(
        t.expressionStatement(
          t.callExpression(useImport('insert'), [parentExpr, componentExpr, anchorExpr]),
        ),
      );
    } else if (child.type === IRType.FOR) {
      body.push(
        t.expressionStatement(
          t.callExpression(useImport('insert'), [
            parentExpr,
            generateFor(child, state),
            anchorExpr,
          ]),
        ),
      );
    }
  }

  body.push(t.returnStatement(rootId));
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
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
): void {
  emitPatchOrEffect(target, attr.name, attr.value, attr.kind, body, state, () =>
    createEffectKey(attr.name, state.effectIndex++),
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
): void {
  emitPatchOrEffect(target, '_$spread$', spread.value, spread.kind, body, state, () =>
    createSpreadEffectKey(state.effectIndex++),
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
  state: GenState,
  getEffectKey: () => string,
): void {
  if (kind === 'static') {
    body.push(t.expressionStatement(createPatchCall(useImport, target, attrName, value)));
    return;
  }

  const effectKey = getEffectKey();
  emitMemoEffect(effectKey, target, attrName, value, body);
}

/**
 * Emits memo effect.
 */
function emitMemoEffect(
  effectKey: string,
  target: t.Expression,
  attrName: string,
  value: t.Expression,
  body: t.Statement[],
): void {
  const effectState = t.memberExpression(t.identifier(MEMO_STATE_ID), t.identifier(effectKey));
  const valueId = t.identifier(MEMO_NEXT_VALUE_ID);
  const updateCall = createPatchCall(useImport, target, attrName, value, {
    previousValue: effectState,
    nextValue: t.assignmentExpression('=', effectState, valueId),
  });

  body.push(
    t.expressionStatement(
      t.callExpression(useImport('memoEffect'), [
        t.arrowFunctionExpression(
          [t.identifier(MEMO_STATE_ID)],
          t.blockStatement([
            t.variableDeclaration('var', [t.variableDeclarator(valueId, value)]),
            t.expressionStatement(
              t.logicalExpression(
                '&&',
                t.binaryExpression('!==', valueId, effectState),
                updateCall,
              ),
            ),
            t.returnStatement(t.identifier(MEMO_STATE_ID)),
          ]),
        ),
        t.objectExpression([t.objectProperty(t.identifier(effectKey), t.objectExpression([]))]),
      ]),
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
    ctx,
    mode: ctx.options.mode! as RenderMode,
    effectIndex: 0,
  };

  return generateNode(ir, state);
}
