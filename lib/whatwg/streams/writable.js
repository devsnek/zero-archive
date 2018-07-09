'use strict';

// https://github.com/whatwg/streams/blob/master/reference-implementation/lib/writable-stream.js

/* eslint-disable no-use-before-define */
/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */

({ namespace, load }) => {
  const {
    assert,
    CreateAlgorithmFromUnderlyingMethod, InvokeOrNoop,
    ValidateAndNormalizeHighWaterMark, IsNonNegativeNumber,
    MakeSizeAlgorithmFromSizeFunction, typeIsObject,
    rethrowAssertionErrorRejection,
    DequeueValue, EnqueueValueWithSize, PeekQueueValue, ResetQueue,
    kQueue, kQueueTotalSize,
  } = load('whatwg/streams/helpers');

  const {
    kState, kStoredError, kWriter, kWritableStreamController, kWriteRequests,
    kInFlightWriteRequest, kCloseRequest, kInFlightCloseRequest, kPendingAbortRequest,
    kBackpressure, kPromise, kStarted, kReject, kWasAlreadyErroring, kReason, kResolve,
    kClosedPromise, kOwnerWritableStream, kReadyPromise, kClosedPromiseState, kReadyPromiseState,
    kControlledWritableStream, kAbortAlgorithm, kStrategySizeAlgorithm,
    kStrategyHWM, kWriteAlgorithm, kCloseAlgorithm, kClosedPromiseResolve,
    kClosedPromiseReject, kReadyPromiseResolve, kReadyPromiseReject,
  } = load('whatwg/streams/symbols');

  const AbortSteps = Symbol('[[AbortSteps]]');
  const ErrorSteps = Symbol('[[ErrorSteps]]');

  class WritableStream {
    constructor(underlyingSink = {}, strategy = {}) {
      InitializeWritableStream(this);

      const size = strategy.size;
      let highWaterMark = strategy.highWaterMark;

      const type = underlyingSink.type;

      if (type !== undefined) {
        throw new RangeError('Invalid type is specified');
      }

      const sizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(size);
      if (highWaterMark === undefined) {
        highWaterMark = 1;
      }
      highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);

      SetUpWritableStreamDefaultControllerFromUnderlyingSink(this, underlyingSink, highWaterMark, sizeAlgorithm);
    }

    get locked() {
      if (IsWritableStream(this) === false) {
        throw streamBrandCheckException('locked');
      }

      return IsWritableStreamLocked(this);
    }

    abort(reason) {
      if (IsWritableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('abort'));
      }

      if (IsWritableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot abort a stream that already has a writer'));
      }

      return WritableStreamAbort(this, reason);
    }

    getWriter() {
      if (IsWritableStream(this) === false) {
        throw streamBrandCheckException('getWriter');
      }

      return AcquireWritableStreamDefaultWriter(this);
    }
  }

  namespace.AcquireWritableStreamDefaultWriter = AcquireWritableStreamDefaultWriter;
  namespace.CreateWritableStream = CreateWritableStream;
  namespace.IsWritableStream = IsWritableStream;
  namespace.IsWritableStreamLocked = IsWritableStreamLocked;
  namespace.WritableStream = WritableStream;
  namespace.WritableStreamAbort = WritableStreamAbort;
  namespace.WritableStreamDefaultControllerErrorIfNeeded =
    WritableStreamDefaultControllerErrorIfNeeded;
  namespace.WritableStreamDefaultWriterCloseWithErrorPropagation =
    WritableStreamDefaultWriterCloseWithErrorPropagation;
  namespace.WritableStreamDefaultWriterRelease = WritableStreamDefaultWriterRelease;
  namespace.WritableStreamDefaultWriterWrite = WritableStreamDefaultWriterWrite;
  namespace.WritableStreamCloseQueuedOrInFlight = WritableStreamCloseQueuedOrInFlight;

  // Abstract operations for the WritableStream.

  function AcquireWritableStreamDefaultWriter(stream) {
    return new WritableStreamDefaultWriter(stream);
  }

  // Throws if and only if startAlgorithm throws.
  function CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark = 1,
    sizeAlgorithm = () => 1) {
    assert(IsNonNegativeNumber(highWaterMark) === true);

    const stream = Object.create(WritableStream.prototype);
    InitializeWritableStream(stream);

    const controller = Object.create(WritableStreamDefaultController.prototype);

    SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm,
      abortAlgorithm, highWaterMark, sizeAlgorithm);
    return stream;
  }

  function InitializeWritableStream(stream) {
    stream[kState] = 'writable';

    // The error that will be reported by new method calls once the state becomes errored. Only set when [[state]] is
    // 'erroring' or 'errored'. May be set to an undefined value.
    stream[kStoredError] = undefined;

    stream[kWriter] = undefined;

    // Initialize to undefined first because the constructor of the controller checks this
    // variable to validate the caller.
    stream[kWritableStreamController] = undefined;

    // This queue is placed here instead of the writer class in order to allow for passing a writer to the next data
    // producer without waiting for the queued writes to finish.
    stream[kWriteRequests] = [];

    // Write requests are removed from _writeRequests when write() is called on the underlying sink. This prevents
    // them from being erroneously rejected on error. If a write() call is in-flight, the request is stored here.
    stream[kInFlightWriteRequest] = undefined;

    // The promise that was returned from writer.close(). Stored here because it may be fulfilled after the writer
    // has been detached.
    stream[kCloseRequest] = undefined;

    // Close request is removed from _closeRequest when close() is called on the underlying sink. This prevents it
    // from being erroneously rejected on error. If a close() call is in-flight, the request is stored here.
    stream[kInFlightCloseRequest] = undefined;

    // The promise that was returned from writer.abort(). This may also be fulfilled after the writer has detached.
    stream[kPendingAbortRequest] = undefined;

    // The backpressure signal set by the controller.
    stream[kBackpressure] = false;
  }

  function IsWritableStream(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kWritableStreamController)) {
      return false;
    }

    return true;
  }

  function IsWritableStreamLocked(stream) {
    assert(IsWritableStream(stream) === true);

    if (stream[kWriter] === undefined) {
      return false;
    }

    return true;
  }

  function WritableStreamAbort(stream, reason) {
    const state = stream[kState];
    if (state === 'closed' || state === 'errored') {
      return Promise.resolve(undefined);
    }
    if (stream[kPendingAbortRequest] !== undefined) {
      return stream[kPendingAbortRequest][kPromise];
    }

    assert(state === 'writable' || state === 'erroring');

    let wasAlreadyErroring = false;
    if (state === 'erroring') {
      wasAlreadyErroring = true;
      // reason will not be used, so don't keep a reference to it.
      reason = undefined;
    }

    const promise = new Promise((resolve, reject) => {
      stream[kPendingAbortRequest] = {
        _resolve: resolve,
        _reject: reject,
        _reason: reason,
        _wasAlreadyErroring: wasAlreadyErroring,
      };
    });
    stream[kPendingAbortRequest][kPromise] = promise;

    if (wasAlreadyErroring === false) {
      WritableStreamStartErroring(stream, reason);
    }

    return promise;
  }

  // WritableStream API exposed for controllers.

  function WritableStreamAddWriteRequest(stream) {
    assert(IsWritableStreamLocked(stream) === true);
    assert(stream[kState] === 'writable');

    const promise = new Promise((resolve, reject) => {
      const writeRequest = {
        _resolve: resolve,
        _reject: reject,
      };

      stream[kWriteRequests].push(writeRequest);
    });

    return promise;
  }

  function WritableStreamDealWithRejection(stream, error) {
    const state = stream[kState];

    if (state === 'writable') {
      WritableStreamStartErroring(stream, error);
      return;
    }

    assert(state === 'erroring');
    WritableStreamFinishErroring(stream);
  }

  function WritableStreamStartErroring(stream, reason) {
    assert(stream[kStoredError] === undefined);
    assert(stream[kState] === 'writable');

    const controller = stream[kWritableStreamController];
    assert(controller !== undefined);

    stream[kState] = 'erroring';
    stream[kStoredError] = reason;
    const writer = stream[kWriter];
    if (writer !== undefined) {
      WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, reason);
    }

    if (WritableStreamHasOperationMarkedInFlight(stream) === false && controller[kStarted] === true) {
      WritableStreamFinishErroring(stream);
    }
  }

  function WritableStreamFinishErroring(stream) {
    assert(stream[kState] === 'erroring');
    assert(WritableStreamHasOperationMarkedInFlight(stream) === false);
    stream[kState] = 'errored';
    stream[kWritableStreamController][ErrorSteps]();

    const storedError = stream[kStoredError];
    for (const writeRequest of stream[kWriteRequests]) {
      writeRequest[kReject](storedError);
    }
    stream[kWriteRequests] = [];

    if (stream[kPendingAbortRequest] === undefined) {
      WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
      return;
    }

    const abortRequest = stream[kPendingAbortRequest];
    stream[kPendingAbortRequest] = undefined;

    if (abortRequest[kWasAlreadyErroring] === true) {
      abortRequest[kReject](storedError);
      WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
      return;
    }

    const promise = stream[kWritableStreamController][AbortSteps](abortRequest[kReason]);
    promise.then(
      () => {
        abortRequest[kResolve]();
        WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
      },
      (reason) => {
        abortRequest[kReject](reason);
        WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
      },
    );
  }

  function WritableStreamFinishInFlightWrite(stream) {
    assert(stream[kInFlightWriteRequest] !== undefined);
    stream[kInFlightWriteRequest][kResolve](undefined);
    stream[kInFlightWriteRequest] = undefined;
  }

  function WritableStreamFinishInFlightWriteWithError(stream, error) {
    assert(stream[kInFlightWriteRequest] !== undefined);
    stream[kInFlightWriteRequest][kReject](error);
    stream[kInFlightWriteRequest] = undefined;

    assert(stream[kState] === 'writable' || stream[kState] === 'erroring');

    WritableStreamDealWithRejection(stream, error);
  }

  function WritableStreamFinishInFlightClose(stream) {
    assert(stream[kInFlightCloseRequest] !== undefined);
    stream[kInFlightCloseRequest][kResolve](undefined);
    stream[kInFlightCloseRequest] = undefined;

    const state = stream[kState];

    assert(state === 'writable' || state === 'erroring');

    if (state === 'erroring') {
    // The error was too late to do anything, so it is ignored.
      stream[kStoredError] = undefined;
      if (stream[kPendingAbortRequest] !== undefined) {
        stream[kPendingAbortRequest][kResolve]();
        stream[kPendingAbortRequest] = undefined;
      }
    }

    stream[kState] = 'closed';

    const writer = stream[kWriter];
    if (writer !== undefined) {
      defaultWriterClosedPromiseResolve(writer);
    }

    assert(stream[kPendingAbortRequest] === undefined);
    assert(stream[kStoredError] === undefined);
  }

  function WritableStreamFinishInFlightCloseWithError(stream, error) {
    assert(stream[kInFlightCloseRequest] !== undefined);
    stream[kInFlightCloseRequest][kReject](error);
    stream[kInFlightCloseRequest] = undefined;

    assert(stream[kState] === 'writable' || stream[kState] === 'erroring');

    // Never execute sink abort() after sink close().
    if (stream[kPendingAbortRequest] !== undefined) {
      stream[kPendingAbortRequest][kReject](error);
      stream[kPendingAbortRequest] = undefined;
    }
    WritableStreamDealWithRejection(stream, error);
  }

  // TODO(ricea): Fix alphabetical order.
  function WritableStreamCloseQueuedOrInFlight(stream) {
    if (stream[kCloseRequest] === undefined && stream[kInFlightCloseRequest] === undefined) {
      return false;
    }

    return true;
  }

  function WritableStreamHasOperationMarkedInFlight(stream) {
    if (stream[kInFlightWriteRequest] === undefined && stream[kInFlightCloseRequest] === undefined) {
      return false;
    }

    return true;
  }

  function WritableStreamMarkCloseRequestInFlight(stream) {
    assert(stream[kInFlightCloseRequest] === undefined);
    assert(stream[kCloseRequest] !== undefined);
    stream[kInFlightCloseRequest] = stream[kCloseRequest];
    stream[kCloseRequest] = undefined;
  }

  function WritableStreamMarkFirstWriteRequestInFlight(stream) {
    assert(stream[kInFlightWriteRequest] === undefined);
    assert(stream[kWriteRequests].length !== 0);
    stream[kInFlightWriteRequest] = stream[kWriteRequests].shift();
  }

  function WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream) {
    assert(stream[kState] === 'errored');
    if (stream[kCloseRequest] !== undefined) {
      assert(stream[kInFlightCloseRequest] === undefined);

      stream[kCloseRequest][kReject](stream[kStoredError]);
      stream[kCloseRequest] = undefined;
    }
    const writer = stream[kWriter];
    if (writer !== undefined) {
      defaultWriterClosedPromiseReject(writer, stream[kStoredError]);
      writer[kClosedPromise].catch(() => {});
    }
  }

  function WritableStreamUpdateBackpressure(stream, backpressure) {
    assert(stream[kState] === 'writable');
    assert(WritableStreamCloseQueuedOrInFlight(stream) === false);

    const writer = stream[kWriter];
    if (writer !== undefined && backpressure !== stream[kBackpressure]) {
      if (backpressure === true) {
        defaultWriterReadyPromiseReset(writer);
      } else {
        assert(backpressure === false);

        defaultWriterReadyPromiseResolve(writer);
      }
    }

    stream[kBackpressure] = backpressure;
  }

  class WritableStreamDefaultWriter {
    constructor(stream) {
      if (IsWritableStream(stream) === false) {
        throw new TypeError('WritableStreamDefaultWriter can only be constructed with a WritableStream instance');
      }
      if (IsWritableStreamLocked(stream) === true) {
        throw new TypeError('This stream has already been locked for exclusive writing by another writer');
      }

      this[kOwnerWritableStream] = stream;
      stream[kWriter] = this;

      const state = stream[kState];

      if (state === 'writable') {
        if (WritableStreamCloseQueuedOrInFlight(stream) === false && stream[kBackpressure] === true) {
          defaultWriterReadyPromiseInitialize(this);
        } else {
          defaultWriterReadyPromiseInitializeAsResolved(this);
        }

        defaultWriterClosedPromiseInitialize(this);
      } else if (state === 'erroring') {
        defaultWriterReadyPromiseInitializeAsRejected(this, stream[kStoredError]);
        this[kReadyPromise].catch(() => {});
        defaultWriterClosedPromiseInitialize(this);
      } else if (state === 'closed') {
        defaultWriterReadyPromiseInitializeAsResolved(this);
        defaultWriterClosedPromiseInitializeAsResolved(this);
      } else {
        assert(state === 'errored');

        const storedError = stream[kStoredError];
        defaultWriterReadyPromiseInitializeAsRejected(this, storedError);
        this[kReadyPromise].catch(() => {});
        defaultWriterClosedPromiseInitializeAsRejected(this, storedError);
        this[kClosedPromise].catch(() => {});
      }
    }

    get closed() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('closed'));
      }

      return this[kClosedPromise];
    }

    get desiredSize() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        throw defaultWriterBrandCheckException('desiredSize');
      }

      if (this[kOwnerWritableStream] === undefined) {
        throw defaultWriterLockException('desiredSize');
      }

      return WritableStreamDefaultWriterGetDesiredSize(this);
    }

    get ready() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('ready'));
      }

      return this[kReadyPromise];
    }

    abort(reason) {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('abort'));
      }

      if (this[kOwnerWritableStream] === undefined) {
        return Promise.reject(defaultWriterLockException('abort'));
      }

      return WritableStreamDefaultWriterAbort(this, reason);
    }

    close() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('close'));
      }

      const stream = this[kOwnerWritableStream];

      if (stream === undefined) {
        return Promise.reject(defaultWriterLockException('close'));
      }

      if (WritableStreamCloseQueuedOrInFlight(stream) === true) {
        return Promise.reject(new TypeError('cannot close an already-closing stream'));
      }

      return WritableStreamDefaultWriterClose(this);
    }

    releaseLock() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        throw defaultWriterBrandCheckException('releaseLock');
      }

      const stream = this[kOwnerWritableStream];

      if (stream === undefined) {
        return;
      }

      assert(stream[kWriter] !== undefined);

      WritableStreamDefaultWriterRelease(this);
    }

    write(chunk) {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('write'));
      }

      if (this[kOwnerWritableStream] === undefined) {
        return Promise.reject(defaultWriterLockException('write to'));
      }

      return WritableStreamDefaultWriterWrite(this, chunk);
    }
  }

  // Abstract operations for the WritableStreamDefaultWriter.

  function IsWritableStreamDefaultWriter(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kOwnerWritableStream)) {
      return false;
    }

    return true;
  }

  // A client of WritableStreamDefaultWriter may use these functions directly to bypass state check.

  function WritableStreamDefaultWriterAbort(writer, reason) {
    const stream = writer[kOwnerWritableStream];

    assert(stream !== undefined);

    return WritableStreamAbort(stream, reason);
  }

  function WritableStreamDefaultWriterClose(writer) {
    const stream = writer[kOwnerWritableStream];

    assert(stream !== undefined);

    const state = stream[kState];
    if (state === 'closed' || state === 'errored') {
      return Promise.reject(new TypeError(
        `The stream (in ${state} state) is not in the writable state and cannot be closed`,
      ));
    }

    assert(state === 'writable' || state === 'erroring');
    assert(WritableStreamCloseQueuedOrInFlight(stream) === false);

    const promise = new Promise((resolve, reject) => {
      const closeRequest = {
        _resolve: resolve,
        _reject: reject,
      };

      stream[kCloseRequest] = closeRequest;
    });

    if (stream[kBackpressure] === true && state === 'writable') {
      defaultWriterReadyPromiseResolve(writer);
    }

    WritableStreamDefaultControllerClose(stream[kWritableStreamController]);

    return promise;
  }


  function WritableStreamDefaultWriterCloseWithErrorPropagation(writer) {
    const stream = writer[kOwnerWritableStream];

    assert(stream !== undefined);

    const state = stream[kState];
    if (WritableStreamCloseQueuedOrInFlight(stream) === true || state === 'closed') {
      return Promise.resolve();
    }

    if (state === 'errored') {
      return Promise.reject(stream[kStoredError]);
    }

    assert(state === 'writable' || state === 'erroring');

    return WritableStreamDefaultWriterClose(writer);
  }

  function WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, error) {
    if (writer[kClosedPromiseState] === 'pending') {
      defaultWriterClosedPromiseReject(writer, error);
    } else {
      defaultWriterClosedPromiseResetToRejected(writer, error);
    }
    writer[kClosedPromise].catch(() => {});
  }

  function WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, error) {
    if (writer[kReadyPromiseState] === 'pending') {
      defaultWriterReadyPromiseReject(writer, error);
    } else {
      defaultWriterReadyPromiseResetToRejected(writer, error);
    }
    writer[kReadyPromise].catch(() => {});
  }

  function WritableStreamDefaultWriterGetDesiredSize(writer) {
    const stream = writer[kOwnerWritableStream];
    const state = stream[kState];

    if (state === 'errored' || state === 'erroring') {
      return null;
    }

    if (state === 'closed') {
      return 0;
    }

    return WritableStreamDefaultControllerGetDesiredSize(stream[kWritableStreamController]);
  }

  function WritableStreamDefaultWriterRelease(writer) {
    const stream = writer[kOwnerWritableStream];
    assert(stream !== undefined);
    assert(stream[kWriter] === writer);

    const releasedError = new TypeError(
      'Writer was released and can no longer be used to monitor the stream\'s closedness',
    );

    WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);

    // The state transitions to "errored" before the sink abort() method runs, but the writer.closed promise is not
    // rejected until afterwards. This means that simply testing state will not work.
    WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);

    stream[kWriter] = undefined;
    writer[kOwnerWritableStream] = undefined;
  }

  function WritableStreamDefaultWriterWrite(writer, chunk) {
    const stream = writer[kOwnerWritableStream];

    assert(stream !== undefined);

    const controller = stream[kWritableStreamController];

    const chunkSize = WritableStreamDefaultControllerGetChunkSize(controller, chunk);

    if (stream !== writer[kOwnerWritableStream]) {
      return Promise.reject(defaultWriterLockException('write to'));
    }

    const state = stream[kState];
    if (state === 'errored') {
      return Promise.reject(stream[kStoredError]);
    }
    if (WritableStreamCloseQueuedOrInFlight(stream) === true || state === 'closed') {
      return Promise.reject(new TypeError('The stream is closing or closed and cannot be written to'));
    }
    if (state === 'erroring') {
      return Promise.reject(stream[kStoredError]);
    }

    assert(state === 'writable');

    const promise = WritableStreamAddWriteRequest(stream);

    WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);

    return promise;
  }

  class WritableStreamDefaultController {
    constructor() {
      throw new TypeError('WritableStreamDefaultController cannot be constructed explicitly');
    }

    error(e) {
      if (IsWritableStreamDefaultController(this) === false) {
        throw new TypeError(
          'WritableStreamDefaultController.prototype.error can only be used on a WritableStreamDefaultController',
        );
      }
      const state = this[kControlledWritableStream][kState];
      if (state !== 'writable') {
      // The stream is closed, errored or will be soon. The sink can't do anything useful if it gets an error here, so
      // just treat it as a no-op.
        return;
      }

      WritableStreamDefaultControllerError(this, e);
    }

    [AbortSteps](reason) {
      return this[kAbortAlgorithm](reason);
    }

    [ErrorSteps]() {
      ResetQueue(this);
    }
  }

  // Abstract operations implementing interface required by the WritableStream.

  function IsWritableStreamDefaultController(x) {
    if (!typeIsObject(x)) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(x, kControlledWritableStream)) {
      return false;
    }

    return true;
  }

  function SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm,
    abortAlgorithm, highWaterMark, sizeAlgorithm) {
    assert(IsWritableStream(stream) === true);
    assert(stream[kWritableStreamController] === undefined);

    controller[kControlledWritableStream] = stream;
    stream[kWritableStreamController] = controller;

    // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
    controller[kQueue] = undefined;
    controller[kQueueTotalSize] = undefined;
    ResetQueue(controller);

    controller[kStarted] = false;

    controller[kStrategySizeAlgorithm] = sizeAlgorithm;
    controller[kStrategyHWM] = highWaterMark;

    controller[kWriteAlgorithm] = writeAlgorithm;
    controller[kCloseAlgorithm] = closeAlgorithm;
    controller[kAbortAlgorithm] = abortAlgorithm;

    const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
    WritableStreamUpdateBackpressure(stream, backpressure);

    const startResult = startAlgorithm();
    const startPromise = Promise.resolve(startResult);
    startPromise.then(
      () => {
        assert(stream[kState] === 'writable' || stream[kState] === 'erroring');
        controller[kStarted] = true;
        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
      },
      (r) => {
        assert(stream[kState] === 'writable' || stream[kState] === 'erroring');
        controller[kStarted] = true;
        WritableStreamDealWithRejection(stream, r);
      },
    )
      .catch(rethrowAssertionErrorRejection);
  }

  function SetUpWritableStreamDefaultControllerFromUnderlyingSink(stream, underlyingSink, highWaterMark, sizeAlgorithm) {
    assert(underlyingSink !== undefined);

    const controller = Object.create(WritableStreamDefaultController.prototype);

    function startAlgorithm() {
      return InvokeOrNoop(underlyingSink, 'start', [controller]);
    }

    const writeAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingSink, 'write', 1, [controller]);
    const closeAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingSink, 'close', 0, []);
    const abortAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingSink, 'abort', 1, []);

    SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm,
      abortAlgorithm, highWaterMark, sizeAlgorithm);
  }

  function WritableStreamDefaultControllerClose(controller) {
    EnqueueValueWithSize(controller, 'close', 0);
    WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
  }

  function WritableStreamDefaultControllerGetChunkSize(controller, chunk) {
    try {
      return controller[kStrategySizeAlgorithm](chunk);
    } catch (chunkSizeE) {
      WritableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
      return 1;
    }
  }

  function WritableStreamDefaultControllerGetDesiredSize(controller) {
    return controller[kStrategyHWM] - controller[kQueueTotalSize];
  }

  function WritableStreamDefaultControllerWrite(controller, chunk, chunkSize) {
    const writeRecord = { chunk };

    try {
      EnqueueValueWithSize(controller, writeRecord, chunkSize);
    } catch (enqueueE) {
      WritableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
      return;
    }

    const stream = controller[kControlledWritableStream];
    if (WritableStreamCloseQueuedOrInFlight(stream) === false && stream[kState] === 'writable') {
      const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
      WritableStreamUpdateBackpressure(stream, backpressure);
    }

    WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
  }

  // Abstract operations for the WritableStreamDefaultController.

  function WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller) {
    const stream = controller[kControlledWritableStream];

    if (controller[kStarted] === false) {
      return;
    }

    if (stream[kInFlightWriteRequest] !== undefined) {
      return;
    }

    const state = stream[kState];
    if (state === 'closed' || state === 'errored') {
      return;
    }
    if (state === 'erroring') {
      WritableStreamFinishErroring(stream);
      return;
    }

    if (controller[kQueue].length === 0) {
      return;
    }

    const writeRecord = PeekQueueValue(controller);
    if (writeRecord === 'close') {
      WritableStreamDefaultControllerProcessClose(controller);
    } else {
      WritableStreamDefaultControllerProcessWrite(controller, writeRecord.chunk);
    }
  }

  function WritableStreamDefaultControllerErrorIfNeeded(controller, error) {
    if (controller[kControlledWritableStream][kState] === 'writable') {
      WritableStreamDefaultControllerError(controller, error);
    }
  }

  function WritableStreamDefaultControllerProcessClose(controller) {
    const stream = controller[kControlledWritableStream];

    WritableStreamMarkCloseRequestInFlight(stream);

    DequeueValue(controller);
    assert(controller[kQueue].length === 0);

    const sinkClosePromise = controller[kCloseAlgorithm]();
    sinkClosePromise.then(
      () => {
        WritableStreamFinishInFlightClose(stream);
      },
      (reason) => {
        WritableStreamFinishInFlightCloseWithError(stream, reason);
      },
    )
      .catch(rethrowAssertionErrorRejection);
  }

  function WritableStreamDefaultControllerProcessWrite(controller, chunk) {
    const stream = controller[kControlledWritableStream];

    WritableStreamMarkFirstWriteRequestInFlight(stream);

    const sinkWritePromise = controller[kWriteAlgorithm](chunk);
    sinkWritePromise.then(
      () => {
        WritableStreamFinishInFlightWrite(stream);

        const state = stream[kState];
        assert(state === 'writable' || state === 'erroring');

        DequeueValue(controller);

        if (WritableStreamCloseQueuedOrInFlight(stream) === false && state === 'writable') {
          const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
          WritableStreamUpdateBackpressure(stream, backpressure);
        }

        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
      },
      (reason) => {
        WritableStreamFinishInFlightWriteWithError(stream, reason);
      },
    )
      .catch(rethrowAssertionErrorRejection);
  }

  function WritableStreamDefaultControllerGetBackpressure(controller) {
    const desiredSize = WritableStreamDefaultControllerGetDesiredSize(controller);
    return desiredSize <= 0;
  }

  // A client of WritableStreamDefaultController may use these functions directly to bypass state check.

  function WritableStreamDefaultControllerError(controller, error) {
    const stream = controller[kControlledWritableStream];

    assert(stream[kState] === 'writable');

    WritableStreamStartErroring(stream, error);
  }

  // Helper functions for the WritableStream.

  function streamBrandCheckException(name) {
    return new TypeError(`WritableStream.prototype.${name} can only be used on a WritableStream`);
  }

  // Helper functions for the WritableStreamDefaultWriter.

  function defaultWriterBrandCheckException(name) {
    return new TypeError(
      `WritableStreamDefaultWriter.prototype.${name} can only be used on a WritableStreamDefaultWriter`,
    );
  }

  function defaultWriterLockException(name) {
    return new TypeError(`Cannot ${name} a stream using a released writer`);
  }

  function defaultWriterClosedPromiseInitialize(writer) {
    writer[kClosedPromise] = new Promise((resolve, reject) => {
      writer[kClosedPromiseResolve] = resolve;
      writer[kClosedPromiseReject] = reject;
      writer[kClosedPromiseState] = 'pending';
    });
  }

  function defaultWriterClosedPromiseInitializeAsRejected(writer, reason) {
    writer[kClosedPromise] = Promise.reject(reason);
    writer[kClosedPromiseResolve] = undefined;
    writer[kClosedPromiseReject] = undefined;
    writer[kClosedPromiseState] = 'rejected';
  }

  function defaultWriterClosedPromiseInitializeAsResolved(writer) {
    writer[kClosedPromise] = Promise.resolve(undefined);
    writer[kClosedPromiseResolve] = undefined;
    writer[kClosedPromiseReject] = undefined;
    writer[kClosedPromiseState] = 'resolved';
  }

  function defaultWriterClosedPromiseReject(writer, reason) {
    assert(writer[kClosedPromiseResolve] !== undefined);
    assert(writer[kClosedPromiseReject] !== undefined);
    assert(writer[kClosedPromiseState] === 'pending');

    writer[kClosedPromiseReject](reason);
    writer[kClosedPromiseResolve] = undefined;
    writer[kClosedPromiseReject] = undefined;
    writer[kClosedPromiseState] = 'rejected';
  }

  function defaultWriterClosedPromiseResetToRejected(writer, reason) {
    assert(writer[kClosedPromiseResolve] === undefined);
    assert(writer[kClosedPromiseReject] === undefined);
    assert(writer[kClosedPromiseState] !== 'pending');

    writer[kClosedPromise] = Promise.reject(reason);
    writer[kClosedPromiseState] = 'rejected';
  }

  function defaultWriterClosedPromiseResolve(writer) {
    assert(writer[kClosedPromiseResolve] !== undefined);
    assert(writer[kClosedPromiseReject] !== undefined);
    assert(writer[kClosedPromiseState] === 'pending');

    writer[kClosedPromiseResolve](undefined);
    writer[kClosedPromiseResolve] = undefined;
    writer[kClosedPromiseReject] = undefined;
    writer[kClosedPromiseState] = 'resolved';
  }

  function defaultWriterReadyPromiseInitialize(writer) {
    writer[kReadyPromise] = new Promise((resolve, reject) => {
      writer[kReadyPromiseResolve] = resolve;
      writer[kReadyPromiseReject] = reject;
    });
    writer[kReadyPromiseState] = 'pending';
  }

  function defaultWriterReadyPromiseInitializeAsRejected(writer, reason) {
    writer[kReadyPromise] = Promise.reject(reason);
    writer[kReadyPromiseResolve] = undefined;
    writer[kReadyPromiseReject] = undefined;
    writer[kReadyPromiseState] = 'rejected';
  }

  function defaultWriterReadyPromiseInitializeAsResolved(writer) {
    writer[kReadyPromise] = Promise.resolve(undefined);
    writer[kReadyPromiseResolve] = undefined;
    writer[kReadyPromiseReject] = undefined;
    writer[kReadyPromiseState] = 'fulfilled';
  }

  function defaultWriterReadyPromiseReject(writer, reason) {
    assert(writer[kReadyPromiseResolve] !== undefined);
    assert(writer[kReadyPromiseReject] !== undefined);

    writer[kReadyPromiseReject](reason);
    writer[kReadyPromiseResolve] = undefined;
    writer[kReadyPromiseReject] = undefined;
    writer[kReadyPromiseState] = 'rejected';
  }

  function defaultWriterReadyPromiseReset(writer) {
    assert(writer[kReadyPromiseResolve] === undefined);
    assert(writer[kReadyPromiseReject] === undefined);

    writer[kReadyPromise] = new Promise((resolve, reject) => {
      writer[kReadyPromiseResolve] = resolve;
      writer[kReadyPromiseReject] = reject;
    });
    writer[kReadyPromiseState] = 'pending';
  }

  function defaultWriterReadyPromiseResetToRejected(writer, reason) {
    assert(writer[kReadyPromiseResolve] === undefined);
    assert(writer[kReadyPromiseReject] === undefined);

    writer[kReadyPromise] = Promise.reject(reason);
    writer[kReadyPromiseState] = 'rejected';
  }

  function defaultWriterReadyPromiseResolve(writer) {
    assert(writer[kReadyPromiseResolve] !== undefined);
    assert(writer[kReadyPromiseReject] !== undefined);

    writer[kReadyPromiseResolve](undefined);
    writer[kReadyPromiseResolve] = undefined;
    writer[kReadyPromiseReject] = undefined;
    writer[kReadyPromiseState] = 'fulfilled';
  }
};
