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

const reporter = {
  pass: (message) => {
    console.log(`√ ${message}`);
  },
  fail: (message) => {
    console.error(`\u00D7 ${message}`);
  },
  reportStack: console.trace,
};

global.Worker = class {};
global.SharedWorker = class {};

global.fetch_tests_from_worker = () => {};

(async () => {
  const harness = await fs.readFile('./test/web-platform-tests/resources/testharness.js');
  ScriptWrap.run('testharness.js', harness);

  global.add_result_callback((test) => {
    if (test.status === 1) {
      reporter.fail(`${test.name}\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
    } else if (test.status === 2) {
      reporter.fail(`${test.name} (timeout)\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
    } else if (test.status === 3) {
      reporter.fail(`${test.name} (incomplete)\n`);
      reporter.reportStack(`${test.message}\n${test.stack}`);
    } else {
      reporter.pass(test.name);
    }
  });

  global.add_completion_callback((tests, harnessStatus) => {
    if (harnessStatus.status === 2) {
      reporter.fail('test harness should not timeout');
    }
  });

  const target = edge.argv[0];
  const source = await fs.readFile(target);
  ScriptWrap.run(target, source);
})().then(reporter.pass, reporter.fail);
