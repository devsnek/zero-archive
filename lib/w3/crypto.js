'use strict';

({ namespace, load, binding }) => {
  const {
    isInt8Array,
    isUint8Array,
    isInt16Array,
    isUint16Array,
    isInt32Array,
    isUint32Array,
    isUint8ClampedArray,
  } = binding('types');
  const { defineIDLClass } = load('util');

  // R.I.P. perf
  const isIntegerTypedArray = (val) =>
    isInt8Array(val) ||
      isUint8Array(val) ||
      isInt16Array(val) ||
      isUint16Array(val) ||
      isInt32Array(val) ||
      isUint32Array(val) ||
      isUint8ClampedArray(val);

  class SubtleCrypto {}

  defineIDLClass(SubtleCrypto, 'SubtleCrypto', {
    encrypt() {},
    decrypt() {},
    sign() {},
    verify() {},
    digest() {},
    generateKey() {},
    deriveKey() {},
    deriveBits() {},
    importKey() {},
    exportKey() {},
    wrapKey() {},
    unwrapKey() {},
  });

  class Crypto {}

  defineIDLClass(Crypto, 'Crypto', {
    subtle: new SubtleCrypto(),
    getRandomValues(array) {
      if (!isIntegerTypedArray(array)) {
        throw new TypeError('Array must be integer type');
      }

      if (array.byteLength > 65535) {
        throw new Error('Quota exceeded');
      }

      for (let i = 0; i < array.length; i += 1) {
        array[i] = 0;
      }

      return array;
    },
  });

  namespace.Crypto = Crypto;
  namespace.SubtleCrypto = SubtleCrypto;
};
