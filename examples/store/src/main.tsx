import { createApp, createStore } from 'essor';

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

const useCartStore = createStore({
  state: {
    items: [] as CartItem[],
    nextId: 1,
  },
  getters: {
    totalQuantity: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: (state) => state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  },
  actions: {
    addItem(name: string, price: number) {
      const existing = this.items.find((item) => item.name === name);
      if (existing) {
        existing.quantity++;
        return;
      }
      this.items.push({ id: this.nextId++, name, price, quantity: 1 });
    },
    clear() {
      // splice keeps the mutation reactive; `items.length = 0` would not be tracked.
      this.items.splice(0);
    },
  },
});

// createStore returns a factory: every call produces a NEW store instance.
// Cross-component sharing therefore uses this single module-level instance.
const cart = useCartStore();

function ProductList() {
  return (
    <div class="box stack">
      <h2>Products</h2>
      <div class="row">
        <button data-test="add-apple" onClick={() => cart.addItem('Apple', 3)}>
          Add Apple ($3)
        </button>
        <button data-test="add-banana" onClick={() => cart.addItem('Banana', 2)}>
          Add Banana ($2)
        </button>
      </div>
      <p>
        Items in cart (seen from ProductList):{' '}
        <strong data-test="list-quantity">{cart.totalQuantity}</strong>
      </p>
    </div>
  );
}

function CartSummary() {
  return (
    <div class="box stack">
      <h2>Cart summary</h2>
      <p>
        Total quantity: <strong data-test="summary-quantity">{cart.totalQuantity}</strong>
      </p>
      <p>
        Total price: <strong data-test="summary-price">{cart.totalPrice}</strong>
      </p>
      <p>
        Distinct products: <strong data-test="summary-lines">{cart.items.length}</strong>
      </p>
      <button data-test="clear-cart" onClick={() => cart.clear()}>
        Clear cart
      </button>
    </div>
  );
}

function App() {
  return (
    <main data-test="example-root" class="page">
      <h1>Store Example</h1>
      <p class="note">
        createStore with state, getters, and actions — two sibling components share one store
        instance.
      </p>

      <section class="stack">
        <ProductList />
        <CartSummary />
      </section>
    </main>
  );
}

createApp(App, '#app');
