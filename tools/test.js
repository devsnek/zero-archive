#!/usr/bin/env node

'use strict';

/* eslint-env node */

const { statSync, readdirSync, existsSync } = require('fs');
const path = require('path');
const { exec } = require('child_process');

if (!require('../config').exposeBinding) {
  console.error('ivan must be configured with --expose-binding to run tests');
  process.exit(1);
}

const readdirRecursive = (root, files = [], prefix = '') => {
  const dir = path.resolve(root, prefix);
  if (!existsSync(dir)) {
    return files;
  }
  if (statSync(dir).isDirectory()) {
    readdirSync(dir)
      .filter((n) => /^test/.test(n))
      .forEach((n) => readdirRecursive(root, files, path.join(prefix, n)));
  } else {
    files.push(dir);
  }

  return files;
};

const tests = readdirRecursive(path.resolve(process.cwd(), process.argv[2]));
const ivan = path.resolve(__dirname, '..', 'out', 'ivan');

console.log(`-- Queued ${tests.length} tests --`);

tests.forEach((filename) => {
  const command = `${ivan} ${filename}`;
  const rel = path.relative(process.cwd(), filename);
  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('FAIL', rel);
      console.error(stdout);
      console.error(stderr);
      console.error('Command:', command);
    } else {
      console.log('PASS', rel);
    }
  });
});
