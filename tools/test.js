#!/usr/bin/env node

'use strict';

/* eslint-env node */

const {
  statSync, readdirSync, existsSync,
  promises: { readFile },
} = require('fs');

const path = require('path');
const { exec } = require('child_process');

const { error, log } = console;

if (!require('../config').exposeBinding) {
  error('ivan must be configured with --expose-binding to run tests');
  process.exit(1);
}

const readdirRecursive = (root, files = [], prefix = '') => {
  const dir = path.resolve(root, prefix);
  if (!existsSync(dir)) {
    return files;
  }
  if (statSync(dir).isDirectory()) {
    readdirSync(dir)
      .filter((n) => n.startsWith('test') && n.endsWith('.js'))
      .forEach((n) => readdirRecursive(root, files, path.join(prefix, n)));
  } else {
    files.push(dir);
  }

  return files;
};

const tests = readdirRecursive(path.resolve(process.cwd(), process.argv[2]));
const ivan = path.resolve(__dirname, '..', 'out', 'ivan');

log(`-- Queued ${tests.length} tests --`);

tests.forEach(async (filename) => {
  const lines = (await readFile(filename, 'utf8')).split('\n');
  const args = (lines.find((l) => l.startsWith('// Arguments: ')) || '')
    .replace('// Arguments: ', '');

  const command = `${ivan}${args ? ` ${args} ` : ''}${filename}`;
  const rel = path.relative(process.cwd(), filename);
  exec(command, (err, stdout, stderr) => {
    if (err) {
      error('FAIL', rel);
      error(stdout);
      error(stderr);
      error('Command:', command);
    } else {
      log('PASS', rel);
    }
  });
});
