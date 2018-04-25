'use strict';

const IVAN_VERSION = '0.0.1';

(process, binding) => {
  const ScriptWrap = binding('script_wrap');
  const natives = binding('natives');
  const debug = binding('debug');
  const { setNextTickHandler, setPromiseRejectionHandler, safeToString } = binding('util');

  const maybeUnhandledPromises = new WeakMap();
  const pendingUnhandledRejections = [];
  const asyncHandledRejections = [];
  let lastPromiseId = 0;
  const unhandledRejectionErrName = 'UnhandledPromiseRejectionWarning';

  setNextTickHandler(() => {
    debug.log('tick tick tick');

    while (asyncHandledRejections.length > 0) {
      const { warning } = asyncHandledRejections.shift();
      console.warn(warning);
    }

    let len = pendingUnhandledRejections.length;
    while (len--) {
      const promise = pendingUnhandledRejections.shift();
      const promiseInfo = maybeUnhandledPromises.get(promise);
      if (promiseInfo !== undefined) {
        promiseInfo.warned = true;
        const { reason, uid } = promiseInfo;
        try {
          if (reason instanceof Error)
            console.warn(reason.stack, unhandledRejectionErrName);
          else
            console.warn(safeToString(reason), unhandledRejectionErrName);
        } catch (e) {} // eslint-disable-line no-empty
        const warning = new Error(
          'Unhandled promise rejection. This error originated either by ' +
          'throwing inside of an async function without a catch block, ' +
          'or by rejecting a promise which was not handled with .catch(). ' +
          `(rejection id: ${uid})`);
        warning.name = unhandledRejectionErrName;
        try {
          if (reason instanceof Error)
            warning.stack = reason.stack;
        } catch (err) {} // eslint-disable-line no-empty
        console.warn(warning);
      }
    }
  });

  setPromiseRejectionHandler((promise, reason, handled) => {
    console.log(promise, reason, handled);
    if (handled) {
      const promiseInfo = maybeUnhandledPromises.get(promise);
      if (promiseInfo !== undefined) {
        maybeUnhandledPromises.delete(promise);
        if (promiseInfo.warned) {
          const { uid } = promiseInfo;
          // Generate the warning object early to get a good stack trace.
          // eslint-disable-next-line no-restricted-syntax
          const warning = new Error('Promise rejection was handled ' +
                                    `asynchronously (rejection id: ${uid})`);
          warning.name = 'PromiseRejectionHandledWarning';
          warning.id = uid;
          asyncHandledRejections.push({ promise, warning });
          return true;
        }
      }
    } else {
      maybeUnhandledPromises.set(promise, {
        reason,
        uid: ++lastPromiseId,
        warned: false,
      });
      pendingUnhandledRejections.push(promise);
    }
  });

  const load = (specifier) => {
    if (load.cache[specifier] !== undefined)
      return load.cache[specifier].namespace;
    const source = natives[specifier];
    if (source === undefined)
      throw new Error(`no such builtin: ${specifier}`);
    const fn = ScriptWrap.run(specifier, source);
    const cache = load.cache[specifier] = {
      namespace: {},
      exports: undefined,
    };
    fn({ namespace: cache.namespace, binding, load });
    cache.exports = Object.keys(cache.namespace);
    return cache.namespace;
  };
  load.cache = {};

  const argv = process.argv = load('argparse').default(process.argv);
  argv.shift();

  if (argv.v || argv.version) {
    debug.log(IVAN_VERSION);
    return;
  }

  const console = global.console = load('console').default;

  const { Loader } = load('loader');

  const e = argv.e || argv.eval;
  if (e) {
    const loader = new Loader();
    loader.run(process.argv[0])
      .then(console.log)
      .catch(console.error);
  } else if (process.argv[0]) {
    const loader = new Loader();
    loader.import(process.argv[0]).catch(console.error);
  } else {
    debug.log(`Usage:
  ivan [OPTIONS] <entry>

  -h, --help      show list of command line options
  -v, --version   show version of ivan
  -e, --eval      evaluate module source from the current working directory
`);
  }
};
