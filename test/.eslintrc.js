'use strict'; // eslint-disable-line

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
    URL: false,
    EventTarget: false,
    Event: false,
    CustomEvent: false,
    addEventListener: false,
    removeEventListener: false,
    dispatchEvent: false,
    TextEncoder: false,
    TextDecoder: false,
    Headers: false,
    setTimeout: true,
    setInterval: true,
    clearTimeout: true,
    clearInterval: true,
    DynamicLibrary: false,
    environment: false,
    binding: true,
    fileSystem: false,
  },
};
