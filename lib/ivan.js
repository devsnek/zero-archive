'use strict';

(process, binding, setCallbacks) => {
  Object.defineProperty(this, 'global', {
    value: this,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const IVAN_VERSION = '0.0.1';
  process.versions.ivan = IVAN_VERSION;

  const IVAN_HELP = `
  ivan [OPTIONS] <entry>

  -h, --help      show list of command line options
  -v, --version   show version of ivan
  -e, --eval      evaluate module source from the current working directory
`;

  const ScriptWrap = binding('script_wrap');
  const natives = binding('natives');
  const debug = binding('debug');
  const { TTYWrap } = binding('tty');
  const { setV8Flags, safeToString } = binding('util');

  const maybeUnhandledPromises = new WeakMap();
  const pendingUnhandledRejections = [];
  const asyncHandledRejections = [];
  let lastPromiseId = 0;
  const unhandledRejectionErrName = 'UnhandledPromiseRejectionWarning';

  // eslint bug thinks these are never re-assigned
  let console; // eslint-disable-line prefer-const
  let kNoErrorFormat; // eslint-disable-line prefer-const

  const onUnhandledRejection = (promise, reason, handled) => {
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
          if (kNoErrorFormat !== undefined) {
            warning[kNoErrorFormat] = true;
          }
          warning.name = 'PromiseRejectionHandledWarning';
          warning.id = uid;
          asyncHandledRejections.push({ promise, warning });
          return true;
        }
      }
    } else {
      lastPromiseId += 1;
      maybeUnhandledPromises.set(promise, {
        reason,
        uid: lastPromiseId,
        warned: false,
      });
      pendingUnhandledRejections.push(promise);
    }
  };

  const onNextTick = () => {
    while (asyncHandledRejections.length > 0) {
      const { warning } = asyncHandledRejections.shift();
      console.warn(warning);
    }
    let len = pendingUnhandledRejections.length;
    while (len) {
      len -= 1;
      const promise = pendingUnhandledRejections.shift();
      const promiseInfo = maybeUnhandledPromises.get(promise);
      if (promiseInfo !== undefined) {
        promiseInfo.warned = true;
        const { reason, uid } = promiseInfo;
        try {
          if (reason instanceof Error) {
            console.warn(unhandledRejectionErrName, reason.stack);
          } else {
            console.warn(unhandledRejectionErrName, safeToString(reason));
          }
        } catch (e) {} // eslint-disable-line no-empty
        const warning = new Error(`
This error originated either by throwing
inside of an async function without a catch block, or by rejecting a promise
which was not handled with .catch(). (rejection id: ${uid})`.trim());
        warning.name = unhandledRejectionErrName;
        if (kNoErrorFormat !== undefined) {
          warning[kNoErrorFormat] = true;
        }
        try {
          if (reason instanceof Error) {
            warning.stack = reason.stack;
          }
        } catch (err) {} // eslint-disable-line no-empty
        console.warn(warning);
      }
    }
  };

  const onExit = () => {
    if (global.dispatchEvent !== undefined) {
      const e = new global.Event('exit', { cancelable: false });
      global.dispatchEvent(e);
    }
  };

  setCallbacks(onUnhandledRejection, onNextTick, onExit);

  const config = JSON.parse(natives.config);

  const { PrivateSymbol } = ScriptWrap.run('[NativeSyntax]', `
({
  PrivateSymbol: (name) => %CreatePrivateSymbol(name),
  __proto__: null,
});
`);

  const load = (specifier) => {
    if (load.cache[specifier] !== undefined) {
      return load.cache[specifier].namespace;
    }
    const source = natives[specifier];
    if (source === undefined) {
      throw new Error(`no such builtin: ${specifier}`);
    }
    const fn = ScriptWrap.run(specifier, source);
    const cache = load.cache[specifier] = {
      namespace: { __proto__: null },
      exports: undefined,
    };
    fn({
      namespace: cache.namespace,
      binding,
      load,
      process,
      PrivateSymbol,
      config,
    });
    cache.exports = Object.keys(cache.namespace);
    return cache.namespace;
  };
  load.cache = {};

  ({ kNoErrorFormat } = load('errors'));

  const argv = process.argv = load('argparse').default(process.argv);
  process.argv0 = argv.shift();

  if (argv.v || argv.version) {
    debug.log(IVAN_VERSION);
    return;
  }

  if (argv.h || argv.help) {
    debug.log(IVAN_HELP);
    return;
  }

  process.stdout = new TTYWrap(1);
  process.stderr = new TTYWrap(2);

  load('w3'); // attaches globals
  ({ console } = load('whatwg')); // attaches globals
  const { Loader, attachLoaderGlobals } = load('loader');
  const { getURLFromFilePath, getFilePathFromURL, URL } = load('whatwg/url');

  if (!config.allowNativesSyntax) {
    setV8Flags('--no_allow_natives_syntax');
  }

  if (config.exposeBinding === true) {
    global.binding = binding;
  }

  const cwdURL = `${getURLFromFilePath(process.cwd)}/`;

  const entryMode = argv.mode || 'module';

  const loader = new Loader(cwdURL);
  attachLoaderGlobals(loader);

  const onError = (e) => {
    try {
      console.error(e);
    } catch (err) {
      process.stdout.write(`${e}\n`);
    } finally {
      process.exit(1);
    }
  };

  if (argv.e || argv.eval) {
    if (entryMode === 'module') {
      loader.getModuleJob('[eval]')
        .then((job) => job.run())
        .then(console.log)
        .catch(onError);
    } else {
      try {
        console.log(ScriptWrap.run('[eval]', process.argv[0]));
      } catch (err) {
        onError(err);
      }
    }
  } else if (process.argv[0]) {
    if (entryMode === 'module') {
      loader.import(process.argv[0]).catch(onError);
    } else if (entryMode === 'script') {
      const url = new URL(process.argv[0], cwdURL);
      const filename = getFilePathFromURL(url);
      load('fs').readFile(filename)
        .then((src) => ScriptWrap.run(url, src))
        .catch(onError);
    }
  } else {
    try {
      load('repl').start();
    } catch (err) {
      onError(err);
    }
  }
};
