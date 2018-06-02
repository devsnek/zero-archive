'use strict';

({ namespace, load, PrivateSymbol: PS }) => {
  const { defineIDLClass, CreatePromise, MarkPromiseAsHandled } = load('util');

  const kState = PS();
  const kReader = PS();
  const kStoredError = PS();
  const kDisturbed = PS();
  const kReadableStreamController = PS();
  const kOwnerReadableStream = PS();
  const kClosedPromise = PS();
  const kReadRequests = PS();

  const InitializeReadableStream = (stream) => {
    stream[kState] = 'readable';
    stream[kReader] = undefined;
    stream[kStoredError] = undefined;
    stream[kDisturbed] = false;
  };

  const IsReadableStream = (x) => {
    if (typeof x !== 'object') {
      return false;
    }
    if (!(kReadableStreamController in x)) {
      return false;
    }
    return true;
  };

  const ReadableStreamReaderGenericInitialize = (reader, stream) => {
    reader[kOwnerReadableStream] = stream;
    stream[kReader] = reader;
    if (stream[kState] === 'readable') {
      reader[kClosedPromise] = CreatePromise();
    } else if (stream[kState] === 'closed') {
      reader[kClosedPromise] = Promise.resolve(undefined);
    } else {
      Assert(stream[kState] === 'errored');
      reader[kClosedPromise] = Promise.reject(stream[kStoredError]);
      MarkPromiseAsHandled(reader[kClosedPromise]);
    }
  };

  class ReadableStreamDefaultReader {
    constructor(stream) {
      if (!IsReadableStream(stream)) {
        throw new TypeError();
      }

      if (!IsReadableStreamLocked(stream)) {
        throw new TypeError();
      }

      ReadableStreamReaderGenericInitialize(this, stream);

      this[kReadRequests] = [];
    }

    get closed() {}

    cancel(reason) {}
    read() {}
    releaseLock() {}
  }

  class ReadableStream {
    constructor(underlyingSource = {}, strategy = {}) {}
  }

  defineIDLClass(ReadableStream, 'ReadableStream', {
    get locked() {},

    cancel(reason) {},
    getReader() {},
    pipeThrough({ writable, readable }, options) {},
    pipeTo(dest, { preventClose, preventAbort, preventCancel } = {}) {},
    tee() {},
  });

  namespace.ReadableStream = ReadableStream;
};
