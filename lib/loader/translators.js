'use strict';

({ namespace, binding, load, process }) => {
  const { ModuleWrap } = binding('module_wrap');
  const { readFile } = load('fs');
  const { createDynamicModule } = load('loader/create_dynamic_module');
  const { getFilePathFromURL } = load('whatwg/url');

  const translators = namespace.translators = new Map();

  translators.set('esm', async (specifier) => {
    const source = specifier === '[eval]' ?
      process.argv[0] :
      await readFile(getFilePathFromURL(specifier));
    return new ModuleWrap(source, specifier);
  });

  translators.set('builtin', async (specifier) => {
    const id = specifier.slice(6); // slice "@ivan/"
    load(id);
    const { namespace: ns, exports } = load.cache[id];
    return createDynamicModule(exports, specifier, (reflect) => {
      for (const e of exports) {
        reflect.exports[e].set(ns[e]);
      }
    });
  });
};
