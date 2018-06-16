#!/usr/bin/env node

'use strict';

/* eslint-env node */

const {
  statSync, readdirSync, existsSync,
  promises: { readFile },
} = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { error, log } = console;

const RegExpEscape = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

if (!require('../out/config').exposeBinding) {
  error('edge must be configured with --expose-binding to run tests');
  process.exit(1);
}

const readdirRecursive = (root, files = [], prefix = '') => {
  const dir = path.resolve(root, prefix);
  if (!existsSync(dir)) {
    return files;
  }

  if (statSync(dir).isDirectory() && !dir.includes('/test/web-platform-tests')) {
    readdirSync(dir)
      .forEach((n) => readdirRecursive(root, files, path.join(prefix, n)));
  } else {
    const name = path.basename(dir);
    if (name.startsWith('test') && name.endsWith('.js')) {
      files.push(dir);
    }
  }

  return files;
};

const tests = readdirRecursive(path.resolve(process.cwd(), process.argv[2]));
const edge = path.resolve(__dirname, '..', 'out', 'edge');

log(`-- Queued ${tests.length} tests --`);

async function exec(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let output = '';
    child.stdout.on('data', (d) => {
      output += d;
    });
    child.stderr.on('data', (d) => {
      output += d;
    });
    child.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

const testPromises = tests.map(async (filename) => {
  const rel = path.relative(process.cwd(), filename);
  const isMessageTest = /\/test\/message\//.test(filename);

  let { code, output } = await exec(edge, [filename]);

  if (isMessageTest) {
    const patterns = (await readFile(filename.replace('.js', '.out'), 'utf8'))
      .split('\n')
      .map((line) => {
        const pattern = RegExpEscape(line.trimRight()).replace(/\\\*/g, '.*');
        return new RegExp(`^${pattern}$`);
      });

    const outlines = output.split('\n');

    code = 0;

    patterns.forEach((expected, index) => {
      const actual = outlines[index];
      if (expected.test(actual)) {
        return;
      }

      error('match failed');
      error(`line=${index + 1}`);
      error(`expect=${expected}`);
      error(`actual=${actual}`);
      code = -1;
    });
  }

  if (code !== 0) {
    error('FAIL', rel);
    error(output);
    error('Command:', `${edge} ${filename}`);

    return;
  }

  log('PASS', rel);
});

Promise.all(testPromises).then(() => {
  const wpt = require('../test/wpt_list');

  log(`\n-- [WPT] Queued ${wpt.length} tests --`);

  return Promise.all(wpt.map(async (name) => {
    const { output } = await exec(edge, ['./test/wpt.js', `./test/web-platform-tests/${name}`]);
    console.log(output);
  }));
});
