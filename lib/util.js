'use strict';

const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const regExpToString = RegExp.prototype.toString;
const dateToISOString = Date.prototype.toISOString;
const errorToString = Error.prototype.toString;

/* eslint-disable */
const strEscapeSequencesRegExp = /[\x00-\x1f\x27\x5c]/;
const strEscapeSequencesReplacer = /[\x00-\x1f\x27\x5c]/g;
/* eslint-enable */
const keyStrRegExp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const colorRegExp = /\u001b\[\d\d?m/g; // eslint-disable-line no-control-regex
const numberRegExp = /^(0|[1-9][0-9]*)$/;

const readableRegExps = {};

const MIN_LINE_LENGTH = 16;

// Escaped special characters. Use empty strings to fill up unused entries.
const meta = [
  '\\u0000', '\\u0001', '\\u0002', '\\u0003', '\\u0004',
  '\\u0005', '\\u0006', '\\u0007', '\\b', '\\t',
  '\\n', '\\u000b', '\\f', '\\r', '\\u000e',
  '\\u000f', '\\u0010', '\\u0011', '\\u0012', '\\u0013',
  '\\u0014', '\\u0015', '\\u0016', '\\u0017', '\\u0018',
  '\\u0019', '\\u001a', '\\u001b', '\\u001c', '\\u001d',
  '\\u001e', '\\u001f', '', '', '',
  '', '', '', '', "\\'", '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '\\\\',
];

const escapeFn = (str) => meta[str.charCodeAt(0)];

// Escape control characters, single quotes and the backslash.
// This is similar to JSON stringify escaping.
function strEscape(str) {
  // Some magic numbers that worked out fine while benchmarking with v8 6.0
  if (str.length < 5000 && !strEscapeSequencesRegExp.test(str))
    return `'${str}'`;
  if (str.length > 100)
    return `'${str.replace(strEscapeSequencesReplacer, escapeFn)}'`;
  var result = '';
  var last = 0;
  for (var i = 0; i < str.length; i++) {
    const point = str.charCodeAt(i);
    if (point === 39 || point === 92 || point < 32) {
      if (last === i)
        result += meta[point];
      else
        result += `${str.slice(last, i)}${meta[point]}`;

      last = i + 1;
    }
  }
  if (last === 0)
    result = str;
  else if (last !== i)
    result += str.slice(last);

  return `'${result}'`;
}

const inspectDefaultOptions = Object.seal({
  showHidden: false,
  depth: 2,
  colors: false,
  showProxy: false,
  maxArrayLength: 100,
  breakLength: 60,
  compact: true,
});

/* eslint-disable prefer-rest-params */

const emptyOptions = {};
function format(...args) {
  return formatWithOptions(emptyOptions, ...args);
}

function formatWithOptions(inspectOptions, f) {
  var i, tempStr;
  if (typeof f !== 'string') {
    if (arguments.length === 1)
      return '';
    var res = '';
    for (i = 1; i < arguments.length - 1; i++) {
      res += inspect(arguments[i], inspectOptions);
      res += ' ';
    }
    res += inspect(arguments[i], inspectOptions);
    return res;
  }

  if (arguments.length === 2)
    return f;

  var str = '';
  var a = 2;
  var lastPos = 0;
  for (i = 0; i < f.length - 1; i++) {
    if (f.charCodeAt(i) === 37) { // '%'
      const nextChar = f.charCodeAt(++i);
      if (a !== arguments.length) {
        switch (nextChar) {
          case 115: // 's'
            tempStr = String(arguments[a++]);
            break;
          case 106: // 'j'
            tempStr = tryStringify(arguments[a++]);
            break;
          case 100: // 'd'
            tempStr = `${Number(arguments[a++])}`;
            break;
          case 79: // 'O'
            tempStr = inspect(arguments[a++], inspectOptions);
            break;
          case 111: { // 'o'
            const opts = Object.assign({}, inspectOptions, {
              showHidden: true,
              showProxy: true,
            });
            tempStr = inspect(arguments[a++], opts);
            break;
          }
          case 105: // 'i'
            tempStr = `${parseInt(arguments[a++])}`;
            break;
          case 102: // 'f'
            tempStr = `${parseFloat(arguments[a++])}`;
            break;
          case 37: // '%'
            str += f.slice(lastPos, i);
            lastPos = i + 1;
            continue;
          default: // any other character is not a correct placeholder
            continue;
        }
        if (lastPos !== i - 1)
          str += f.slice(lastPos, i - 1);
        str += tempStr;
        lastPos = i + 1;
      } else if (nextChar === 37) {
        str += f.slice(lastPos, i);
        lastPos = i + 1;
      }
    }
  }
  if (lastPos === 0)
    str = f;
  else if (lastPos < f.length)
    str += f.slice(lastPos);
  while (a < arguments.length) {
    const x = arguments[a++];
    if ((typeof x !== 'object' && typeof x !== 'symbol') || x === null)
      str += ` ${x}`;
    else
      str += ` ${inspect(x, inspectOptions)}`;
  }
  return str;
}

var CIRCULAR_ERROR_MESSAGE;

function tryStringify(arg) {
  try {
    return JSON.stringify(arg);
  } catch (err) {
    // Populate the circular error message lazily
    if (!CIRCULAR_ERROR_MESSAGE) {
      try {
        const a = {};
        a.a = a;
        JSON.stringify(a);
      } catch (e) {
        CIRCULAR_ERROR_MESSAGE = e.message;
      }
    }
    if (err.name === 'TypeError' && err.message === CIRCULAR_ERROR_MESSAGE)
      return '[Circular]';
    throw err;
  }
}

function inspect(value, opts, arg2, arg3) {
  // Default options
  const ctx = {
    seen: [],
    stylize: stylizeNoColor,
    showHidden: inspectDefaultOptions.showHidden,
    depth: inspectDefaultOptions.depth,
    colors: inspectDefaultOptions.colors,
    showProxy: inspectDefaultOptions.showProxy,
    maxArrayLength: inspectDefaultOptions.maxArrayLength,
    breakLength: inspectDefaultOptions.breakLength,
    indentationLvl: 0,
    compact: inspectDefaultOptions.compact,
  };
  // Legacy...
  if (arguments.length > 2) {
    if (arg2 !== undefined)
      ctx.depth = arg2;

    if (arguments.length > 3 && arg3 !== undefined)
      ctx.colors = arg3;
  }
  // Set user-specified options
  if (typeof opts === 'boolean') {
    ctx.showHidden = opts;
  } else if (opts) {
    const optKeys = Object.keys(opts);
    for (var i = 0; i < optKeys.length; i++)
      ctx[optKeys[i]] = opts[optKeys[i]];
  }
  if (ctx.colors)
    ctx.stylize = stylizeWithColor;
  if (ctx.maxArrayLength === null)
    ctx.maxArrayLength = Infinity;
  return formatValue(ctx, value, ctx.depth);
}

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = Object.assign(Object.create(null), {
  bold: [1, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  white: [37, 39],
  grey: [90, 39],
  black: [30, 39],
  blue: [34, 39],
  cyan: [36, 39],
  green: [32, 39],
  magenta: [35, 39],
  red: [31, 39],
  yellow: [33, 39],
});

inspect.styles = Object.assign(Object.create(null), {
  special: 'cyan',
  bigint: 'blue',
  number: 'blue',
  boolean: 'yellow',
  undefined: 'grey',
  null: 'bold',
  string: 'green',
  symbol: 'green',
  date: 'magenta',
  // "name": intentionally not styling
  regexp: 'red',
});

function stylizeNoColor(str) {
  return str;
}

function stylizeWithColor(str, styleType) {
  const style = inspect.styles[styleType];
  if (style !== undefined) {
    const color = inspect.colors[style];
    return `\u001b[${color[0]}m${str}\u001b[${color[1]}m`;
  }
  return str;
}

function formatValue(ctx, value, recurseTimes, ln) {
  // Primitive types cannot have properties
  if (typeof value !== 'object' && typeof value !== 'function')
    return formatPrimitive(ctx.stylize, value, ctx);

  if (value === null)
    return ctx.stylize('null', 'null');

  var keys;
  var symbols = Object.getOwnPropertySymbols(value);

  // Look up the keys of the object.
  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  } else {
    keys = Object.keys(value);
    if (symbols.length !== 0)
      symbols = symbols.filter((key) => propertyIsEnumerable.call(value, key));
  }

  const keyLength = keys.length + symbols.length;

  const { constructor, tag } = getIdentificationOf(value);
  var prefix = '';
  if (constructor && tag && constructor !== tag)
    prefix = `${constructor} [${tag}] `;
  else if (constructor)
    prefix = `${constructor} `;
  else if (tag)
    prefix = `[${tag}] `;
  var base = '';
  var formatter = formatObject;
  var braces;
  var noIterator = true;
  var raw;
  // Iterators and the rest are split to reduce checks
  if (value[Symbol.iterator]) {
    noIterator = false;
    if (Array.isArray(value)) {
      // Only set the constructor for non ordinary ("Array [...]") arrays.
      braces = [`${prefix === 'Array ' ? '' : prefix}[`, ']'];
      if (value.length === 0 && keyLength === 0)
        return `${braces[0]}]`;
      formatter = formatArray;
    } else if (isSet(value)) {
      if (value.size === 0 && keyLength === 0)
        return `${prefix}{}`;
      braces = [`${prefix}{`, '}'];
      formatter = formatSet;
    } else if (isMap(value)) {
      if (value.size === 0 && keyLength === 0)
        return `${prefix}{}`;
      braces = [`${prefix}{`, '}'];
      formatter = formatMap;
    } else if (isTypedArray(value)) {
      braces = [`${prefix}[`, ']'];
      formatter = formatTypedArray;
    } else {
      // Check for boxed strings with valueOf()
      // The .valueOf() call can fail for a multitude of reasons
      try {
        raw = value.valueOf();
      } catch (e) { /* ignore */ }
      if (typeof raw === 'string') {
        const formatted = formatPrimitive(stylizeNoColor, raw, ctx);
        if (keyLength === raw.length)
          return ctx.stylize(`[String: ${formatted}]`, 'string');
        base = `[String: ${formatted}]`;
        // For boxed Strings, we have to remove the 0-n indexed entries,
        // since they just noisy up the output and are redundant
        // Make boxed primitive Strings look like such
        keys = keys.slice(value.length);
        braces = ['{', '}'];
      } else {
        noIterator = true;
      }
    }
  }
  if (noIterator) {
    braces = ['{', '}'];
    if (prefix === 'Object ') {
      // Object fast path
      if (keyLength === 0)
        return '{}';
    } else if (typeof value === 'function') {
      const name =
        `${constructor || tag}${value.name ? `: ${value.name}` : ''}`;
      if (keyLength === 0)
        return ctx.stylize(`[${name}]`, 'special');
      base = `[${name}]`;
    } else if (isRegExp(value)) {
      // Make RegExps say that they are RegExps
      if (keyLength === 0 || recurseTimes < 0)
        return ctx.stylize(regExpToString.call(value), 'regexp');
      base = `${regExpToString.call(value)}`;
    } else if (isDate(value)) {
      if (keyLength === 0) {
        if (Number.isNaN(value.getTime()))
          return ctx.stylize(value.toString(), 'date');
        return ctx.stylize(dateToISOString.call(value), 'date');
      }
      // Make dates with properties first say the date
      base = `${dateToISOString.call(value)}`;
    } else if (isError(value)) {
      // Make error with message first say the error
      if (keyLength === 0)
        return formatError(value);
      base = `${formatError(value)}`;
    } else if (isAnyArrayBuffer(value)) {
      // Fast path for ArrayBuffer and SharedArrayBuffer.
      // Can't do the same for DataView because it has a non-primitive
      // .buffer property that we need to recurse for.
      if (keyLength === 0) {
        return `${prefix
        }{ byteLength: ${formatNumber(ctx.stylize, value.byteLength)} }`;
      }
      braces[0] = `${prefix}{`;
      keys.unshift('byteLength');
    } else if (isDataView(value)) {
      braces[0] = `${prefix}{`;
      // .buffer goes last, it's not a primitive like the others.
      keys.unshift('byteLength', 'byteOffset', 'buffer');
    } else if (isPromise(value)) {
      braces[0] = `${prefix}{`;
      formatter = formatPromise;
    } else {
      // Check boxed primitives other than string with valueOf()
      // NOTE: `Date` has to be checked first!
      // The .valueOf() call can fail for a multitude of reasons
      try {
        raw = value.valueOf();
      } catch (e) { /* ignore */ }
      if (typeof raw === 'number') {
        // Make boxed primitive Numbers look like such
        const formatted = formatPrimitive(stylizeNoColor, raw);
        if (keyLength === 0)
          return ctx.stylize(`[Number: ${formatted}]`, 'number');
        base = `[Number: ${formatted}]`;
      } else if (typeof raw === 'boolean') {
        // Make boxed primitive Booleans look like such
        const formatted = formatPrimitive(stylizeNoColor, raw);
        if (keyLength === 0)
          return ctx.stylize(`[Boolean: ${formatted}]`, 'boolean');
        base = `[Boolean: ${formatted}]`;
      } else if (typeof raw === 'symbol') {
        const formatted = formatPrimitive(stylizeNoColor, raw);
        return ctx.stylize(`[Symbol: ${formatted}]`, 'symbol');
      } else if (keyLength === 0) {
        if (isExternal(value))
          return ctx.stylize('[External]', 'special');
        return `${prefix}{}`;
      } else {
        braces[0] = `${prefix}{`;
      }
    }
  }
  // Using an array here is actually better for the average case than using
  // a Set. `seen` will only check for the depth and will never grow too large.
  if (ctx.seen.indexOf(value) !== -1)
    return ctx.stylize('[Circular]', 'special');
  if (recurseTimes != null) { // eslint-disable-line eqeqeq
    if (recurseTimes < 0)
      return ctx.stylize(`[${constructor || tag || 'Object'}]`, 'special');
    recurseTimes -= 1;
  }

  ctx.seen.push(value);
  const output = formatter(ctx, value, recurseTimes, keys);

  for (var i = 0; i < symbols.length; i++)
    output.push(formatProperty(ctx, value, recurseTimes, symbols[i], 0));

  ctx.seen.pop();

  return reduceToSingleString(ctx, output, base, braces, ln);
}

function isMap(o) {
  return o instanceof Map;
}

function isSet(o) {
  return o instanceof Set;
}

function isExternal() {
  return false;
}

function isRegExp(o) {
  return o instanceof RegExp;
}

function isTypedArray(o) {
  for (const type of [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
  ]) {
    if (o instanceof type)
      return true;
  }

  return false;
}

function isDate(o) {
  return o instanceof Date;
}

function isError(o) {
  return o instanceof Error;
}

function isDataView(o) {
  return ArrayBuffer.isView(o);
}

function isAnyArrayBuffer(o) {
  return o instanceof ArrayBuffer;
}

function formatNumber(fn, value) {
  // Format -0 as '-0'. Checking `value === -0` won't distinguish 0 from -0.
  if (Object.is(value, -0))
    return fn('-0', 'number');
  return fn(`${value}`, 'number');
}

function formatPrimitive(fn, value, ctx) {
  if (typeof value === 'string') {
    if (ctx.compact === false &&
      value.length > MIN_LINE_LENGTH &&
      ctx.indentationLvl + value.length > ctx.breakLength) {
      // eslint-disable-next-line max-len
      const minLineLength = Math.max(ctx.breakLength - ctx.indentationLvl, MIN_LINE_LENGTH);
      // eslint-disable-next-line max-len
      const averageLineLength = Math.ceil(value.length / Math.ceil(value.length / minLineLength));
      const divisor = Math.max(averageLineLength, MIN_LINE_LENGTH);
      var res = '';
      if (readableRegExps[divisor] === undefined) {
        // Build a new RegExp that naturally breaks text into multiple lines.
        //
        // Rules
        // 1. Greedy match all text up the max line length that ends with a
        //    whitespace or the end of the string.
        // 2. If none matches, non-greedy match any text up to a whitespace or
        //    the end of the string.
        //
        // eslint-disable-next-line max-len, no-unescaped-regexp-dot
        readableRegExps[divisor] = new RegExp(`(.|\\n){1,${divisor}}(\\s|$)|(\\n|.)+?(\\s|$)`, 'gm');
      }
      const indent = ' '.repeat(ctx.indentationLvl);
      const matches = value.match(readableRegExps[divisor]);
      if (matches.length > 1) {
        res += `${fn(strEscape(matches[0]), 'string')} +\n`;
        for (var i = 1; i < matches.length - 1; i++)
          res += `${indent}  ${fn(strEscape(matches[i]), 'string')} +\n`;

        res += `${indent}  ${fn(strEscape(matches[i]), 'string')}`;
        return res;
      }
    }
    return fn(strEscape(value), 'string');
  }
  if (typeof value === 'bigint') // eslint-disable-line valid-typeof
    return fn(`${value}n`, 'bigint');
  if (typeof value === 'number')
    return formatNumber(fn, value);
  if (typeof value === 'boolean')
    return fn(`${value}`, 'boolean');
  if (typeof value === 'undefined')
    return fn('undefined', 'undefined');
  // es6 symbol primitive
  return fn(value.toString(), 'symbol');
}

function formatError(value) {
  return value.stack || `[${errorToString.call(value)}]`;
}

function formatObject(ctx, value, recurseTimes, keys) {
  const len = keys.length;
  const output = new Array(len);
  for (var i = 0; i < len; i++)
    output[i] = formatProperty(ctx, value, recurseTimes, keys[i], 0);
  return output;
}

// The array is sparse and/or has extra keys
function formatSpecialArray(ctx, value, recurseTimes, keys, maxLength, valLen) {
  const output = [];
  const keyLen = keys.length;
  var visibleLength = 0;
  var i = 0;
  if (keyLen !== 0 && numberRegExp.test(keys[0])) {
    for (const key of keys) {
      if (visibleLength === maxLength)
        break;
      const index = +key;
      // Arrays can only have up to 2^32 - 1 entries
      if (index > (2 ** 32) - 2)
        break;
      if (i !== index) {
        if (!numberRegExp.test(key))
          break;
        const emptyItems = index - i;
        const ending = emptyItems > 1 ? 's' : '';
        const message = `<${emptyItems} empty item${ending}>`;
        output.push(ctx.stylize(message, 'undefined'));
        i = index;
        if (++visibleLength === maxLength)
          break;
      }
      output.push(formatProperty(ctx, value, recurseTimes, key, 1));
      visibleLength++;
      i++;
    }
  }
  if (i < valLen && visibleLength !== maxLength) {
    const len = valLen - i;
    const ending = len > 1 ? 's' : '';
    const message = `<${len} empty item${ending}>`;
    output.push(ctx.stylize(message, 'undefined'));
    i = valLen;
    if (keyLen === 0)
      return output;
  }
  const remaining = valLen - i;
  if (remaining > 0)
    output.push(`... ${remaining} more item${remaining > 1 ? 's' : ''}`);

  if (ctx.showHidden && keys[keyLen - 1] === 'length') {
    // No extra keys
    output.push(formatProperty(ctx, value, recurseTimes, 'length', 2));
  } else if (valLen === 0 || (keyLen > valLen && keys[valLen - 1] === `${valLen - 1}`)) {
    // The array is not sparse
    for (i = valLen; i < keyLen; i++)
      output.push(formatProperty(ctx, value, recurseTimes, keys[i], 2));
  } else if (keys[keyLen - 1] !== `${valLen - 1}`) {
    const extra = [];
    // Only handle special keys
    var key;
    for (i = keys.length - 1; i >= 0; i--) {
      key = keys[i];
      if (numberRegExp.test(key) && +key < (2 ** 32) - 1)
        break;
      extra.push(formatProperty(ctx, value, recurseTimes, key, 2));
    }
    for (i = extra.length - 1; i >= 0; i--)
      output.push(extra[i]);
  }
  return output;
}

function formatArray(ctx, value, recurseTimes, keys) {
  const len = Math.min(Math.max(0, ctx.maxArrayLength), value.length);
  const hidden = ctx.showHidden ? 1 : 0;
  const valLen = value.length;
  const keyLen = keys.length - hidden;
  if (keyLen !== valLen || keys[keyLen - 1] !== `${valLen - 1}`)
    return formatSpecialArray(ctx, value, recurseTimes, keys, len, valLen);

  const remaining = valLen - len;
  const output = new Array(len + (remaining > 0 ? 1 : 0) + hidden);
  for (var i = 0; i < len; i++)
    output[i] = formatProperty(ctx, value, recurseTimes, keys[i], 1);
  if (remaining > 0)
    output[i++] = `... ${remaining} more item${remaining > 1 ? 's' : ''}`;
  if (ctx.showHidden === true)
    output[i] = formatProperty(ctx, value, recurseTimes, 'length', 2);
  return output;
}

function formatTypedArray(ctx, value, recurseTimes, keys) {
  const maxLength = Math.min(Math.max(0, ctx.maxArrayLength), value.length);
  const remaining = value.length - maxLength;
  const output = new Array(maxLength + (remaining > 0 ? 1 : 0));
  for (var i = 0; i < maxLength; ++i)
    output[i] = formatNumber(ctx.stylize, value[i]);
  if (remaining > 0)
    output[i] = `... ${remaining} more item${remaining > 1 ? 's' : ''}`;
  if (ctx.showHidden) {
    // .buffer goes last, it's not a primitive like the others.
    const extraKeys = [
      'BYTES_PER_ELEMENT',
      'length',
      'byteLength',
      'byteOffset',
      'buffer',
    ];
    for (i = 0; i < extraKeys.length; i++) {
      const str = formatValue(ctx, value[extraKeys[i]], recurseTimes);
      output.push(`[${extraKeys[i]}]: ${str}`);
    }
  }
  // TypedArrays cannot have holes. Therefore it is safe to assume that all
  // extra keys are indexed after value.length.
  for (i = value.length; i < keys.length; i++)
    output.push(formatProperty(ctx, value, recurseTimes, keys[i], 2));

  return output;
}

function formatSet(ctx, value, recurseTimes, keys) {
  const output = new Array(value.size + keys.length + (ctx.showHidden ? 1 : 0));
  var i = 0;
  for (const v of value)
    output[i++] = formatValue(ctx, v, recurseTimes);
  // With `showHidden`, `length` will display as a hidden property for
  // arrays. For consistency's sake, do the same for `size`, even though this
  // property isn't selected by Object.getOwnPropertyNames().
  if (ctx.showHidden)
    output[i++] = `[size]: ${ctx.stylize(`${value.size}`, 'number')}`;
  for (var n = 0; n < keys.length; n++)
    output[i++] = formatProperty(ctx, value, recurseTimes, keys[n], 0);

  return output;
}

function formatMap(ctx, value, recurseTimes, keys) {
  const output = new Array(value.size + keys.length + (ctx.showHidden ? 1 : 0));
  var i = 0;
  for (const [k, v] of value) {
    output[i++] = `${formatValue(ctx, k, recurseTimes)} => ${
      formatValue(ctx, v, recurseTimes)}`;
  }
  // See comment in formatSet
  if (ctx.showHidden)
    output[i++] = `[size]: ${ctx.stylize(`${value.size}`, 'number')}`;
  for (var n = 0; n < keys.length; n++)
    output[i++] = formatProperty(ctx, value, recurseTimes, keys[n], 0);

  return output;
}

function formatPromise(ctx, value, recurseTimes, keys) {
  var output;
  const [state, result] = getPromiseDetails(value);
  if (state === kPending) {
    output = ['<pending>'];
  } else {
    const str = formatValue(ctx, result, recurseTimes);
    output = [state === kRejected ? `<rejected> ${str}` : str];
  }
  for (var n = 0; n < keys.length; n++)
    output.push(formatProperty(ctx, value, recurseTimes, keys[n], 0));
  return output;
}

function formatProperty(ctx, value, recurseTimes, key, array) {
  var name, str;
  const desc = Object.getOwnPropertyDescriptor(value, key) ||
    { value: value[key], enumerable: true };
  if (desc.value !== undefined) {
    const diff = array !== 0 || ctx.compact === false ? 2 : 3;
    ctx.indentationLvl += diff;
    str = formatValue(ctx, desc.value, recurseTimes, array === 0);
    ctx.indentationLvl -= diff;
  } else if (desc.get !== undefined) {
    if (desc.set !== undefined)
      str = ctx.stylize('[Getter/Setter]', 'special');
    else
      str = ctx.stylize('[Getter]', 'special');
  } else if (desc.set !== undefined) {
    str = ctx.stylize('[Setter]', 'special');
  } else {
    str = ctx.stylize('undefined', 'undefined');
  }
  if (array === 1)
    return str;

  if (typeof key === 'symbol')
    name = `[${ctx.stylize(key.toString(), 'symbol')}]`;
  else if (desc.enumerable === false)
    name = `[${key}]`;
  else if (keyStrRegExp.test(key))
    name = ctx.stylize(key, 'name');
  else
    name = ctx.stylize(strEscape(key), 'string');


  return `${name}: ${str}`;
}

function reduceToSingleString(ctx, output, base, braces, addLn) {
  const breakLength = ctx.breakLength;
  var i = 0;
  if (ctx.compact === false) {
    const indentation = ' '.repeat(ctx.indentationLvl);
    var res = `${base ? `${base} ` : ''}${braces[0]}\n${indentation}  `;
    for (; i < output.length - 1; i++)
      res += `${output[i]},\n${indentation}  `;

    res += `${output[i]}\n${indentation}${braces[1]}`;
    return res;
  }
  if (output.length * 2 <= breakLength) {
    var length = 0;
    for (; i < output.length && length <= breakLength; i++) {
      if (ctx.colors)
        length += output[i].replace(colorRegExp, '').length + 1;
      else
        length += output[i].length + 1;
    }
    if (length <= breakLength) {
      return `${braces[0]}${base ? ` ${base}` : ''} ${join(output, ', ')} ${
        braces[1]}`;
    }
  }
  // If the opening "brace" is too large, like in the case of "Set {",
  // we need to force the first item to be on the next line or the
  // items will not line up correctly.
  const indentation = ' '.repeat(ctx.indentationLvl);
  const extraLn = addLn === true ? `\n${indentation}` : '';
  const ln = base === '' && braces[0].length === 1 ?
    ' ' : `${base ? ` ${base}` : base}\n${indentation}  `;
  const str = join(output, `,\n${indentation}  `);
  return `${extraLn}${braces[0]}${ln}${str} ${braces[1]}`;
}

function getIdentificationOf(obj) {
  const original = obj;
  let constructor;
  let tag;

  while (obj) {
    if (constructor === undefined) {
      const desc = Object.getOwnPropertyDescriptor(obj, 'constructor');
      if (desc !== undefined &&
          typeof desc.value === 'function' &&
          desc.value.name !== '')
        constructor = desc.value.name;
    }

    if (tag === undefined) {
      const desc = Object.getOwnPropertyDescriptor(obj, Symbol.toStringTag);
      if (desc !== undefined) {
        if (typeof desc.value === 'string') {
          tag = desc.value;
        } else if (desc.get !== undefined) {
          tag = desc.get.call(original);
          if (typeof tag !== 'string') // eslint-disable-line max-depth
            tag = undefined;
        }
      }
    }

    if (constructor !== undefined && tag !== undefined)
      break;

    obj = Object.getPrototypeOf(obj);
  }

  return { constructor, tag };
}

function join(output, separator) {
  var str = '';
  if (output.length !== 0) {
    for (var i = 0; i < output.length - 1; i++) {
      // It is faster not to use a template string here
      str += output[i];
      str += separator;
    }
    str += output[i];
  }
  return str;
}

var isPromise;
var getPromiseDetails;
var kPending;
var kRejected;

({ binding, namespace }) => {
  ({
    isPromise,
    getPromiseDetails,
    kPending,
    kRejected,
  } = binding('util'));

  namespace.inspect = inspect;
  namespace.format = format;
  namespace.formatWithOptions = formatWithOptions;
};
