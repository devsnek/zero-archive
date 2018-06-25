'use strict';

/* eslint-env node */

module.exports = {
  extends: 'airbnb',
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'script',
  },
  env: {
    es6: true,
    node: false,
  },
  rules: {
    'strict': ['error', 'global'],
    'no-iterator': 'off',
    'no-bitwise': 'off',
    'global-require': 'off',
    'quote-props': ['error', 'consistent-as-needed'],
    'brace-style': ['error', '1tbs', { allowSingleLine: false }],
    'curly': ['error', 'all'],
    'no-param-reassign': 'off',
    'arrow-parens': ['error', 'always'],
    'no-multi-assign': 'off',
    'no-underscore-dangle': 'off',
    'no-restricted-syntax': 'off',
    'object-curly-newline': 'off',
    'prefer-const': ['error', { destructuring: 'all' }],
    'class-methods-use-this': 'off',
    'no-unused-expressions': 'off',
    'consistent-return': 'off',
    'no-continue': 'off',
    'operator-linebreak': ['error', 'after'],
    'implicit-arrow-linebreak': 'off',
    'react/no-this-in-sfc': 'off',
  },
  globals: {
    Intl: false,
    WebAssembly: false,
    BigInt: false,
    global: false,
    console: false,
  },
};
