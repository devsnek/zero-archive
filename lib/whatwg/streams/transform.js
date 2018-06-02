'use strict';

({ namespace, load }) => {
  const { defineIDLClass } = load('util');

  class TransformStream {
    constructor(transformer = {}, writableStrategy = {}, readableStrategy = {}) {}
  }

  defineIDLClass(TransformStream, 'TramsformStream', {
    get readable() {},
    get writable() {},
  });

  namespace.TransformStream = TransformStream;
};
