'use strict';

({ namespace, load }) => {
  const { Performance } = load('w3/performance');
  const { Crypto } = load('w3/crypto');
  const { Blob } = load('w3/blob');

  Object.defineProperties(global, {
    Blob: {
      value: Blob,
      writable: true,
      configurable: true,
      enumerable: false,
    },
  });

  const globalProto = Object.getPrototypeOf(global);

  namespace.crypto = globalProto.crypto = new Crypto();
  namespace.performance = globalProto.performance = new Performance();
};
