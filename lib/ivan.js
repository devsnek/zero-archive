'use strict';

const IVAN_VERSION = '0.0.1';

(process, binding) => {
  const ScriptWrap = binding('script_wrap');
  const natives = binding('natives');
  const debug = binding('debug');

  const load = (specifier) => {
    if (load.cache[specifier] !== undefined)
      return load.cache[specifier];
    const source = natives[specifier];
    if (source === undefined)
      throw new Error(`no such builtin: ${specifier}`);
    const fn = ScriptWrap.run(specifier, source);
    const namespace = load.cache[specifier] = {};
    fn({ namespace, binding, load });
    return namespace;
  };
  load.cache = {};

  process.argv = load('argparse').default(process.argv);
  process.argv.shift();

  if (process.argv.v || process.argv.version) {
    debug.log(IVAN_VERSION);
    return;
  }

  const console = global.console = load('console').default;

  const { Loader } = load('loader');

  if (process.argv[0]) {
    const loader = new Loader();
    loader.import(process.argv[0]).catch(console.error);
  } else {
    debug.log(`Usage:
  ivan [OPTIONS] <entry>

  -h, --help      show list of command line options
  -v, --version   show version of ivan
`);
  }
};
