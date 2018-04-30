'use strict';

(process, binding) => {
  const IVAN_VERSION = '0.0.1';

  const ScriptWrap = binding('script_wrap');
  const natives = binding('natives');
  const debug = binding('debug');

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
