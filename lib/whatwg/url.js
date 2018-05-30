'use strict';

// https://github.com/nodejs/node/blob/master/lib/internal/url.js
// https://github.com/nodejs/node/blob/master/lib/internal/querystring.js
// https://github.com/jsdom/url/{src,lib}/*

({ namespace, load, PrivateSymbol: PS }) => {
  const { defineIDLClass } = load('util');
  const {
    basicURLParse,
    FLAG_FAILED,
    FLAG_HAS_HOST,
    FLAG_HAS_USERNAME,
    FLAG_HAS_PASSWORD,
    FLAG_HAS_QUERY,
    FLAG_HAS_FRAGMENT,
    FLAG_CANNOT_BE_BASE,
    FLAG_IS_DEFAULT_SCHEME_PORT,
    STATE_PATH_START,
    STATE_FRAGMENT,
    STATE_PORT,
  } = load('whatwg/url/parser');

  const kList = PS();
  const kURLObject = PS();
  const kContext = PS();
  const kURL = PS();
  const kQuery = PS();

  function encodeStr(str, noEscapeTable, hexTable) {
    const len = str.length;
    if (len === 0) {
      return '';
    }

    let out = '';
    let lastPos = 0;

    for (let i = 0; i < len; i += 1) {
      let c = str.charCodeAt(i);

      // ASCII
      if (c < 0x80) {
        if (noEscapeTable[c] === 1) {
          continue;
        }
        if (lastPos < i) {
          out += str.slice(lastPos, i);
        }
        lastPos = i + 1;
        out += hexTable[c];
        continue;
      }

      if (lastPos < i) {
        out += str.slice(lastPos, i);
      }

      // Multi-byte characters ...
      if (c < 0x800) {
        lastPos = i + 1;
        out += hexTable[0xC0 | (c >> 6)] +
             hexTable[0x80 | (c & 0x3F)];
        continue;
      }
      if (c < 0xD800 || c >= 0xE000) {
        lastPos = i + 1;
        out += hexTable[0xE0 | (c >> 12)] +
             hexTable[0x80 | ((c >> 6) & 0x3F)] +
             hexTable[0x80 | (c & 0x3F)];
        continue;
      }
      // Surrogate pair
      i += 1;
      let c2;
      if (i < len) {
        c2 = str.charCodeAt(i) & 0x3FF;
      } else {
        // This branch should never happen because all URLSearchParams entries
        // should already be converted to USVString. But, included for
        // completion's sake anyway.
        c2 = 0;
      }
      lastPos = i + 1;
      c = 0x10000 + (((c & 0x3FF) << 10) | c2);
      out += hexTable[0xF0 | (c >> 18)] +
           hexTable[0x80 | ((c >> 12) & 0x3F)] +
           hexTable[0x80 | ((c >> 6) & 0x3F)] +
           hexTable[0x80 | (c & 0x3F)];
    }
    if (lastPos === 0) {
      return str;
    }
    if (lastPos < len) {
      return out + str.slice(lastPos);
    }
    return out;
  }

  const hexTable = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    hexTable[i] = `%${i < 16 ? '0' : ''}${i.toString(16)}`.toUpperCase();
  }
  // https://url.spec.whatwg.org/#concept-urlencoded-byte-serializer
  const noEscape = [
  /*
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, A, B, C, D, E, F */
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x00 - 0x0F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x10 - 0x1F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, // 0x20 - 0x2F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 0x30 - 0x3F
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 0x40 - 0x4F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, // 0x50 - 0x5F
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 0x60 - 0x6F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, // 0x70 - 0x7F
  ];

  // Special version of hexTable that uses `+` for U+0020 SPACE.
  const paramHexTable = hexTable.slice();
  paramHexTable[0x20] = '+';
  const plusRegex = /\+/g;

  // https://url.spec.whatwg.org/#concept-urlencoded-parser
  const parseParams = (input) => {
    const sequences = input.split('&');
    const output = [];
    for (const bytes of sequences) {
      if (bytes === '') {
        continue;
      }
      let name;
      let value;
      if (/=/.test(bytes)) {
        [name, value] = bytes.split('=');
      } else {
        name = bytes;
        value = '';
      }
      name = name.replace(plusRegex, ' ');
      value = value.replace(plusRegex, ' ');

      // TODO(devsnek): needs working TextDecoder
      const nameString = decodeURIComponent(name);
      const valueString = decodeURIComponent(value);

      output.push([nameString, valueString]);
    }
    return output;
  };


  const serializeSearchParams = (searchParams) => {
    const list = searchParams[kList];
    const len = list.length;
    if (len === 0) {
      return '';
    }

    let output = '';
    list.forEach(([k, v], i) => {
      const encodedParam = encodeStr(k, noEscape, paramHexTable);
      const encodedValue = encodeStr(v, noEscape, paramHexTable);
      output += `${i === 0 ? '' : '&'}${encodedParam}=${encodedValue}`;
    });

    return output;
  };

  const updateSearchParams = (searchParams) => {
    if (searchParams[kURLObject] === null) {
      return;
    }
    const query = serializeSearchParams(searchParams);
    searchParams[kURLObject][kURL].query = query;
  };

  const IT_KIND_KEYS = 0;
  const IT_KIND_VALUES = 1;
  const IT_KIND_ENTRIES = 2;
  const URLSearchParamsIteratorPrototype = Object.setPrototypeOf({
    [kContext]: undefined,
    next() {
      const { index, target, kind } = this[kContext];
      if (index >= target.length) {
        return {
          value: undefined,
          done: true,
        };
      }

      this[kContext].index = index + 1;
      if (kind === IT_KIND_KEYS) {
        return {
          value: target[index][0],
          done: false,
        };
      }

      if (kind === IT_KIND_VALUES) {
        return {
          value: target[index][1],
          done: false,
        };
      }

      if (kind === IT_KIND_ENTRIES) {
        return {
          value: target[index],
          done: false,
        };
      }
    },
  }, Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));

  Object.defineProperty(URLSearchParamsIteratorPrototype, Symbol.toStringTag, {
    value: 'URLSearchParamsIterator',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  const createSearchParamsIterator = (searchParams, kind) => {
    const iterator = Object.create(URLSearchParamsIteratorPrototype);
    iterator[kContext] = {
      index: 0,
      kind,
      target: searchParams[kList],
    };
    return iterator;
  };

  class URLSearchParams {
    constructor(init = '') {
      this[kList] = [];
      this[kURLObject] = null;

      if (typeof init === 'object') {
        const method = init[Symbol.iterator];
        if (method != null) {
          if (typeof method !== 'function') {
            throw new TypeError('Query pairs must be iterable');
          }
          const pairs = [];
          for (const pair of init) {
            if (typeof pair !== 'object' || typeof pair[Symbol.iterator] !== 'function') {
              throw new TypeError('Each qury pair must be iterable');
            }
            pairs.push(Array.from(pair));
          }
          for (const pair of pairs) {
            if (pair.length !== 2) {
              throw new TypeError('Each query pair must be a name/value tuple');
            }
            this.append(pair[0], pair[1]);
          }
        } else {
          for (const [key, value] of Object.entries(init)) {
            this.append(key, value);
          }
        }
      } else if (typeof init === 'string') {
        if (init[0] === '?') {
          init = init.slice(1);
        }
        this[kList] = parseParams(init);
      } else if (init != null) {
        throw new TypeError('Provided initializer must be an object');
      }
    }
  }

  defineIDLClass(URLSearchParams, 'URLSearchParams', {
    append(name, value) {
      name = `${name}`;
      value = `${value}`;
      this[kList].push([name, value]);
      updateSearchParams(this);
    },

    delete(name) {
      name = `${name}`;
      this[kList] = this[kList].filter(([n]) => n !== name);
      updateSearchParams(this);
    },

    get(name) {
      name = `${name}`;
      const find = this[kList].find(([n]) => n === name);
      if (find !== undefined) {
        return find[1];
      }
      return null;
    },

    getAll(name) {
      name = `${name}`;
      const out = [];
      this[kList].forEach(([k, v]) => {
        if (k === name) {
          out.push(v);
        }
      });
      return out;
    },

    has(name) {
      name = `${name}`;
      return this[kList].some(([n]) => name === n);
    },

    set(name, value) {
      name = `${name}`;
      value = `${value}`;
      let remove = false;
      if (this[kList].length === 0) {
        this[kList].push(name, value);
      } else {
        this[kList].forEach(([n], i) => {
          if (n !== name) {
            return;
          }
          if (remove) {
            this[kList].splice(i, 1);
          } else {
            remove = true;
            this[kList][i][1] = value;
          }
        });
      }
      updateSearchParams(this);
    },

    sort() {
      this[kList].sort((a, b) => a[0].localeCompare(b[0]));
      updateSearchParams(this);
    },

    entries() {
      return createSearchParamsIterator(this, IT_KIND_ENTRIES);
    },

    keys() {
      return createSearchParamsIterator(this, IT_KIND_KEYS);
    },

    values() {
      return createSearchParamsIterator(this, IT_KIND_VALUES);
    },

    forEach(callback, thisArg = undefined) {
      for (const [key, ...values] of createSearchParamsIterator(this, IT_KIND_ENTRIES)) {
        Reflect.apply(callback, thisArg, [values.join(', '), key]);
      }
    },

    toString() {
      return serializeSearchParams(this);
    },
  });

  const domainToUnicode = (d) => d;

  const serializeURLPath = (url) => {
    if (url.flags & FLAG_CANNOT_BE_BASE) {
      return url.path[0];
    }
    if (url.path.length === 0) {
      return '';
    }
    return `/${url.path.join('/')}`;
  };

  const serializeURL = (url, {
    fragment = true,
    unicode = false,
    search = true,
    auth = true,
  } = {}) => {
    let ret = url.scheme;
    if (url.flags & FLAG_HAS_HOST) {
      ret += '//';
      const hasUsername = url.flags & FLAG_HAS_USERNAME;
      const hasPassword = url.flags & FLAG_HAS_PASSWORD;
      if (auth && (hasUsername || hasPassword)) {
        if (hasUsername) {
          ret += url.username;
        }
        if (hasPassword) {
          ret += `:${url.password}`;
        }
        ret += '@';
      }
      ret += unicode ? domainToUnicode(url.host) : url.host;
      if (!(url.flags & FLAG_IS_DEFAULT_SCHEME_PORT) && url.port !== null) {
        ret += `:${url.port}`;
      }
    } else if (url.scheme === 'file:') {
      ret += '//';
    }
    ret += serializeURLPath(url);

    if (search && (url.flags & FLAG_HAS_QUERY)) {
      ret += `?${url.query}`;
    }

    if (fragment && (url.flags & FLAG_HAS_FRAGMENT)) {
      ret += `#${url.fragment}`;
    }

    return ret;
  };

  class URL {
    constructor(url, base) {
      let parsedBase = null;
      if (base !== undefined) {
        parsedBase = basicURLParse(base);
        if (parsedBase.flags & FLAG_FAILED) {
          throw new TypeError('Invalid base URL');
        }
      }

      const parsedURL = basicURLParse(url, parsedBase);
      if (parsedURL.flags & FLAG_FAILED) {
        throw new TypeError('Invalid URL');
      }

      const query = parsedURL.query !== null ? parsedURL.query : '';

      this[kURL] = parsedURL;
      this[kQuery] = new URLSearchParams(query);
      this[kQuery][kURLObject] = this;
    }
  }

  const kCannotHaveUsernamePasswordPort = PS();

  defineIDLClass(URL, 'URL', {
    get [kCannotHaveUsernamePasswordPort]() {
      const { host, scheme, flags } = this[kURL];
      return ((host == null || host === '') ||
              flags & FLAG_CANNOT_BE_BASE ||
              scheme === 'file:');
    },

    get href() {
      return serializeURL(this[kURL]);
    },

    set href(v) {
      const parsed = basicURLParse(v);
      if (parsed.flags & FLAG_FAILED) {
        throw new TypeError('Invalid URL');
      }
      this[kURL] = parsed;
    },

    get port() {
      const { port } = this[kURL];
      return port === null ? '' : `${port}`;
    },

    set port(v) {
      v = `${v}`;
      const url = this[kURL];
      if (this[kCannotHaveUsernamePasswordPort]) {
        return;
      }
      if (v === '') {
        url.port = null;
      }
      url.port = basicURLParse(v, undefined, STATE_PORT).port;
    },

    get pathname() {
      return serializeURLPath(this[kURL]);
    },

    set pathname(path) {
      path = `${path}`;
      const url = this[kURL];
      if (url.flags & FLAG_CANNOT_BE_BASE) {
        return;
      }
      url.path = basicURLParse(path, undefined, STATE_PATH_START).path;
    },

    get search() {
      const { query } = this[kURL];
      if (query === null || query === '') {
        return '';
      }
      return `?${query}`;
    },

    set search(v) {
      const url = this[kURL];
      v = `${v}`;
      if (v === '') {
        url.query = null;
        url.flags &= ~FLAG_HAS_QUERY;
        this[kQuery][kList] = [];
      } else {
        if (v[0] === '?') {
          v = v.slice(1);
        }
        url.query = '';
        url.flags |= FLAG_HAS_QUERY;
        this[kQuery][kList] = parseParams(v);
      }
    },

    get searchParams() {
      return this[kQuery];
    },

    get hash() {
      const { fragment } = this[kURL];
      if (fragment === null || fragment === '') {
        return '';
      }
      return `#${fragment}`;
    },

    set hash(v) {
      const url = this[kURL];
      v = `${v}`;
      if (!v) {
        url.fragment = null;
        url.flags &= ~FLAG_HAS_FRAGMENT;
        return;
      }
      if (v[0] === '#') {
        v = v.slice(1);
      }
      url.fragment = basicURLParse(v, undefined, STATE_FRAGMENT).fragment;
      url.flags |= FLAG_HAS_FRAGMENT;
    },

    toString() {
      return serializeURL(this[kURL]);
    },

    toJSON() {
      return serializeURL(this[kURL]);
    },
  });

  namespace.URL = URL;
  namespace.URLSearchParams = URLSearchParams;
};
