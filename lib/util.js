'use strict';

({ namespace, load }) => {
  Object.assign(namespace, load('util/inspect'));

  function defineIDLClass(proto, classStr, obj) {
    // https://heycam.github.io/webidl/#dfn-class-string
    Object.defineProperty(proto, Symbol.toStringTag, {
      writable: false,
      enumerable: false,
      configurable: true,
      value: classStr,
    });

    // https://heycam.github.io/webidl/#es-operations
    for (const key of Object.keys(obj)) {
      Object.defineProperty(proto, key, {
        writable: true,
        enumerable: true,
        configurable: true,
        value: obj[key],
      });
    }
    for (const key of Object.getOwnPropertySymbols(obj)) {
      Object.defineProperty(proto, key, {
        writable: true,
        enumerable: false,
        configurable: true,
        value: obj[key],
      });
    }
  }

  namespace.defineIDLClass = defineIDLClass;
};
