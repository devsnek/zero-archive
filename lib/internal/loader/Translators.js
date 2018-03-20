'use strict';

const translators = new Map();

({ namespace, binding, load }) => {
  const { ModuleWrap } = binding('module_wrap');
  const fs = load('fs');

  translators.set('esm', (url) => {
    const source = fs.readFileSync(url);
    return {
      module: new ModuleWrap(source, url),
      reflect: undefined,
    };
  });

  namespace.translators = translators;
};
