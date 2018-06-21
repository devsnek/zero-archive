#!/usr/bin/env node

'use strict';

/* eslint-env node */

const {
  statSync, readdirSync, existsSync,
  promises: { readFile },
} = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RegExpEscape = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

const { log, warn } = console;

if (!require('../out/config').exposeBinding) {
  warn('zero must be configured with --expose-binding to run tests');
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

async function exec(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
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

const zero = path.resolve(__dirname, '..', 'out', 'zero');

const runZeroTests = () => {
  const tests = readdirRecursive(path.resolve(process.cwd(), process.argv[2]));
  log(`-- Queued ${tests.length} tests --`);

  return Promise.all(tests.map(async (filename) => {
    const rel = path.relative(process.cwd(), filename);
    const isMessageTest = /\/test\/message\//.test(filename);

    const source = await readFile(filename, 'utf8');
    {
      const match = /^\/\/ build-shared (.+?)$/m.exec(source);
      if (match) {
        const dir = path.dirname(filename);
        const cxxfile = path.resolve(dir, match[1]);
        const sfile = path.resolve(dir, `lib${path.basename(match[1]).split('.')[0]}.shared`);
        const { code, output } = await exec('gcc', [
          '-dynamiclib', '-undefined', 'suppress', '-flat_namespace', cxxfile, '-o', sfile,
        ]);
        if (code !== 0) {
          warn(output);
          throw new Error(`building ${cxxfile} failed`);
        }
      }
    }

    let env = { ...process.env };

    {
      const match = /^\/\/ env ([^=]+?)=(.+?)$/m.exec(source);
      if (match) {
        const [, name, value] = match;
        env[name] = value;
      }
    }

    let { code, output } = await exec(zero, [filename], { env });

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

        warn('match failed');
        warn(`line=${index + 1}`);
        warn(`expect=${expected}`);
        warn(`actual=${actual}`);
        code = -1;
      });
    }

    if (code !== 0) {
      warn('FAIL', rel);
      warn(output);
      warn('Command:', `${zero} ${filename}`);

      throw new Error('failed');
    }

    log('PASS', rel);
  }));
};

const runWPT = () => {
  const wpt = require('../test/wpt_list');

  log(`\n-- [WPT] Queued ${wpt.length} tests --`);

  return Promise.all(wpt.map(async (name) => {
    const { output } = await exec(zero, ['./test/wpt.js', `./test/web-platform-tests/${name}`]);
    if (/\u00D7/.test(output)) {
      warn(output);
      throw new Error('failed');
    } else {
      log(output);
    }
  }));
};

(async () => {
  let failed = false;

  try {
    await runZeroTests();
  } catch {
    failed = true;
  }
  try {
    await runWPT();
  } catch {
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
})();
