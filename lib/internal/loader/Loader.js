'use strict';

({ namespace, load, debug }) => {
  const InternalModule = load('internal_module');
  const { translators } = load('internal/loader/Translators');

  class Loader {
    async import(specifier) {
      if (InternalModule.exists(specifier))
        return InternalModule.load(specifier);

      if (/.js/.test(specifier)) // FIXME: this is disgusting
        return translators.get('esm')(specifier);

      throw new Error('unimplemented');
    }
  }

  namespace.Loader = Loader;
  namespace.loader = new Loader();
};
