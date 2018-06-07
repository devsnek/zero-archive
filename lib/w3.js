'use strict';

({ load }) => {
  const { Performance } = load('w3/performance');
  const { Crypto } = load('w3/crypto');

  const globalProto = Object.getPrototypeOf(global);

  globalProto.crypto = new Crypto();
  globalProto.performance = new Performance();
};
