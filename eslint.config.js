import { estjs } from '@estjs/eslint-config';

export default estjs({
  unicorn: {
    'prefer-modern-dom-apis': 'off',
    'prefer-dom-node-remove': 'off',
    'prefer-string-replace-all': 'off',
  },
  typescript: {
    '@typescript-eslint/no-this-alias': 'off',
  },
  javascript: {
    'no-prototype-builtins': 'off',
  },
});
