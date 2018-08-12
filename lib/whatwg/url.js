'use strict';

// https://github.com/nodejs/node/blob/master/lib/internal/url.js
// https://github.com/nodejs/node/blob/master/lib/internal/querystring.js
// https://github.com/jsdom/url/{src,lib}/*

({ namespace, load, PrivateSymbol: PS, kCustomInspect }) => {
  const { defineIDLClass, uuid4122, base64decode } = load('util');
  const { MIME } = load('mime');
  const {
    basicURLParse: _basicURLParse,
    STATE_PATH_START,
    STATE_FRAGMENT,
    STATE_PORT,
    STATE_SCHEME_START,
    STATE_AUTHORITY,
    STATE_HOST,
    STATE_HOSTNAME,
  } = load('whatwg/url/parser');

  const kList = PS('kList');
  const kURLObject = PS('kURLObject');
  const kContext = PS('kContext');
  const kURL = PS('kURL');
  const kQuery = PS('kQuery');

  const basicURLParse = (...args) => {
    const url = _basicURLParse(...args);
    if (url.failed) {
      throw new TypeError('Invalid URL');
    }
    return url;
  };

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

  defineIDLClass(URLSearchParams, undefined, {
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
      if (!remove) {
        this[kList].push([name, value]);
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

    [Symbol.iterator]() {
      return createSearchParamsIterator(this, IT_KIND_ENTRIES);
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

  const findLongestZeroSequence = (arr) => {
    let maxIdx = null;
    let maxLen = 1; // only find elements > 1
    let currStart = null;
    let currLen = 0;

    for (let i = 0; i < arr.length; i += 1) {
      if (arr[i] !== 0) {
        if (currLen > maxLen) {
          maxIdx = currStart;
          maxLen = currLen;
        }

        currStart = null;
        currLen = 0;
      } else {
        if (currStart === null) {
          currStart = i;
        }
        currLen += 1;
      }
    }

    // if trailing zeros
    if (currLen > maxLen) {
      maxIdx = currStart;
      maxLen = currLen;
    }

    return {
      idx: maxIdx,
      len: maxLen,
    };
  };

  const serializeURLHost = (host) => {
    if (typeof host === 'number') {
      let output = '';
      let n = host;

      for (let i = 1; i <= 4; i += 1) {
        output = String(n % 256) + output;
        if (i !== 4) {
          output = `.${output}`;
        }
        n = Math.floor(n / 256);
      }

      return output;
    }

    if (Array.isArray(host)) {
      let output = '';
      const seqResult = findLongestZeroSequence(host);
      const compress = seqResult.idx;
      let ignore0 = false;

      for (let pieceIndex = 0; pieceIndex <= 7; pieceIndex += 1) {
        if (ignore0 && host[pieceIndex] === 0) {
          continue;
        } else if (ignore0) {
          ignore0 = false;
        }

        if (compress === pieceIndex) {
          const separator = pieceIndex === 0 ? '::' : ':';
          output += separator;
          ignore0 = true;
          continue;
        }

        output += host[pieceIndex].toString(16);

        if (pieceIndex !== 7) {
          output += ':';
        }
      }

      return `[${output}]`;
    }

    return host;
  };

  const serializeURLPath = (url) => {
    if (url.cannotBeBase) {
      return url.path[0];
    }
    if (url.path.length === 0) {
      return '';
    }
    return `/${url.path.join('/')}`;
  };

  const serializeURL = (url, {
    fragment = true,
    search = true,
    auth = true,
  } = {}) => {
    let ret = url.scheme;
    if (url.host) {
      ret += '//';
      const hasUsername = !!url.username;
      const hasPassword = !!url.password;
      if (auth && (hasUsername || hasPassword)) {
        if (hasUsername) {
          ret += url.username;
        }
        if (hasPassword) {
          ret += `:${url.password}`;
        }
        ret += '@';
      }
      ret += serializeURLHost(url.host);
      if (!url.isDefaultSchemePort && url.port !== null) {
        ret += `:${url.port}`;
      }
    } else if (url.scheme === 'file:') {
      ret += '//';
    }
    ret += serializeURLPath(url);

    if (search && url.query) {
      ret += `?${url.query}`;
    }

    if (fragment && url.fragment) {
      ret += `#${url.fragment}`;
    }

    return ret;
  };

  const blobURLStore = new Map();

  class URL {
    constructor(url, base) {
      url = `${url}`;

      let parsedBase = null;
      if (base !== undefined) {
        base = `${base}`;
        parsedBase = basicURLParse(base);
      }

      const parsedURL = basicURLParse(url, parsedBase);

      const query = parsedURL.query !== null ? parsedURL.query : '';

      this[kURL] = parsedURL;
      this[kQuery] = new URLSearchParams(query);
      this[kQuery][kURLObject] = this;

      this[kCustomInspect] = () => ({
        __proto__: URL.prototype,
        href: this.href,
        origin: this.origin,
        protocol: this.protocol,
        username: this.username,
        password: this.password,
        host: this.host,
        hostname: this.hostname,
        port: this.port,
        pathname: this.pathname,
        search: this.search,
        hash: this.hash,
      });
    }


    // https://w3c.github.io/FileAPI/#creating-revoking
    static createObjectURL(blob) {
      const { Blob } = load('w3/blob');
      if (!(blob instanceof Blob)) {
        throw new TypeError('blob is not a Blob');
      }
      const url = `blob:${uuid4122()}`;
      blobURLStore.set(url, blob);
      return url;
    }

    static revokeObjectURL(url) {
      const record = basicURLParse(url);
      if (record.scheme !== 'blob') {
        return;
      }
      blobURLStore.remove(url);
    }
  }

  namespace.resolveBlobURL = (url) => {
    if (typeof url === 'string') {
      url = new URL(url);
    }

    if (url.protocol !== 'blob:') {
      throw new TypeError('URL must have "blob:" scheme');
    }

    const string = serializeURL(url, { fragment: false });
    if (blobURLStore.has(string)) {
      return blobURLStore.get(string);
    }

    throw new Error('invalid url');
  };

  const kCannotHaveUsernamePasswordPort = PS('kCannotHaveUsernamePasswordPort');
  const OPAQUE_ORIGIN = '';

  defineIDLClass(URL, undefined, {
    get [kCannotHaveUsernamePasswordPort]() {
      const { host, scheme, cannotBeBase } = this[kURL];
      return ((host == null || host === '') ||
              cannotBeBase ||
              scheme === 'file:');
    },

    get href() {
      return serializeURL(this[kURL]);
    },

    set href(v) {
      const parsed = basicURLParse(v);
      this[kURL] = parsed;
    },

    get origin() {
      const { scheme, path, host, port } = this[kURL];
      switch (scheme) {
        case 'blob:':
          if (path.length > 0) {
            try {
              return (new URL(path[0])).origin;
            } catch (err) {
              // fall through... do nothing
            }
          }
          return OPAQUE_ORIGIN;
        case 'ftp:':
        case 'gopher:':
        case 'http:':
        case 'https:':
        case 'ws:':
        case 'wss:':
          return `${scheme}//${host}${port === null ? '' : `:${port}`}`;
        default:
          return OPAQUE_ORIGIN;
      }
    },

    get protocol() {
      return this[kURL].scheme;
    },
    set protocol(scheme) {
      scheme = `${scheme}`;
      if (scheme.length === 0) {
        return;
      }
      const url = this[kURL];
      if (url.scheme === 'file:' &&
          (url.host === '' || url.host === null)) {
        return;
      }

      url.scheme = basicURLParse(scheme, undefined, STATE_SCHEME_START).scheme;
    },

    get username() {
      return this[kURL].username;
    },
    set username(username) {
      username = `${username}`;
      if (this[kCannotHaveUsernamePasswordPort]) {
        return;
      }
      const url = this[kURL];
      if (username === '') {
        url.username = '';
        return;
      }
      url.username = basicURLParse(username, undefined, STATE_AUTHORITY).username;
    },

    get password() {
      return this[kURL].password;
    },
    set password(password) {
      password = `${password}`;
      if (this[kCannotHaveUsernamePasswordPort]) {
        return;
      }
      const url = this[kURL];
      if (password === '') {
        url.password = '';
        return;
      }
      url.password = basicURLParse(password, undefined, STATE_AUTHORITY).password;
    },

    get host() {
      const { host, port } = this[kURL];
      const ret = host || '';
      if (port !== null) {
        return `${ret}:${port}`;
      }
      return ret;
    },
    set host(host) {
      host = `${host}`;
      const url = this[kURL];
      if (url.cannotBeBase) {
        return;
      }
      url.host = basicURLParse(host, undefined, STATE_HOST).host;
    },

    get hostname() {
      return this[kURL].host || '';
    },
    set hostname(hostname) {
      hostname = `${hostname}`;
      const url = this[kURL];
      if (url.cannotBeBase) {
        return;
      }
      url.host = basicURLParse(hostname, undefined, STATE_HOSTNAME).host;
    },

    get port() {
      const { port } = this[kURL];
      return port === null ? '' : `${port}`;
    },
    set port(port) {
      port = `${port}`;
      const url = this[kURL];
      if (this[kCannotHaveUsernamePasswordPort]) {
        return;
      }
      if (port === '') {
        url.port = null;
      }
      url.port = basicURLParse(port, undefined, STATE_PORT).port;
    },

    get pathname() {
      return serializeURLPath(this[kURL]);
    },
    set pathname(path) {
      path = `${path}`;
      const url = this[kURL];
      if (url.cannotBeBase) {
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
        this[kQuery][kList] = [];
      } else {
        if (v[0] === '?') {
          v = v.slice(1);
        }
        url.query = '';
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
        return;
      }
      if (v[0] === '#') {
        v = v.slice(1);
      }
      url.fragment = basicURLParse(v, undefined, STATE_FRAGMENT).fragment;
    },

    toString() {
      return serializeURL(this[kURL]);
    },

    toJSON() {
      return serializeURL(this[kURL]);
    },
  });

  namespace.getURLFromFilePath = (filepath) => {
    const tmp = new URL('file://');
    if (filepath.includes('%')) {
      filepath = filepath.replace(/%/g, '%25');
    }
    tmp.pathname = filepath;
    return tmp;
  };

  namespace.getFilePathFromURL = (url) => {
    if (typeof url === 'string') {
      url = new URL(url);
    }

    if (url.protocol !== 'file:') {
      throw new Error('not a file scheme');
    }

    const { pathname } = url;
    for (let n = 0; n < pathname.length; n += 1) {
      if (pathname[n] === '%') {
        const third = pathname.codePointAt(n + 2) | 0x20;
        if (pathname[n + 1] === '2' && third === 102) {
          throw new Error('path includes encoded "/" characters');
        }
      }
    }
    return decodeURIComponent(pathname);
  };

  namespace.parseDataURL = (url) => {
    const input = `${url}`.substring('data:'.length);
    let position = 0;

    let mimeType = '';
    while (position < input.length && input[position] !== ',') {
      mimeType += input[position];
      position += 1;
    }

    // cut off ","
    position += 1;

    mimeType = mimeType.replace(/^[ \t\n\f\r]+/, '').replace(/[ \t\n\f\r]+$/, '');

    if (position === input.length) {
      return null;
    }

    const encodedBody = input.substring(position);
    let body = decodeURIComponent(encodedBody);

    const mimeTypeBase64MatchResult = /(.*); *[Bb][Aa][Ss][Ee]64$/.exec(mimeType);
    if (mimeTypeBase64MatchResult) {
      body = base64decode(body);

      if (body === null) {
        return null;
      }

      [mimeType] = mimeTypeBase64MatchResult;
    }

    if (mimeType.startsWith(';')) {
      mimeType = `text/plain${mimeType}`;
    }

    let mimeTypeRecord;
    try {
      mimeTypeRecord = new MIME(mimeType);
    } catch (e) {
      mimeTypeRecord = new MIME('text/plain;charset=US-ASCII');
    }

    return {
      mimeType: mimeTypeRecord,
      body,
    };
  };

  namespace.URL = URL;
  namespace.URLSearchParams = URLSearchParams;
};
