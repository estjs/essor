import { estjs } from '@estjs/eslint-config';

export default estjs(
  {
    unicorn: {
      'unicorn/prefer-modern-dom-apis': 'off',
      'unicorn/prefer-dom-node-remove': 'off',
      'unicorn/prefer-dom-node-append': 'off',
      'unicorn/no-lonely-if': 'off',
      'unicorn/no-new-array': 'off',
      'unicorn/filename-case': 'off',
    },
    typescript: {
      '@typescript-eslint/no-this-alias': 'off',
    },
    javascript: {
      'no-prototype-builtins': 'off',
    },
    ignores: ['AGENTS.md'],
  },
  { unocss: false, node: false },
);
