const ScriptWrap = binding('script_wrap');

global.Worker = class {};
global.SharedWorker = class {};

global.fetch_tests_from_worker = () => {};

const { readFile } = fileSystem;

const fetchDecoder = new TextDecoder('utf8');
global.fetch = async (url) => {
  const source = await readFile(`./test/web-platform-tests${url}`);
  return {
    text: () => fetchDecoder.decode(source),
  };
};

new Promise((resolve, reject) => {
  (async () => {
    const harness = await readFile(
      new URL('web-platform-tests/resources/testharness.js', import.meta.url),
      { encoding: 'utf8' },
    );
    ScriptWrap.run('testharness.js', harness);

    const fail = reject;
    const pass = resolve;

    global.add_result_callback((test) => {
      if (test.status === 1) {
        fail({ test, reason: 'failure' });
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

    const target = environment.argv[1];
    const source = await readFile(target, { encoding: 'utf8' });

    // assign global.self late to trick wpt into
    // thinking this is a shell environment
    global.self = global;

    ScriptWrap.run(target, source);
  })().catch(reject);
})

/* eslint-disable no-console */

  .then((test) => {
    console.log(`✓ ${test.name}`);
  }, (e) => {
    if (e instanceof Error) {
      console.error(e);
    } else {
      const { test, reason } = e;
      console.error(`\u00D7 ${test.name} (${reason})`.trim());
      const err = new Error(test.message);
      err.stack = test.stack;
      console.error(err);
    }
  });

/* eslint-enable no-console */
