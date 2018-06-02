'use strict';

({ load }) => {
  const performance = load('w3/performance');
  const { Crypto } = load('w3/crypto');

  const attach = (name, value) => {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  };

  Object.getPrototypeOf(global).crypto = new Crypto();

  attach('performance', performance);
};
