'use strict';

({ binding, namespace, load }) => {
  const ScriptWrap = binding('script_wrap');

  Object.assign(namespace, ScriptWrap.run('[NativeSyntax]', `
({
  privateSymbol: (name) => %CreatePrivateSymbol(name),
  __proto__: null,
});
`));


  namespace.defineIDLClass = (proto, classStr, obj) => {
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
  };

  Object.assign(namespace, load('util/inspect'));
};
