'use strict';

({ namespace, load }) => {
  const InternalModule = load('internal_module');

  class Loader {
    async import(specifier) {
      if (InternalModule.exists(specifier))
        return InternalModule.load(specifier);
    }
  }

  namespace.Loader = Loader;
  namespace.loader = new Loader();
};
