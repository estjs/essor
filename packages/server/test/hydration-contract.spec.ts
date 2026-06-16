import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginHydration,
  child,
  endHydration,
  getRenderedElement,
  hydrationAnchor,
  hydrationMarker,
  insert,
  next,
  nthChild,
  resetHydrationKey,
} from '../../template/src';
import { escape } from '../src/utils';
import { render } from '../src/render';

describe('server/client hydration contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetHydrationKey();
    endHydration();
  });

  afterEach(() => {
    endHydration();
    resetHydrationKey();
  });

  it('claims browser-merged SSR text before a hydration marker', () => {
    const root = document.createElement('div');
    root.innerHTML = render(['<p>', '<!--0-->!</p>'], '0', escape(['Hello, ', 'John']));
    document.body.appendChild(root);

    beginHydration(root);

    const paragraph = getRenderedElement('<p><!>!</p>')();
    const marker = hydrationMarker(paragraph, 0);
    insert(paragraph, () => ['Hello, ', 'John'], marker ?? undefined);

    expect(paragraph.textContent).toBe('Hello, John!');
    expect(root.innerHTML).toBe('<p data-hk="0">Hello, John<!--0-0-->!</p>');
  });

  it('finds adjacent dynamic markers without drifting into SSR dynamic nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = render(
      ['<div>', '<!--0-->', '<!--1--></div>'],
      '0',
      render(['<span>one</span>'], '1'),
      render(['<span>two</span>'], '2'),
    );
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement('<div><!><!></div>')();
    const firstMarker = hydrationMarker(wrapper, 0);
    const secondMarker = hydrationMarker(wrapper, 1);

    insert(wrapper, getRenderedElement('<span>one</span>')(), firstMarker ?? undefined);
    insert(wrapper, getRenderedElement('<span>two</span>')(), secondMarker ?? undefined);

    expect(wrapper.textContent).toBe('onetwo');
    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0].textContent).toBe('one');
    expect(wrapper.children[1].textContent).toBe('two');
  });

  it('keeps later static siblings reachable after hydrating a dynamic block', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-hk="0"><span>Action summary: seed · total 4</span><!--0-0--><form><button>Add Message</button></form><section><p>Submission pending: false<!--0-0--></p></section></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement(
      '<div><!><form><button>Add Message</button></form><section><p>Submission pending: <!></p></section></div>',
    )();
    const feedbackAnchor = hydrationMarker(wrapper, 0);
    const feedback = document.createElement('span');
    feedback.textContent = 'Action summary: seed · total 4';
    insert(wrapper, feedback, feedbackAnchor ?? undefined);

    expect(nthChild(wrapper, 2)?.nodeName).toBe('FORM');

    const section = next(feedbackAnchor, 2) as Element | null;
    const paragraph = child(section) as Element;
    const statusMarker = hydrationMarker(paragraph, 0);
    insert(paragraph, () => 'false', statusMarker ?? undefined);

    expect(wrapper.querySelector('button')?.textContent).toBe('Add Message');
    expect(wrapper.querySelector('section p')?.textContent).toBe('Submission pending: false');
  });

  it('claims markerless SSR nodes before a static sibling anchor', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-hk="0"><span>Action summary</span><form><button>Save</button></form></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement(
      '<div><span>Action summary</span><form><button>Save</button></form></div>',
    )();
    const form = child(wrapper)?.nextSibling as Element | null;
    const feedback = document.createElement('span');
    feedback.textContent = 'Action summary';
    insert(wrapper, feedback, form ?? undefined);

    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0].textContent).toBe('Action summary');
    expect(wrapper.children[1].tagName).toBe('FORM');
  });

  it('claims markerless trailing SSR nodes from the parent tail', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-hk="0"><header>Title</header><footer>Done</footer></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement('<div><header>Title</header><footer>Done</footer></div>')();
    const footer = document.createElement('footer');
    footer.textContent = 'Done';
    insert(wrapper, footer);

    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0].tagName).toBe('HEADER');
    expect(wrapper.children[1].textContent).toBe('Done');
  });

  it('keeps hydrate-template anchors reachable when rendering without active hydration', () => {
    const wrapper = getRenderedElement(
      '<div><span>Action summary</span><form data-hk-idx="0"><button>Save</button></form><section><p>Pending: <!></p></section></div>',
    )();

    const form = hydrationAnchor(wrapper, 0) as Element | null;
    expect(form?.tagName).toBe('FORM');

    const section = next(form, 1) as Element | null;
    const paragraph = child(section) as Element | null;
    const statusMarker = hydrationMarker(paragraph, 0);

    insert(paragraph!, () => 'false', statusMarker ?? undefined);

    expect(wrapper.querySelector('button')?.textContent).toBe('Save');
    expect(wrapper.querySelector('section p')?.textContent).toBe('Pending: false');
  });

  it('resolves multiple hydrate-template anchors by index outside hydration', () => {
    const wrapper = getRenderedElement(
      '<div><button data-hk-idx="0">One</button><button data-hk-idx="1">Two</button><button data-hk-idx="2">Three</button></div>',
    )();

    expect((hydrationAnchor(wrapper, 0) as Element | null)?.textContent).toBe('One');
    expect((hydrationAnchor(wrapper, 1) as Element | null)?.textContent).toBe('Two');
    expect((hydrationAnchor(wrapper, 2) as Element | null)?.textContent).toBe('Three');
    expect(hydrationAnchor(wrapper, 3)).toBeNull();
  });

  it('can bind delegated events to hydrate-template anchors outside hydration', () => {
    const onClick = () => {};
    const wrapper = getRenderedElement('<div><button data-hk-idx="0">Save</button></div>')();

    const button = hydrationAnchor(wrapper, 0) as
      | (HTMLButtonElement & { _$click?: () => void })
      | null;

    button!._$click = onClick;

    expect(button?.tagName).toBe('BUTTON');
    expect(button?._$click).toBe(onClick);
  });

  it('keeps hydrate-template comment markers reachable when rendering without active hydration', () => {
    const paragraph = getRenderedElement('<p>Hello, <!>!</p>')();
    const marker = hydrationMarker(paragraph, 0);

    insert(paragraph, () => 'John', marker ?? undefined);

    expect(marker).toBeInstanceOf(Comment);
    expect(paragraph.textContent).toBe('Hello, John!');
  });

  it('resolves multiple hydrate-template comment markers by position outside hydration', () => {
    const paragraph = getRenderedElement('<p><!>-<!>-<!></p>')();
    const first = hydrationMarker(paragraph, 0);
    const second = hydrationMarker(paragraph, 1);
    const third = hydrationMarker(paragraph, 2);

    insert(paragraph, () => 'A', first ?? undefined);
    insert(paragraph, () => 'B', second ?? undefined);
    insert(paragraph, () => 'C', third ?? undefined);

    expect(first).toBeInstanceOf(Comment);
    expect(second).toBeInstanceOf(Comment);
    expect(third).toBeInstanceOf(Comment);
    expect(hydrationMarker(paragraph, 3)).toBeNull();
    expect(paragraph.textContent).toBe('A-B-C');
  });

  it('keeps keyed hydration markers strict during active hydration', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-hk="0"><!--wrong--><!--0-0--></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement('<div><!></div>')();
    const marker = hydrationMarker(wrapper, 0);
    insert(wrapper, () => 'matched', marker ?? undefined);

    expect(marker?.data).toBe('0-0');
    expect(wrapper.textContent).toBe('matched');
  });

  it('keeps keyed hydration anchors strict during active hydration', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-hk="0"><button data-hk-idx="0">wrong</button><button data-hk-idx="0-0">right</button></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = getRenderedElement(
      '<div><button data-hk-idx="0">wrong</button><button data-hk-idx="0">right</button></div>',
    )();
    const button = hydrationAnchor(wrapper, 0) as HTMLButtonElement | null;

    expect(button?.textContent).toBe('right');
  });
});
