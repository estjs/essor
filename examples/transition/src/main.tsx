import { Transition, TransitionGroup, createApp } from 'essor';
import './style.css';

function App() {
  let $fadeShow = false;
  let $slideShow = false;
  let $scaleShow = false;
  let $cssOff = false;
  let $appearShow = true;
  let $hookCount = 0;
  let $hookShow = false;
  // TransitionGroup demo state — keep ids unique so leave→re-enter and FLIP
  // move animations both have stable identity to work with.
  let $listItems: Array<{ id: number; label: string }> = [
    { id: 1, label: 'Apple' },
    { id: 2, label: 'Banana' },
    { id: 3, label: 'Cherry' },
  ];
  let $nextId = 4;

  return (
    <main data-test="example-root" class="page">
      <h1>Transition Example</h1>
      <p class="note">
        Click each button to trigger the named transition; classes apply during enter/leave.
      </p>

      <section class="scenario" data-test="scenario-fade">
        <h2>1. Fade (CSS, name=fade)</h2>
        <button data-test="fade-toggle" onClick={() => ($fadeShow = !$fadeShow)}>
          {$fadeShow ? 'Hide' : 'Show'}
        </button>
        <Transition name="fade">
          {() =>
            $fadeShow && (
              <div class="box fade-box" data-test="fade-box">
                Fading box
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-slide">
        <h2>2. Slide (CSS, name=slide)</h2>
        <button data-test="slide-toggle" onClick={() => ($slideShow = !$slideShow)}>
          {$slideShow ? 'Hide' : 'Show'}
        </button>
        <Transition name="slide">
          {() =>
            $slideShow && (
              <div class="box slide-box" data-test="slide-box">
                Sliding panel
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-scale">
        <h2>3. Scale with duration prop (200ms enter, 400ms leave)</h2>
        <button data-test="scale-toggle" onClick={() => ($scaleShow = !$scaleShow)}>
          {$scaleShow ? 'Hide' : 'Show'}
        </button>
        <Transition name="scale" duration={{ enter: 200, leave: 400 }}>
          {() =>
            $scaleShow && (
              <div class="box scale-box" data-test="scale-box">
                Scaling box
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-css-off">
        <h2>4. JS-only (css=false), Web Animations API</h2>
        <button data-test="css-off-toggle" onClick={() => ($cssOff = !$cssOff)}>
          {$cssOff ? 'Hide' : 'Show'}
        </button>
        <Transition
          css={false}
          onEnter={(el, done) => {
            (el as HTMLElement)
              .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 })
              .finished.then(done);
          }}
          onLeave={(el, done) => {
            (el as HTMLElement)
              .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 })
              .finished.then(done);
          }}>
          {() =>
            $cssOff && (
              <div class="box js-box" data-test="js-box">
                JS-animated box
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-appear">
        <h2>5. appear (animates on initial mount)</h2>
        <button data-test="appear-toggle" onClick={() => ($appearShow = !$appearShow)}>
          {$appearShow ? 'Hide' : 'Show'}
        </button>
        <Transition name="fade" appear>
          {() =>
            $appearShow && (
              <div class="box appear-box" data-test="appear-box">
                I appeared with animation
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-hooks">
        <h2>6. JS hooks (call counter for each phase)</h2>
        <button data-test="hooks-toggle" onClick={() => ($hookShow = !$hookShow)}>
          {$hookShow ? 'Hide' : 'Show'}
        </button>
        <p data-test="hook-count">hook calls: {$hookCount}</p>
        <Transition
          name="fade"
          onBeforeEnter={() => ($hookCount = $hookCount + 1)}
          onAfterEnter={() => ($hookCount = $hookCount + 1)}
          onBeforeLeave={() => ($hookCount = $hookCount + 1)}
          onAfterLeave={() => ($hookCount = $hookCount + 1)}>
          {() =>
            $hookShow && (
              <div class="box hook-box" data-test="hook-box">
                Watching hooks
              </div>
            )
          }
        </Transition>
      </section>

      <section class="scenario" data-test="scenario-group">
        <h2>7. TransitionGroup (enter/leave/move FLIP)</h2>
        <div class="group-controls">
          <button
            data-test="group-add"
            onClick={() => {
              $listItems = [
                ...$listItems,
                { id: $nextId, label: `Item ${$nextId}` },
              ];
              $nextId = $nextId + 1;
            }}>
            Add
          </button>
          <button
            data-test="group-remove"
            onClick={() => {
              if ($listItems.length > 0) {
                $listItems = $listItems.slice(0, -1);
              }
            }}>
            Remove last
          </button>
          <button
            data-test="group-shuffle"
            onClick={() => {
              // Deterministic non-trivial reorder so the FLIP move animation
              // always triggers (last → first).
              if ($listItems.length < 2) return;
              const next = [...$listItems];
              const tail = next.pop()!;
              next.unshift(tail);
              $listItems = next;
            }}>
            Shuffle (move last → first)
          </button>
          <button
            data-test="group-clear"
            onClick={() => {
              $listItems = [];
            }}>
            Clear
          </button>
        </div>
        <TransitionGroup
          name="list"
          tag="ul"
          each={() => $listItems}
          key={(it) => it.id}>
          {(it) => (
            <li class="list-item" data-test={`group-item-${it.id}`}>
              {it.label}
            </li>
          )}
        </TransitionGroup>
      </section>
    </main>
  );
}

createApp(App, '#app');
