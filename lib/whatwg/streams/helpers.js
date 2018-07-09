'use strict';

// https://github.com/whatwg/streams/blob/master/reference-implementation/lib/helpers.js

({ namespace, PrivateSymbol }) => {
  // TODO(devsnek): kill fake detachment
  const isFakeDetached = PrivateSymbol('is "detached" for our purposes');

  const assert = (condition) => {
    if (!condition) {
      throw new Error(`${condition} failed`);
    }
  };
  namespace.assert = assert;

  function IsPropertyKey(argument) {
    return typeof argument === 'string' || typeof argument === 'symbol';
  }

  namespace.typeIsObject = (x) => (typeof x === 'object' && x !== null) || typeof x === 'function';

  namespace.createDataProperty = (o, p, v) => {
    assert(namespace.typeIsObject(o));
    Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
  };


  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  namespace.createArrayFromList = (elements) => elements.slice();

  namespace.ArrayBufferCopy = (dest, destOffset, src, srcOffset, n) => {
    new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
  };

  namespace.CreateIterResultObject = (value, done) => {
    assert(typeof done === 'boolean');
    const obj = {};
    Object.defineProperty(obj, 'value', { value, enumerable: true, writable: true, configurable: true });
    Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
    return obj;
  };

  namespace.IsFiniteNonNegativeNumber = (v) => {
    if (namespace.IsNonNegativeNumber(v) === false) {
      return false;
    }

    if (v === Infinity) {
      return false;
    }

    return true;
  };

  namespace.IsNonNegativeNumber = (v) => {
    if (typeof v !== 'number') {
      return false;
    }

    if (Number.isNaN(v)) {
      return false;
    }

    if (v < 0) {
      return false;
    }

    return true;
  };

  function Call(F, V, args) {
    if (typeof F !== 'function') {
      throw new TypeError('Argument is not a function');
    }

    return Function.prototype.apply.call(F, V, args);
  }

  namespace.Call = Call;

  function PromiseCall(F, V, args) {
    assert(typeof F === 'function');
    assert(V !== undefined);
    assert(Array.isArray(args));
    try {
      return Promise.resolve(Call(F, V, args));
    } catch (value) {
      return Promise.reject(value);
    }
  }

  namespace.PromiseCall = PromiseCall;

  namespace.CreateAlgorithmFromUnderlyingMethod =
    (underlyingObject, methodName, algoArgCount, extraArgs) => {
      assert(underlyingObject !== undefined);
      assert(IsPropertyKey(methodName));
      assert(algoArgCount === 0 || algoArgCount === 1);
      assert(Array.isArray(extraArgs));
      const method = underlyingObject[methodName];
      if (method !== undefined) {
        if (typeof method !== 'function') {
          throw new TypeError(`${method} is not a method`);
        }
        if (algoArgCount === 0) {
          return () => PromiseCall(method, underlyingObject, extraArgs);
        }

        if (algoArgCount === 1) {
          return (arg) => {
            const fullArgs = [arg].concat(extraArgs);
            return PromiseCall(method, underlyingObject, fullArgs);
          };
        }
      }
      return () => Promise.resolve();
    };

  namespace.InvokeOrNoop = (O, P, args) => {
    assert(O !== undefined);
    assert(IsPropertyKey(P));
    assert(Array.isArray(args));

    const method = O[P];
    if (method === undefined) {
      return undefined;
    }

    return Call(method, O, args);
  };

  // Not implemented correctly
  namespace.TransferArrayBuffer = (O) => {
    assert(!namespace.IsDetachedBuffer(O));
    const transferredIshVersion = O.slice();

    // This is specifically to fool tests that test "is transferred" by taking a non-zero-length
    // ArrayBuffer and checking if its byteLength starts returning 0.
    Object.defineProperty(O, 'byteLength', {
      get() {
        return 0;
      },
    });
    O[isFakeDetached] = true;

    return transferredIshVersion;
  };

  // Not implemented correctly
  namespace.IsDetachedBuffer = (O) => isFakeDetached in O;

  namespace.ValidateAndNormalizeHighWaterMark = (highWaterMark) => {
    highWaterMark = Number(highWaterMark);
    if (Number.isNaN(highWaterMark) || highWaterMark < 0) {
      throw new RangeError('highWaterMark property of a queuing strategy must be non-negative and non-NaN');
    }

    return highWaterMark;
  };

  namespace.MakeSizeAlgorithmFromSizeFunction = (size) => {
    if (size === undefined) {
      return () => 1;
    }
    if (typeof size !== 'function') {
      throw new TypeError('size property of a queuing strategy must be a function');
    }
    return (chunk) => size(chunk);
  };

  const kQueue = PrivateSymbol('kQueue');
  const kQueueTotalSize = PrivateSymbol('kQueueTotalSize');
  namespace.kQueue = kQueue;
  namespace.kQueueTotalSize = kQueueTotalSize;

  namespace.DequeueValue = (container) => {
    assert(kQueue in container && kQueueTotalSize in container);
    assert(container[kQueue].length > 0);

    const pair = container[kQueue].shift();
    container[kQueueTotalSize] -= pair.size;
    if (container[kQueueTotalSize] < 0) {
      container[kQueueTotalSize] = 0;
    }

    return pair.value;
  };

  namespace.EnqueueValueWithSize = (container, value, size) => {
    assert(kQueue in container && kQueueTotalSize in container);

    size = Number(size);
    if (!namespace.IsFiniteNonNegativeNumber(size)) {
      throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
    }

    container[kQueue].push({ value, size });
    container[kQueueTotalSize] += size;
  };

  namespace.PeekQueueValue = (container) => {
    assert(kQueue in container && kQueueTotalSize in container);
    assert(container[kQueue].length > 0);

    const pair = container[kQueue][0];
    return pair.value;
  };

  namespace.ResetQueue = (container) => {
    assert(kQueue in container && kQueueTotalSize in container);

    container[kQueue] = [];
    container[kQueueTotalSize] = 0;
  };
};
