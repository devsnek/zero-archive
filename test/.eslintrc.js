'use strict';

/* eslint-env node */

module.exports = {
  extends: '../.eslintrc.js',
  parserOptions: {
    sourceType: 'module',
  },
  env: {
    node: false,
  },
  rules: {
    'import/no-dynamic-require': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
  },
  globals: {
    global: false,
    console: false,
    performance: false,
    EventTarget: false,
    Event: false,
    CustomEvent: false,
    addEventListener: false,
    removeEventListener: false,
    dispatchEvent: false,
  },
};
