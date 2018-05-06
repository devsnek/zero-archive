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
    global: false,
    console: false,
    performance: false,
    EventTarget: false,
    Event: false,
    CustomEvent: false,
  },
};
