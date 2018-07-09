if (typeof binding !== 'function') {
  throw new Error('configure zero with --expose-binding');
}

const knownGlobals = Object.getOwnPropertyNames(global);

const {
  isDate,
  isRegExp,
  isNativeError,
} = binding('types'); // eslint-disable-line no-undef

const uncurryThis = (fn) => (t, ...args) => Reflect.apply(fn, t, args);

const ObjectToString = uncurryThis(Object.prototype.toString);
const propertyIsEnumerable = uncurryThis(Object.prototype.propertyIsEnumerable);

function checkKeys(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  let aSymbols = Object.getOwnPropertySymbols(a);
  let bSymbols = Object.getOwnPropertySymbols(b);

  if (aSymbols.length !== 0) {
    aSymbols = aSymbols.filter((k) => propertyIsEnumerable(a, k));
    bSymbols = bSymbols.filter((k) => propertyIsEnumerable(b, k));

    if (aSymbols.length !== bSymbols.length) {
      return false;
    }
  } else if (bSymbols.length !== 0 &&
    bSymbols.filter((k) => propertyIsEnumerable(b, k)).length !== 0) {
    return false;
  }

  if (aSymbols.length !== 0) {
    aKeys.push(...aSymbols);
    bKeys.push(...bSymbols);
  }

  if (!aKeys.every((k) => deepEqual(a[k], b[k]))) { // eslint-disable-line no-use-before-define
    return false;
  }

  return true;
}

export function deepEqual(a, b) {
  if (a === b) {
    if (a !== 0) {
      return true;
    }
    return Object.is(a, b);
  }

  const aTag = ObjectToString(a);
  const bTag = ObjectToString(b);

  if (aTag !== bTag) {
    return false;
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false;
  }

  if (aTag === '[object Array]' || aTag === '[object Uint8Array]') {
    if (a.length !== b.length) {
      return false;
    }

    return checkKeys(a, b);
  }

  if (aTag === '[object Object]') {
    return checkKeys(a, b);
  }

  if (isDate(a) && a.getTime() === b.getTime()) {
    return false;
  }

  if (isRegExp(a) && a.source === b.source && a.flags === b.flags) {
    return false;
  }

  if (isNativeError(a) && a.message !== b.message) {
    return false;
  }
}

export function assert(condition) {
  if (!condition) {
    throw new Error('Assertion failed');
  }
}

export function assertEqual(expected, actual) {
  if (expected !== actual) {
    throw new Error(`${expected} !== ${actual}`);
  }
}

export function assertDeepEqual(expected, actual) {
  if (!deepEqual(expected, actual)) {
    throw new Error(`${expected} !== ${actual}`);
  }
}

const mustCalls = new Map();

export function mustCall(fn) {
  const wrap = (...args) => {
    mustCalls.delete(wrap);
    return fn(...args);
  };
  mustCalls.set(wrap, fn);
}

export function pass() {}

const error = (...args) => {
  console.trace(...args); // eslint-disable-line no-console
  const { exit } = new DynamicLibrary(null, { exit: ['void', ['int']] });
  exit(1);
};

export function fail(message) {
  error(message);
}

export const fixtures = `${new URL('fixtures/', import.meta.url)}`;

global.addEventListener('exit', () => {
  const unexpectedGlobals = Object.getOwnPropertyNames(global)
    .filter((g) => !knownGlobals.includes(g));
  if (unexpectedGlobals.length) {
    error('unexpected globals', unexpectedGlobals);
  }

  [...mustCalls].forEach(([, fn]) => {
    error('function was uncalled', fn, fn.toString());
  });
});
