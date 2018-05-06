'use strict';

({ load }) => {
  const performance = load('w3/performance');

  const attach = (name, value) => {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  };

  attach('performance', performance);
};
