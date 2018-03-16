'use strict';

(process, script, binding, debug) => {
  class InternalModule {
    constructor(id) {
      this.filename = `${id}.js`;
      this.id = id;
      this.namespace = {};
      this.loaded = false;
      this.loading = false;
    }

    run() {
      this.loading = true;
      try {
        const source = InternalModule.sources[this.id];
        const fn = script(this.filename, source);
        fn({
          process, binding, debug,
          load: InternalModule.load,
          namespace: this.namespace,
        });
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    }

    static load(id) {
      if (id === 'internal_module')
        return InternalModule;

      const cached = InternalModule.cache[id];
      if (cached && (cached.loaded || cached.loading))
        return cached.namespace;

      if (!InternalModule.exists(id)) {
        const err = new Error(`No such internal module: ${id}`);
        err.code = err.name = 'ERR_UNKNOWN_INTERNAL_MODULE';
        throw err;
      }

      const module = new InternalModule(id);
      InternalModule.cache[id] = module;
      module.run();
      Object.freeze(module.namespace);
      return module.namespace;
    }

    static exists(id) {
      return Reflect.has(InternalModule.sources, id);
    }
  }
  InternalModule.cache = {};
  InternalModule.sources = binding('natives');

  global.process = process;
  global.console = InternalModule.load('console').default;

  const { argv } = InternalModule.load('internal/argparse');
  process.argv0 = argv.shift();
  process.argv = argv;

  if (argv[0]) {
    const { loader } = InternalModule.load('internal/loader/Loader');
    loader.import(argv[0]);
  } else {
    /* eslint-disable no-console */
    console.log('      -- Ivan --\nThe friendly JS runtime');
    console.log('Usage: ivan [options] file');
    /* eslint-enable no-console */
  }
};
