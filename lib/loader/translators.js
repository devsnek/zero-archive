'use strict';

({ namespace, binding, load, process }) => {
  const { ModuleWrap } = binding('module_wrap');
  const { fileSystem } = load('file_system');
  const { createDynamicModule } = load('loader/create_dynamic_module');
  const { parseDataURL } = load('whatwg/url');

  const translators = namespace.translators = new Map();

  const translateModule = async (specifier) => {
    const source = do {
      if (specifier === '[eval]') {
        process.options.eval;
      } else if (/^data:/.test(specifier)) {
        parseDataURL(specifier).body;
      } else {
        await fileSystem.readFile(specifier, { encoding: 'utf8' });
      }
    };
    return new ModuleWrap(source, specifier);
  };

  translators.set('esm', translateModule);


  translators.set('builtin', async (specifier) => {
    const id = specifier.slice(6); // slice "@zero/"
    load(id);
    const { namespace: ns, exports } = load.cache[id];
    return createDynamicModule(exports, specifier, (reflect) => {
      for (const e of exports) {
        reflect.exports[e].set(ns[e]);
      }
    });
  });
};
