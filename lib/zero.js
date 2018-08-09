'use strict';

(process, binding, setCallbacks) => {
  delete Intl.v8BreakIterator;

  const utilBinding = binding('util');
  const debug = binding('debug');

  process.versions.zero = '0.0.1';
  Object.freeze(process.versions);

  const ZERO_HELP = `
  zero [OPTIONS] <entry>

  -h, --help      show list of command line options
  -v, --version   show version of zero
  -e, --eval      evaluate module source from the current working directory
  -m, --mode      Set parse mode of the entry point. Defaults to "module"
`;

  const options = {
    mode: 'module',
    eval: undefined,
    entry: undefined,
  };

  {
    const handle = (name, value) => {
      if (name === 'v' || name === 'version') {
        debug.log(process.versions.zero);
        process.exit(0);
        return;
      }

      if (name === 'h' || name === 'help') {
        debug.log(ZERO_HELP);
        process.exit(0);
        return;
      }

      if (name === 'e' || name === 'eval') {
        options.eval = value;
        return;
      }

      if (name === 'm' || name === 'mode') {
        options.mode = value;
        return;
      }

      throw new RangeError(`Invalid argument: ${name}`);
    };

    let pastOptions = false;
    const userArgv = [];

    process.argv0 = process.argv.shift();

    for (let i = 0; i < process.argv.length; i += 1) {
      const arg = process.argv[i];

      if (pastOptions) {
        userArgv.push(arg);
      } else if (arg === '--') {
        pastOptions = true;
      } else if (/^-[^-]/.test(arg)) {
        if (arg.length === 2) {
          i += 1;
          handle(arg.slice(1), process.argv[i]);
        } else {
          arg.slice(1).split('').map((a) => handle(a, true));
        }
      } else if (/^--(.+?)=/.test(arg)) {
        const [name, value] = arg.slice(2).split(/=(.+)/);
        handle(name, value);
      } else if (/^--/.test(arg)) {
        i += 1;
        handle(arg.slice(2), process.argv[i]);
      } else {
        options.entry = arg;
        userArgv.push(arg);
        pastOptions = true;
      }
    }

    process.argv = userArgv;
  }

  Object.defineProperties(this, {
    global: {
      value: this,
      writable: true,
      enumerable: false,
      configurable: true,
    },
    environment: {
      value: new (class Environment {
        argv = process.argv;

        argv0 = process.argv0;

        getEnv(name) {
          name = `${name}`;
          return utilBinding.getEnv(name);
        }

        setEnv(name, value) {
          name = `${name}`;
          value = `${value}`;
          return utilBinding.setEnv(name, value);
        }

        deleteEnv(name) {
          name = `${name}`;
          return utilBinding.unsetEnv(name);
        }
      })(),
      enumerable: false,
      writable: false,
      configurable: false,
    },
  });

  const ScriptWrap = binding('script_wrap');
  const natives = binding('natives');

  const {
    setV8Flags,
    previewEntries: _previewEntries,
  } = utilBinding;

  // patch previewEntries to property pair maps
  utilBinding.previewEntries = (value) => {
    const [entries, isKeyed] = _previewEntries(value);
    if (isKeyed) {
      const len = entries.length / 2;
      const ret = new Array(len);
      for (let i = 0; i < len; i += 1) {
        ret[i] = [entries[2 * i], entries[(2 * i) + 1]];
      }
      return ret;
    }
    return entries;
  };

  const config = JSON.parse(natives['out/config']);

  const PrivateSymbol = config.exposePrivateSymbols ?
    Symbol :
    ScriptWrap.run('[NativeSyntax]', '(name) => %CreatePrivateSymbol(name);');

  const kCustomInspect = PrivateSymbol();

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
      kCustomInspect,
    });
    cache.exports = Object.keys(cache.namespace);
    return cache.namespace;
  };
  load.cache = {};

  load('errors');
  load('ffi'); // attaches to global

  Object.defineProperties(global, {
    MIME: {
      value: load('mime').MIME,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });

  const { TTYWrap } = load('tty');

  process.stdout = new TTYWrap(1);
  process.stderr = new TTYWrap(2);

  load('w3'); // attaches globals
  const { console } = load('whatwg'); // attaches globals

  const { Event, dispatchEvent } = global;

  const onExit = () => {
    if (global.dispatchEvent !== undefined) {
      const e = new Event('exit', { cancelable: false });
      dispatchEvent(e);
    }
  };

  const kPromise = PrivateSymbol('kPromise');
  const kValue = PrivateSymbol('kEvent');
  class PromiseEvent extends Event {
    constructor(type, promise, value) {
      super(type, { cancelable: false });
      this[kPromise] = promise;
      this[kValue] = value;
    }

    get promise() {
      return this[kPromise];
    }

    get value() {
      return this[kValue];
    }
  }
  const promiseCallbackTypes = [
    'rejectWithNoHandler',
    'handlerAddedAfterReject',
    'rejectAfterResolved',
    'resolveAfterResolved',
  ];
  const promiseCallback = (type, promise, value) => {
    const e = new PromiseEvent(promiseCallbackTypes[type], promise, value);
    dispatchEvent(e);
  };

  setCallbacks(onExit, promiseCallback);

  const { fileSystem } = load('file_system');
  global.fileSystem = fileSystem;

  const { getURLFromFilePath, URL } = load('whatwg/url');
  const { Loader, attachLoaderGlobals } = load('loader');

  if (!config.allowNativesSyntax) {
    setV8Flags('--no_allow_natives_syntax');
  }

  if (config.exposeBinding === true) {
    global.binding = binding;
  }

  const cwdURL = `${getURLFromFilePath(process.cwd)}/`;

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

  process.options = options;

  if (options.eval) {
    if (options.mode === 'module') {
      loader.getModuleJob('[eval]')
        .then((job) => job.run())
        .then(({ result }) => console.log(result))
        .catch(onError);
    } else if (options.mode === 'script') {
      try {
        console.log(ScriptWrap.run('[eval]', options.eval));
      } catch (err) {
        onError(err);
      }
    } else {
      throw new RangeError('invalid mode');
    }
  } else if (options.entry) {
    if (options.mode === 'module') {
      loader.import(options.entry).catch(onError);
    } else if (options.mode === 'script') {
      const url = new URL(options.entry, cwdURL);
      fileSystem.readFile(url, { encoding: 'utf8' })
        .then((src) => ScriptWrap.run(url, src))
        .catch(onError);
    } else {
      throw new RangeError('invalid mode');
    }
  } else {
    try {
      load('repl').start();
    } catch (err) {
      onError(err);
    }
  }
};
