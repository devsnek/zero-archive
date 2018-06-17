'use strict';

({ namespace }) => {
  /*
  const { defineIDLClass } = load('util');

  class WritableStream {
    constructor(underlyingSink = {}, strategy = {}) {}
  }

  defineIDLClass(WritableStream, 'WritableStream', {
    get locked() {},

    abort(reason) {},
    getWriter() {},
  });
  */

  namespace.WritableStream = class WritableStream {};
};
