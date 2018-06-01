'use strict';

(process, binding) => {
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
  const { setV8Flags, setExitHandler } = binding('util');

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

  setExitHandler(() => {
    if (global.dispatchEvent !== undefined) {
      const e = new global.Event('exit', { cancelable: false });
      global.dispatchEvent(e);
    }
  });

  load('errors');

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
  const { console } = load('whatwg'); // attaches globals

  const { Loader, attachLoaderGlobals } = load('loader');

  const onError = (e) => {
    try {
      console.error(e);
    } catch (err) {
      process.stdout.write(`${e}\n`);
    } finally {
      process.exit(1);
    }
  };

  if (!argv['allow-natives-syntax']) {
    setV8Flags('--no_allow_natives_syntax');
  }

  if (config.exposeBinding === true) {
    global.binding = binding;
  }

  const { getURLFromFilePath } = load('whatwg/url');

  const e = argv.e || argv.eval;
  const loader = new Loader(`${getURLFromFilePath(process.cwd)}`);
  attachLoaderGlobals(loader);
  if (e) {
    loader.getModuleJob('[eval]')
      .then((job) => job.run())
      .then(console.log)
      .catch(onError);
  } else if (process.argv[0]) {
    loader.import(process.argv[0]).catch(onError);
  } else {
    try {
      load('repl').start();
    } catch (err) {
      onError(err);
    }
  }
};
