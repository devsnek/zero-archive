'use strict';

// https://github.com/nodejs/node/blob/master/lib/util.js

({ namespace, binding, kCustomInspect }) => {
  const {
    getProxyDetails,
    getPromiseDetails,
    kPending,
    kRejected,
    previewEntries,
  } = binding('util');
  const {
    isRegExp,
    isDate,
    isModuleNamespaceObject,
    isMap,
    isSet,
    isWeakMap,
    isWeakSet,
    isMapIterator,
    isSetIterator,
  } = binding('types');

  const uncurryThis = (fn) => (t, ...a) => Reflect.apply(fn, t, a);
  const dateToISOString = uncurryThis(Date.prototype.toISOString);
  const regExpToString = uncurryThis(RegExp.prototype.toString);
  const errorToString = uncurryThis(Error.prototype.toString);
  const propertyIsEnumerable = uncurryThis(Object.prototype.propertyIsEnumerable);
  const hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

  const ansi = Object.assign(Object.create(null), {
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

  const styles = Object.assign(Object.create(null), {
    special: 'cyan',
    bigint: 'blue',
    number: 'blue',
    boolean: 'yellow',
    undefined: 'grey',
    null: 'bold',
    string: 'green',
    symbol: 'green',
    date: 'magenta',
    regexp: 'red',
  });

  const stylizeWithColor = (str, styleName) => {
    const style = styles[styleName];
    if (style !== undefined) {
      const [start, end] = ansi[style];
      return `\u001b[${start}m${str}\u001b[${end}m`;
    }
    return str;
  };

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


  /* eslint-disable no-control-regex */
  const strEscapeSequencesRegExp = /[\x00-\x1f\x27\x5c]/;
  const strEscapeSequencesReplacer = /[\x00-\x1f\x27\x5c]/g;
  /* eslint-enable no-control-regex */

  const keyStrRegExp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

  const strEscape = (str) => {
    if (str.length < 5000 && !strEscapeSequencesRegExp.test(str)) {
      return `'${str}'`;
    }
    return `'${str.replace(strEscapeSequencesReplacer, (s) => meta[s.charCodeAt(0)])}'`;
  };

  const getPrefix = (value) => {
    let tag;
    let ctor;

    for (let i = 0; value; i += 1) {
      if (ctor === undefined) {
        const c = value.constructor;
        if (typeof c === 'function' && c.name !== '') {
          ctor = c.name;
        }
      }
      if (i < 1 && tag === undefined) {
        const t = hasOwnProperty(value, Symbol.toStringTag) && value[Symbol.toStringTag];
        if (typeof t === 'string') {
          tag = t;
        }
      }
      value = Object.getPrototypeOf(value);
    }

    if (typeof ctor !== 'string') {
      ctor = '';
    }
    if (typeof tag !== 'string') {
      tag = '';
    }

    if (ctor !== '') {
      if (tag !== '' && ctor !== tag) {
        return `${ctor} [${tag}] `;
      }
      return `${ctor} `;
    }

    if (tag !== '') {
      return `[${tag}] `;
    }

    return '';
  };

  const inspect = (value, options = {}) => {
    if (!options.ctx) {
      options.ctx = {
        seen: [],
        indent: 1,
      };
    }
    const stylize = options.color !== false ? stylizeWithColor : (v) => v;
    if (value === null) {
      return stylize('null', 'null');
    }
    if (typeof value === 'number') {
      if (Object.is(value, -0)) {
        return stylize('-0', 'number');
      }
      return stylize(`${value}`, 'number');
    }
    if (typeof value === 'bigint') { // eslint-disable-line valid-typeof
      return stylize(`${value}n`, 'bigint');
    }
    if (typeof value === 'symbol') {
      return stylize(value.toString(), 'symbol');
    }
    if (typeof value === 'string') {
      return stylize(strEscape(value), 'string');
    }
    if (typeof value !== 'object' && typeof value !== 'function') {
      return stylize(`${value}`, typeof value);
    }

    if (isRegExp(value)) {
      return stylize(regExpToString(value), 'regexp');
    }

    if (isDate(value)) {
      if (Number.isNaN(value.getTime())) {
        return stylize(value.toString(), 'date');
      }
      return stylize(dateToISOString(value), 'date');
    }

    const proxy = getProxyDetails(value);
    if (proxy !== undefined) {
      return `Proxy [ ${inspect(proxy[0], options)}, ${inspect(proxy[1], options)} ]`;
    }

    const promise = getPromiseDetails(value);
    if (promise !== undefined) {
      const [state, result] = promise;

      if (state === kPending) {
        return 'Promise { <pending> }';
      }

      if (state === kRejected) {
        const r = inspect(result, options).split('\n');
        if (r.length > 1) {
          return `Promise {\n  <rejected> ${r.join('\n  ')} }`;
        }
        return `Promise { <rejected> ${r.join('\n')} }`;
      }
      return `Promise { ${inspect(result, options)} }`;
    }

    if (value[kCustomInspect] !== undefined) {
      const v = value[kCustomInspect](options);
      if (typeof v === 'string') {
        return v;
      }
      return inspect(v, options);
    }

    if (value instanceof Error) {
      return value.stack || `[${errorToString.call(value)}]`;
    }

    const { ctx } = options;

    if (ctx.seen.includes(value)) {
      return stylize('[Circular]', 'special');
    }

    const prefix = getPrefix(value);

    ctx.seen.push(value);

    if (typeof value === 'function') {
      const name = `${prefix.trim() || 'Function'}${value.name ? `: ${value.name}` : ''}`;
      ctx.seen.pop();
      return stylize(`[${name}]`, 'special');
    }

    if (value[Symbol.iterator]) {
      const setish = isSet(value) || isWeakSet(value) || isSetIterator(value);
      const mapish = isMap(value) || isWeakMap(value) || isMapIterator(value);
      const items = setish || mapish ? previewEntries(value).slice(0) : [...value];
      const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
      const start = prefix === 'Array ' ? '' : prefix;
      if (items.length === 0) {
        return `${start}${bracket[0]}${bracket[1]}`;
      }
      const i = mapish ? do {
        const t = items.map(([k, v]) => `${inspect(k, options)} => ${inspect(v, options)}`);
        if (t.length > 3) {
          bracket[1] = '}';
          const indent = '  '.repeat(ctx.indent);
          `\n${indent}${t.join(`,\n${indent}`)}\n`;
        } else {
          bracket[0] = '{ ';
          bracket[1] = ' }';
          t.join(', ');
        }
      } : items.map((v) => inspect(v, options)).join(', ');
      ctx.seen.pop();
      return `${start}${bracket[0]}${i}${bracket[1]}`;
    }

    const keys = [
      ...Object.getOwnPropertyNames(value),
      ...Object.getOwnPropertySymbols(value).filter((s) => propertyIsEnumerable(value, s)),
    ];
    const len = keys.length;
    const out = [];
    const isNs = isModuleNamespaceObject(value);
    for (let i = 0; i < len; i += 1) {
      const key = keys[i];
      let desc;
      if (isNs) {
        try {
          desc = Object.getOwnPropertyDescriptor(value, key);
        } catch (err) {
          if (err instanceof ReferenceError) {
            desc = { uninitialized: true };
          } else {
            throw err;
          }
        }
      } else {
        desc = Object.getOwnPropertyDescriptor(value, key) ||
          { value: value[key], enumerable: true };
      }
      if (desc.enumerable === false) {
        continue;
      }
      const str = do {
        if (desc.uninitialized) {
          stylize('<uninitialized>', 'special');
        } else if (desc.value !== undefined) {
          ctx.indent += 1;
          const r = inspect(desc.value, options);
          ctx.indent -= 1;
          r;
        } else if (desc.get !== undefined) {
          if (desc.set !== undefined) {
            stylize('[Getter/Setter]', 'special');
          } else {
            stylize('[Getter]', 'special');
          }
        } else if (desc.set !== undefined) {
          stylize('[Setter]', 'special');
        } else {
          stylize('undefined', 'undefined');
        }
      };
      const name = do {
        if (typeof key === 'symbol') {
          `[${stylize(key.toString(), 'symbol')}]`;
        } else if (desc.enumerable === false) {
          `[${key}]`;
        } else if (keyStrRegExp.test(key)) {
          stylize(key, 'name');
        } else {
          stylize(strEscape(key), 'string');
        }
      };

      out.push(`${name}: ${str}`);
    }

    ctx.seen.pop();

    const start = prefix === 'Object ' ? '' : prefix;

    if (out.length === 0) {
      return `${start}{}`;
    }

    const long = out.length > 4;
    const sep = long ? `\n${'  '.repeat(ctx.indent)}` : ' ';
    return `${start}{ ${out.join(`,${sep}`)} }`;
  };

  namespace.inspect = inspect;
  namespace.format = (options, ...args) => {
    if (typeof args[0] === 'string') {
      if (args.length === 1) {
        return args[0];
      }

      return args.map((a, i) => (i === 0 ? a : inspect(a, options))).join(' ');
    }

    return args.map((a) => inspect(a, options)).join(' ');
  };
};
