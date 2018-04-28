'use strict';

({ namespace, binding, load }) => {
  const { ModuleWrap } = binding('module_wrap');
  const { readFile } = load('fs');
  const { createDynamicModule } = load('loader/create_dynamic_module');

  const translators = namespace.translators = new Map();

  translators.set('esm', async (specifier, src) => {
    const source = src || await readFile(specifier);
    return new ModuleWrap(source, specifier);
  });

  translators.set('builtin', async (specifier) => {
    const id = specifier.slice(6); // slice "@ivan/"
    load(id);
    const { namespace: ns, exports } = load.cache[id];
    return createDynamicModule(exports, specifier, (reflect) => {
      for (const e of exports)
        reflect.exports[e].set(ns[e]);
    });
  });
};
