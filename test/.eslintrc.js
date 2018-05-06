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
  globals: {
    WebAssembly: false,
    BigInt: false,
    global: false,
    console: false,
  },
};
