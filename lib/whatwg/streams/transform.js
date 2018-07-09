'use strict';

// https://github.com/whatwg/streams/blob/master/reference-implementation/lib/transform-stream.js

/* eslint-disable no-use-before-define */
/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */

({ namespace, load }) => {
  const {
    assert,
    InvokeOrNoop, CreateAlgorithmFromUnderlyingMethod, PromiseCall, typeIsObject,
    ValidateAndNormalizeHighWaterMark, IsNonNegativeNumber,
    MakeSizeAlgorithmFromSizeFunction,
  } = load('whatwg/streams/helpers');
  const {
    CreateReadableStream, ReadableStreamDefaultControllerClose, ReadableStreamDefaultControllerEnqueue,
    ReadableStreamDefaultControllerError, ReadableStreamDefaultControllerGetDesiredSize,
    ReadableStreamDefaultControllerHasBackpressure,
    ReadableStreamDefaultControllerCanCloseOrEnqueue,
  } = load('whatwg/streams/readable');
  const { CreateWritableStream, WritableStreamDefaultControllerErrorIfNeeded } = load('whatwg/streams/writable');

  const {
    kTransformStreamController, kReadable, kWritable, kBackpressure, kBackpressureChangePromise,
    kBackpressureChangePromiseResolve, kReadableStreamController, kWritableStreamController,
    kControlledTransformStream, kTransformAlgorithm, kFlushAlgorithm, kStoredError, kState,
  } = load('whatwg/streams/symbols');

  // Class TransformStream

  class TransformStream {
    constructor(transformer = {}, writableStrategy = {}, readableStrategy = {}) {
      const writableSizeFunction = writableStrategy.size;
      let writableHighWaterMark = writableStrategy.highWaterMark;
      const readableSizeFunction = readableStrategy.size;
      let readableHighWaterMark = readableStrategy.highWaterMark;

      const writableType = transformer.writableType;

      if (writableType !== undefined) {
        throw new RangeError('Invalid writable type specified');
      }

      const writableSizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(writableSizeFunction);
      if (writableHighWaterMark === undefined) {
        writableHighWaterMark = 1;
      }
      writableHighWaterMark = ValidateAndNormalizeHighWaterMark(writableHighWaterMark);

      const readableType = transformer.readableType;

      if (readableType !== undefined) {
        throw new RangeError('Invalid readable type specified');
      }

      const readableSizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(readableSizeFunction);
      if (readableHighWaterMark === undefined) {
        readableHighWaterMark = 0;
      }
      readableHighWaterMark = ValidateAndNormalizeHighWaterMark(readableHighWaterMark);

      let startPromiseResolve;
      const startPromise = new Promise((resolve) => {
        startPromiseResolve = resolve;
      });

      InitializeTransformStream(this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark,
        readableSizeAlgorithm);
      SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);

      const startResult = InvokeOrNoop(transformer, 'start', [this[kTransformStreamController]]);
      startPromiseResolve(startResult);
    }

    get readable() {
      if (IsTransformStream(this) === false) {
        throw streamBrandCheckException('readable');
      }

      return this[kReadable];
    }

    get writable() {
      if (IsTransformStream(this) === false) {
        throw streamBrandCheckException('writable');
      }

      return this[kWritable];
    }
  }

  // Transform Stream Abstract Operations

  function CreateTransformStream(startAlgorithm, transformAlgorithm, flushAlgorithm, writableHighWaterMark = 1,
    writableSizeAlgorithm = () => 1, readableHighWaterMark = 0,
    readableSizeAlgorithm = () => 1) {
    assert(IsNonNegativeNumber(writableHighWaterMark));
    assert(IsNonNegativeNumber(readableHighWaterMark));

    const stream = Object.create(TransformStream.prototype);

    let startPromiseResolve;
    const startPromise = new Promise((resolve) => {
      startPromiseResolve = resolve;
    });

    InitializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark,
      readableSizeAlgorithm);

    const controller = Object.create(TransformStreamDefaultController.prototype);

    SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm);

    const startResult = startAlgorithm();
    startPromiseResolve(startResult);
    return stream;
  }

  function InitializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm,
    readableHighWaterMark, readableSizeAlgorithm) {
    function startAlgorithm() {
      return startPromise;
    }

    function writeAlgorithm(chunk) {
      return TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
    }

    function abortAlgorithm(reason) {
      return TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
    }

    function closeAlgorithm() {
      return TransformStreamDefaultSinkCloseAlgorithm(stream);
    }

    stream[kWritable] = CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm,
      writableHighWaterMark, writableSizeAlgorithm);

    function pullAlgorithm() {
      return TransformStreamDefaultSourcePullAlgorithm(stream);
    }

    function cancelAlgorithm(reason) {
      TransformStreamErrorWritableAndUnblockWrite(stream, reason);
      return Promise.resolve();
    }

    stream[kReadable] = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, readableHighWaterMark,
      readableSizeAlgorithm);

    // The [[backpressure]] slot is set to undefined so that it can be initialised by TransformStreamSetBackpressure.
    stream[kBackpressure] = undefined;
    stream[kBackpressureChangePromise] = undefined;
    stream[kBackpressureChangePromiseResolve] = undefined;
    TransformStreamSetBackpressure(stream, true);

    // Used by IsWritableStream() which is called by SetUpTransformStreamDefaultController().
    stream[kTransformStreamController] = undefined;
  }

  function IsTransformStream(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kTransformStreamController)) {
      return false;
    }

    return true;
  }

  // This is a no-op if both sides are already errored.
  function TransformStreamError(stream, e) {
    ReadableStreamDefaultControllerError(stream[kReadable][kReadableStreamController], e);
    TransformStreamErrorWritableAndUnblockWrite(stream, e);
  }

  function TransformStreamErrorWritableAndUnblockWrite(stream, e) {
    TransformStreamDefaultControllerClearAlgorithms(stream[kTransformStreamController]);
    WritableStreamDefaultControllerErrorIfNeeded(stream[kWritable][kWritableStreamController], e);
    if (stream[kBackpressure] === true) {
      // Pretend that pull() was called to permit any pending write() calls to complete. TransformStreamSetBackpressure()
      // cannot be called from enqueue() or pull() once the ReadableStream is errored, so this will will be the final time
      // _backpressure is set.
      TransformStreamSetBackpressure(stream, false);
    }
  }

  function TransformStreamSetBackpressure(stream, backpressure) {
    // Passes also when called during construction.
    assert(stream[kBackpressure] !== backpressure);

    if (stream[kBackpressureChangePromise] !== undefined) {
      stream[kBackpressureChangePromiseResolve]();
    }

    stream[kBackpressureChangePromise] = new Promise((resolve) => {
      stream[kBackpressureChangePromiseResolve] = resolve;
    });

    stream[kBackpressure] = backpressure;
  }

  // Class TransformStreamDefaultController

  class TransformStreamDefaultController {
    constructor() {
      throw new TypeError('TransformStreamDefaultController instances cannot be created directly');
    }

    get desiredSize() {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('desiredSize');
      }

      const readableController = this[kControlledTransformStream][kReadable][kReadableStreamController];
      return ReadableStreamDefaultControllerGetDesiredSize(readableController);
    }

    enqueue(chunk) {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('enqueue');
      }

      TransformStreamDefaultControllerEnqueue(this, chunk);
    }

    error(reason) {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('error');
      }

      TransformStreamDefaultControllerError(this, reason);
    }

    terminate() {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('terminate');
      }

      TransformStreamDefaultControllerTerminate(this);
    }
  }

  // Transform Stream Default Controller Abstract Operations

  function IsTransformStreamDefaultController(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kControlledTransformStream)) {
      return false;
    }

    return true;
  }

  function SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm) {
    assert(IsTransformStream(stream) === true);
    assert(stream[kTransformStreamController] === undefined);

    controller[kControlledTransformStream] = stream;
    stream[kTransformStreamController] = controller;

    controller[kTransformAlgorithm] = transformAlgorithm;
    controller[kFlushAlgorithm] = flushAlgorithm;
  }

  function SetUpTransformStreamDefaultControllerFromTransformer(stream, transformer) {
    assert(transformer !== undefined);

    const controller = Object.create(TransformStreamDefaultController.prototype);

    let transformAlgorithm = (chunk) => {
      try {
        TransformStreamDefaultControllerEnqueue(controller, chunk);
        return Promise.resolve();
      } catch (transformResultE) {
        return Promise.reject(transformResultE);
      }
    };
    const transformMethod = transformer.transform;
    if (transformMethod !== undefined) {
      if (typeof transformMethod !== 'function') {
        throw new TypeError('transform is not a method');
      }
      transformAlgorithm = (chunk) => {
        const transformPromise = PromiseCall(transformMethod, transformer, [chunk, controller]);
        return transformPromise.catch((e) => {
          TransformStreamError(stream, e);
          throw e;
        });
      };
    }

    const flushAlgorithm = CreateAlgorithmFromUnderlyingMethod(transformer, 'flush', 0, [controller]);

    SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm);
  }

  function TransformStreamDefaultControllerClearAlgorithms(controller) {
    controller[kTransformAlgorithm] = undefined;
    controller[kFlushAlgorithm] = undefined;
  }

  function TransformStreamDefaultControllerEnqueue(controller, chunk) {
    const stream = controller[kControlledTransformStream];
    const readableController = stream[kReadable][kReadableStreamController];
    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController) === false) {
      throw new TypeError('Readable side is not in a state that permits enqueue');
    }

    // We throttle transform invocations based on the backpressure of the ReadableStream, but we still
    // accept TransformStreamDefaultControllerEnqueue() calls.

    try {
      ReadableStreamDefaultControllerEnqueue(readableController, chunk);
    } catch (e) {
      // This happens when readableStrategy.size() throws.
      TransformStreamErrorWritableAndUnblockWrite(stream, e);

      throw stream[kReadable][kStoredError];
    }

    const backpressure = ReadableStreamDefaultControllerHasBackpressure(readableController);
    if (backpressure !== stream[kBackpressure]) {
      assert(backpressure === true);
      TransformStreamSetBackpressure(stream, true);
    }
  }

  function TransformStreamDefaultControllerError(controller, e) {
    TransformStreamError(controller[kControlledTransformStream], e);
  }

  function TransformStreamDefaultControllerTerminate(controller) {
    const stream = controller[kControlledTransformStream];
    const readableController = stream[kReadable][kReadableStreamController];

    if (ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController) === true) {
      ReadableStreamDefaultControllerClose(readableController);
    }

    const error = new TypeError('TransformStream terminated');
    TransformStreamErrorWritableAndUnblockWrite(stream, error);
  }

  // TransformStreamDefaultSink Algorithms

  function TransformStreamDefaultSinkWriteAlgorithm(stream, chunk) {
    assert(stream[kWritable][kState] === 'writable');

    const controller = stream[kTransformStreamController];

    if (stream[kBackpressure] === true) {
      const backpressureChangePromise = stream[kBackpressureChangePromise];
      assert(backpressureChangePromise !== undefined);
      return backpressureChangePromise
        .then(() => {
          const writable = stream[kWritable];
          const state = writable[kState];
          if (state === 'erroring') {
            throw writable[kStoredError];
          }
          assert(state === 'writable');
          return controller[kTransformAlgorithm](chunk);
        });
    }

    return controller[kTransformAlgorithm](chunk);
  }

  function TransformStreamDefaultSinkAbortAlgorithm(stream, reason) {
    // abort() is not called synchronously, so it is possible for abort() to be called when the stream is already
    // errored.
    TransformStreamError(stream, reason);
    return Promise.resolve();
  }

  function TransformStreamDefaultSinkCloseAlgorithm(stream) {
    // stream[kReadable] cannot change after construction, so caching it across a call to user code is safe.
    const readable = stream[kReadable];

    const controller = stream[kTransformStreamController];
    const flushPromise = controller[kFlushAlgorithm]();
    TransformStreamDefaultControllerClearAlgorithms(controller);

    // Return a promise that is fulfilled with undefined on success.
    return flushPromise.then(() => {
      if (readable[kState] === 'errored') {
        throw readable[kStoredError];
      }
      const readableController = readable[kReadableStreamController];
      if (ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController) === true) {
        ReadableStreamDefaultControllerClose(readableController);
      }
    }).catch((r) => {
      TransformStreamError(stream, r);
      throw readable[kStoredError];
    });
  }

  // TransformStreamDefaultSource Algorithms

  function TransformStreamDefaultSourcePullAlgorithm(stream) {
    // Invariant. Enforced by the promises returned by start() and pull().
    assert(stream[kBackpressure] === true);

    assert(stream[kBackpressureChangePromise] !== undefined);

    TransformStreamSetBackpressure(stream, false);

    // Prevent the next pull() call until there is backpressure.
    return stream[kBackpressureChangePromise];
  }

  namespace.CreateTransformStream = CreateTransformStream;
  namespace.TransformStream = TransformStream;

  // Helper functions for the TransformStreamDefaultController.

  function defaultControllerBrandCheckException(name) {
    return new TypeError(
      `TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`,
    );
  }

  // Helper functions for the TransformStream.

  function streamBrandCheckException(name) {
    return new TypeError(
      `TransformStream.prototype.${name} can only be used on a TransformStream`,
    );
  }
};
