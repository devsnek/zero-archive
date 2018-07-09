'use strict';

({ namespace, load }) => {
  const { defineIDLClass } = load('util');

  class ByteLengthQueuingStrategy {
    constructor({ highWaterMark }) {
      this.highWaterMark = highWaterMark;
    }
  }

  defineIDLClass(ByteLengthQueuingStrategy, undefined, {
    highWaterMark: undefined,

    size(chunk) {
      return chunk.byteLength;
    },
  });

  class CountQueuingStrategy {
    constructor({ highWaterMark }) {
      this.highWaterMark = highWaterMark;
    }
  }

  defineIDLClass(CountQueuingStrategy, undefined, {
    highWaterMark: undefined,
    size() {
      return 1;
    },
  });

  namespace.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
  namespace.CountQueuingStrategy = CountQueuingStrategy;
};
