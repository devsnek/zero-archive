const fs = do {
  const {
    open, fstat, read, close,
    O_RDONLY,
  } = binding('fs');

  ({
    readFile: async (path) => {
      let fd;
      try {
        fd = await open(path, O_RDONLY);
        const { size } = await fstat(fd);
        const buffer = await read(fd, size, -1);
        return buffer;
      } catch (e) {
        throw new Error(e.message);
      } finally {
        if (fd !== undefined) {
          await close(fd);
        }
      }
    },
  });
};

const ScriptWrap = binding('script_wrap');

global.Worker = class {};
global.SharedWorker = class {};

global.fetch_tests_from_worker = () => {};

global.fetch = async (url) => {
  const source = await fs.readFile(`./test/web-platform-tests${url}`);
  return {
    text: () => source,
  };
};

new Promise(async (resolve, reject) => {
  const harness = await fs.readFile('./test/web-platform-tests/resources/testharness.js');
  ScriptWrap.run('testharness.js', harness);

  const fail = reject;
  const pass = resolve;

  global.add_result_callback((test) => {
    if (test.status === 1) {
      fail({ test, reason: undefined });
    } else if (test.status === 2) {
      fail({ test, reason: 'timeout' });
    } else if (test.status === 3) {
      fail({ test, reason: 'incomplete' });
    } else {
      pass(test);
    }
  });

  global.add_completion_callback((tests, harnessStatus) => {
    if (harnessStatus.status === 2) {
      fail({
        test: {
          message: 'test harness should not timeout',
        },
        reason: 'timeout',
      });
    }
  });

  Error.prepareStackTrace = undefined;

  const target = edge.argv[1];
  const source = await fs.readFile(target);
  ScriptWrap.run(target, source);
})
/* eslint-disable no-console */

  .then((test) => {
    console.log(`✓ ${test.name}`);
  }, ({ test, reason = 'failure' }) => {
    console.error(`\u00D7 ${test.name} (${reason})`.trim());
    const e = new Error(test.message);
    e.stack = test.stack;
    console.error(e);
  });

/* eslint-enable no-console */
