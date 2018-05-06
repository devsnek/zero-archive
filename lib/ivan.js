'use strict';

(process, binding) => {
  const IVAN_VERSION = '0.0.1';
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
  const { setV8Flags } = binding('util');

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
    fn({ namespace: cache.namespace, binding, load, process });
    cache.exports = Object.keys(cache.namespace);
    return cache.namespace;
  };
  load.cache = {};

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

  const util = load('util');

  load('w3'); // attaches globals
  load('whatwg'); // attaches globals

  const { Loader, attachLoaderGlobals } = load('loader');

  if (!argv['allow-natives-syntax']) {
    setV8Flags('--no_allow_natives_syntax');
  }

  const onError = (e) => {
    console.error(e);
    process.exit(1);
  };

  const e = argv.e || argv.eval;
  if (e) {
    const loader = new Loader();
    attachLoaderGlobals(loader);
    if (!process.stdout.isTTY) {
      util.inspect.defaultOptions.colors = false;
    }
    loader.getModuleJob('[eval]')
      .then((job) => job.run())
      .then(console.log)
      .catch(onError);
  } else if (process.argv[0]) {
    const loader = new Loader();
    attachLoaderGlobals(loader);
    loader.import(process.argv[0]).catch(onError);
  } else {
    try {
      attachLoaderGlobals(new Loader());
      load('repl').start();
    } catch (err) {
      onError(err);
    }
  }
};
