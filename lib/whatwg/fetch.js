'use strict';

// https://github.com/bitinn/node-fetch

({ namespace, load, PrivateSymbol: PS }) => {
  const kHeaders = PS();
  const kContext = PS();

  const invalidTokenRegex = /[^^_`a-zA-Z\-0-9!#$%&'*+.|~]/;
  const invalidHeaderCharRegex = /[^\t\x20-\x7e\x80-\xff]/;

  function validateHeaderName(name) {
    name = `${name}`;
    if (invalidTokenRegex.test(name)) {
      throw new TypeError(`${name} is not a legal HTTP header name`);
    }
  }

  function validateHeaderValue(value) {
    value = `${value}`;
    if (invalidHeaderCharRegex.test(value)) {
      throw new TypeError(`${value} is not a legal HTTP header value`);
    }
  }

  function find(map, name) {
    name = name.toLowerCase();
    for (const key in map) {
      if (key.toLowerCase() === name) {
        return key;
      }
    }
    return undefined;
  }

  function getHeaderList(headers) {
    const keys = Object.keys(headers[kHeaders]).sort();
    return keys.map((k) => [k.toLowerCase(), headers[kHeaders][k].join(', ')]);
  }

  const IT_KIND_KEYS = 0;
  const IT_KIND_VALUES = 1;
  const IT_KIND_ENTRIES = 2;

  const HeadersIteratorPrototype = Object.setPrototypeOf({
    [kContext]: undefined,
    next() {
      const { index, target, kind } = this[kContext];
      const pairs = getHeaderList(target);

      if (index >= pairs.length) {
        return {
          value: undefined,
          done: true,
        };
      }

      this[kContext].index = index + 1;

      if (kind === IT_KIND_KEYS) {
        return {
          value: pairs[index][0],
          done: false,
        };
      }

      if (kind === IT_KIND_VALUES) {
        return {
          value: pairs[index].slice(1),
          done: false,
        };
      }

      if (kind === IT_KIND_ENTRIES) {
        return {
          value: pairs[index],
          done: false,
        };
      }
    },
  }, Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));

  Object.defineProperty(HeadersIteratorPrototype, Symbol.toStringTag, {
    value: 'HeadersIterator',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  const createHeadersIterator = (headers, kind) => {
    const iterator = Object.create(HeadersIteratorPrototype);
    iterator[kContext] = {
      index: 0,
      kind,
      target: headers,
    };
    return iterator;
  };

  class Headers {
    constructor(init = undefined) {
      this[kHeaders] = Object.create(null);

      if (init instanceof Headers) {
        for (const key of Object.keys(init[kHeaders])) {
          this[kHeaders][key] = init[kHeaders][key].slice(0);
        }
      } else if (typeof init === 'object') {
        const method = init[Symbol.iterator];
        this[kHeaders] = [];
        if (method != null) {
          if (typeof method !== 'function') {
            throw new TypeError('Header pairs must be iterable');
          }

          const pairs = [];
          for (const pair of init) {
            if (typeof pair !== 'object' || typeof pair[Symbol.iterator] !== 'function') {
              throw new TypeError('Each header pair must be iterable');
            }
            pairs.push(Array.from(pair));
          }
          for (const pair of pairs) {
            if (pair.length !== 2) {
              throw new TypeError('Each header pair must be a name/value tuple');
            }
            this.append(pair[0], pair[1]);
          }
        } else {
          for (const key of Object.keys(init)) {
            const value = init[key];
            this.append(key, value);
          }
        }
      } else if (init != null) {
        throw new TypeError('Provided initializer must be an object');
      }
    }

    get(name) {
      name = `${name}`;
      validateHeaderName(name);
      const key = find(this[kHeaders], name);
      if (key === undefined) {
        return null;
      }
      return this[kHeaders][key].join(', ');
    }

    set(name, value) {
      name = `${name}`;
      value = `${value}`;
      validateHeaderName(name);
      validateHeaderValue(value);
      const key = find(this[kHeaders], name);
      this[kHeaders][key !== undefined ? key : name] = [value];
    }

    append(name, value) {
      name = `${name}`;
      value = `${value}`;
      validateHeaderName(name);
      validateHeaderValue(value);
      const key = find(this[kHeaders], name);
      if (key !== undefined) {
        this[kHeaders][key].push(value);
      } else {
        this[kHeaders][name] = [value];
      }
    }

    has(name) {
      name = `${name}`;
      validateHeaderName(name);
      return find(this[kHeaders], name) !== undefined;
    }

    delete(name) {
      name = `${name}`;
      validateHeaderName(name);
      const key = find(this[kHeaders], name);
      if (key !== undefined) {
        delete this[kHeaders][key];
      }
    }

    forEach(callback, thisArg = undefined) {
      for (const [key, ...values] of createHeadersIterator(this, IT_KIND_ENTRIES)) {
        Reflect.apply(callback, thisArg, [values.join(', '), key]);
      }
    }

    keys() {
      return createHeadersIterator(this, IT_KIND_KEYS);
    }

    values() {
      return createHeadersIterator(this, IT_KIND_VALUES);
    }

    entries() {
      return createHeadersIterator(this, IT_KIND_ENTRIES);
    }
  }

  Headers.prototype[Symbol.iterator] = Headers.prototype.entries;

  Object.defineProperties(Headers.prototype, {
    get: { enumerable: true },
    set: { enumerable: true },
    append: { enumerable: true },
    has: { enumerable: true },
    delete: { enumerable: true },
    forEach: { enumerable: true },
    keys: { enumerable: true },
    values: { enumerable: true },
    entries: { enumerable: true },
    [Symbol.toStringTag]: {
      value: 'Headers',
      writable: false,
      enumerable: false,
      configurable: true,
    },
  });

  namespace.Headers = Headers;
};
