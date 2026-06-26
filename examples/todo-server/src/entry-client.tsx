import 'todomvc-app-css/index.css';
import { hydrate } from 'essor';
import { App } from './main';

hydrate(App, '#app');
