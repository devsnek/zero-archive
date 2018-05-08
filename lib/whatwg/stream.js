'use strict';

({ namespace, PrivateSymbol: PS }) => {
  const kState = PS();
  const kReader = PS();
  const kDisturbed = PS();
  const kReadableStreamController = PS();

  const assert = () => {};

  // abstract operations

  function typeIsObject(V) {
    if (V === null) {
      return false;
    }

    return typeof V === 'object';
  }

  function InitializeReadableStream(stream) {
    stream[kState] = 'readable';
    stream[kReader] = undefined;
    stream[kDisturbed] = false;
  }

  function IsReadableStream(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kReadableStreamController)) {
      return false;
    }

    return true;
  }

  const IsReadableStreamDisturbed = (stream) => {
    assert(IsReadableStream(stream) === true);

    return stream[kDisturbed];
  }

  const ValidateAndNormalizeHighWaterMark = (highWaterMark) => {
    highWaterMark = Number(highWaterMark);
    if (Number.isNaN(highWaterMark) || highWaterMark < 0) {
      throw new RangeError('highWaterMark property of a queuing strategy must be non-negative and non-NaN');
    }

    return highWaterMark;
  };

  const ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue = (promise) => {
    try {
      // This relies on the brand-check that is enforced by Promise.prototype.then(). As with the
      // rest of the reference implementation, it doesn't attempt to do the right thing if someone
      // has modified the global environment.
      Promise.prototype.then.call(promise, undefined, () => {});
    } catch (e) {
      // The brand check failed, therefore the internal slot
      // is not present and there's nothing further to do.
    }
  };

  // ///////////////////

  class ReadableStream {
    constructor(underlyingSource = {}, strategy = {}) {
      InitializeReadableStream(this);

      let { size, highWaterMark } = strategy;

      const { type } = underlyingSource;
      const typeString = String(type);
      if (typeString === 'bytes') {
        if (size !== undefined) {
          throw new RangeError('The strategy for a byte stream cannot have a size function');
        }

        if (highWaterMark === undefined) {
          highWaterMark = 0;
        }
        highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);

        SetUpReadableByteStreamControllerFromUnderlyingSource(this, underlyingSource, highWaterMark);
      } else if (type === undefined) {
        const sizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(size);

        if (highWaterMark === undefined) {
          highWaterMark = 1;
        }
        highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);

        SetUpReadableStreamDefaultControllerFromUnderlyingSource(this, underlyingSource, highWaterMark, sizeAlgorithm);
      } else {
        throw new RangeError('Invalid type is specified');
      }
    }

    get locked() {
      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('locked');
      }

      return IsReadableStreamLocked(this);
    }

    cancel(reason) {
      if (IsReadableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('cancel'));
      }

      if (IsReadableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
      }

      return ReadableStreamCancel(this, reason);
    }

    getReader({ mode } = {}) {
      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('getReader');
      }

      if (mode === undefined) {
        return AcquireReadableStreamDefaultReader(this);
      }

      mode = String(mode);

      if (mode === 'byob') {
        return AcquireReadableStreamBYOBReader(this);
      }

      throw new RangeError('Invalid mode is specified');
    }

    pipeThrough({ writable, readable }, options) {
      if (writable === undefined || readable === undefined) {
        throw new TypeError('readable and writable arguments must be defined');
      }

      const promise = this.pipeTo(writable, options);

      ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue(promise);

      return readable;
    }

    pipeTo(dest, { preventClose, preventAbort, preventCancel } = {}) {
      if (IsReadableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('pipeTo'));
      }
      if (IsWritableStream(dest) === false) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo\'s first argument must be a WritableStream'));
      }

      preventClose = Boolean(preventClose);
      preventAbort = Boolean(preventAbort);
      preventCancel = Boolean(preventCancel);

      if (IsReadableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream'));
      }
      if (IsWritableStreamLocked(dest) === true) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream'));
      }

      const reader = AcquireReadableStreamDefaultReader(this);
      const writer = AcquireWritableStreamDefaultWriter(dest);

      let shuttingDown = false;

      // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
      let currentWrite = Promise.resolve();

      return new Promise((resolve, reject) => {
        // Using reader and writer, read all chunks from this and write them to dest
        // - Backpressure must be enforced
        // - Shutdown must stop all activity
        function pipeLoop() {
          if (shuttingDown === true) {
            return Promise.resolve();
          }

          return writer._readyPromise.then(() => {
            return ReadableStreamDefaultReaderRead(reader).then(({ value, done }) => {
              if (done === true) {
                return;
              }

              currentWrite = WritableStreamDefaultWriterWrite(writer, value).catch(() => {});
            });
          })
          .then(pipeLoop);
        }

        // Errors must be propagated forward
        isOrBecomesErrored(this, reader._closedPromise, storedError => {
          if (preventAbort === false) {
            shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
          } else {
            shutdown(true, storedError);
          }
        });

        // Errors must be propagated backward
        isOrBecomesErrored(dest, writer._closedPromise, storedError => {
          if (preventCancel === false) {
            shutdownWithAction(() => ReadableStreamCancel(this, storedError), true, storedError);
          } else {
            shutdown(true, storedError);
          }
        });

        // Closing must be propagated forward
        isOrBecomesClosed(this, reader._closedPromise, () => {
          if (preventClose === false) {
            shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
          } else {
            shutdown();
          }
        });

        // Closing must be propagated backward
        if (WritableStreamCloseQueuedOrInFlight(dest) === true || dest._state === 'closed') {
          const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

          if (preventCancel === false) {
            shutdownWithAction(() => ReadableStreamCancel(this, destClosed), true, destClosed);
          } else {
            shutdown(true, destClosed);
          }
        }

        pipeLoop().catch(err => {
          currentWrite = Promise.resolve();
          rethrowAssertionErrorRejection(err);
        });

        function waitForWritesToFinish() {
          // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
          // for that too.
          const oldCurrentWrite = currentWrite;
          return currentWrite.then(() => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined);
        }

        function isOrBecomesErrored(stream, promise, action) {
          if (stream._state === 'errored') {
            action(stream._storedError);
          } else {
            promise.catch(action).catch(rethrowAssertionErrorRejection);
          }
        }

        function isOrBecomesClosed(stream, promise, action) {
          if (stream._state === 'closed') {
            action();
          } else {
            promise.then(action).catch(rethrowAssertionErrorRejection);
          }
        }

        function shutdownWithAction(action, originalIsError, originalError) {
          if (shuttingDown === true) {
            return;
          }
          shuttingDown = true;

          if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
            waitForWritesToFinish().then(doTheRest);
          } else {
            doTheRest();
          }

          function doTheRest() {
            action().then(
              () => finalize(originalIsError, originalError),
              newError => finalize(true, newError)
            )
            .catch(rethrowAssertionErrorRejection);
          }
        }

        function shutdown(isError, error) {
          if (shuttingDown === true) {
            return;
          }
          shuttingDown = true;

          if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
            waitForWritesToFinish().then(() => finalize(isError, error)).catch(rethrowAssertionErrorRejection);
          } else {
            finalize(isError, error);
          }
        }

        function finalize(isError, error) {
          WritableStreamDefaultWriterRelease(writer);
          ReadableStreamReaderGenericRelease(reader);

          if (isError) {
            reject(error);
          } else {
            resolve(undefined);
          }
        }
      });
    }

    tee() {
      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('tee');
      }

      const branches = ReadableStreamTee(this, false);
      return createArrayFromList(branches);
    }
  }


  namespace.ReadableStream = ReadableStream;
};
