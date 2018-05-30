#!/usr/bin/env node

'use strict';

/* eslint-env node */

const { statSync, readdirSync, existsSync } = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

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

const ivan = path.resolve(__dirname, '..', 'out', 'ivan');
try {
  execSync(`${ivan} -e "binding"`);
} catch (e) {
  console.error('Compile ivan with binding support');
  process.exit(1);
}

const tests = readdirRecursive(path.resolve(process.cwd(), process.argv[2]));

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
