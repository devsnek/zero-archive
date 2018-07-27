'use strict';

// https://github.com/bitinn/node-fetch

({ namespace, load, process, kCustomInspect, PrivateSymbol: PS }) => {
  const { defineIDLClass, PromiseCreate, PromiseReject } = load('util');
  const {
    ReadableStream,
    CreateReadableStream,
    ReadableStreamDefaultControllerEnqueue,
    kReadableStreamController,
  } = load('whatwg/streams/readable');
  const { URLSearchParams, URL, getURLFromFilePath } = load('whatwg/url');
  const { Blob } = load('w3/blob');

  const kHeaders = PS('kHeaders');
  const kContext = PS('kContext');
  const kGuard = PS('kGuard');
  const kStatus = PS('kStatus');
  const kStatusMessage = PS('kStatusMessage');
  const kSignal = PS('kSignal');
  const kURLList = PS('kURLList');
  const kMethod = PS('kMethod');
  const kUnsafeRequest = PS('kUnsafeRequest');
  const kClient = PS('kClient');
  const kWindow = PS('kWindow');
  const kOrigin = PS('kOrigin');
  const kReferrer = PS('kReferrer');
  const kReferrerPolicy = PS('kReferrerPolicy');
  const kMode = PS('kMode');
  const kCredentialsMode = PS('kCredentialsMode');
  const kCacheMode = PS('kCacheMode');
  const kRedirectMode = PS('kRedirectMode');
  const kIntegrityMetadata = PS('kIntegrityMetadata');
  const kKeepAlive = PS('kKeepAlive');
  const kReloadNavigation = PS('kReloadNavigation');
  const kHistoryNavigation = PS('kHistoryNavigation');
  const kLocked = PS('kLocked');
  const kEntryList = PS('kEntryList');
  const kType = PS('kType');

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
    constructor(init = undefined, opt = {}) {
      this[kHeaders] = Object.create(null);
      this[kGuard] = opt[kGuard] || 'none';

      if (init instanceof Headers) {
        for (const key of Object.keys(init[kHeaders])) {
          this[kHeaders][key] = init[kHeaders][key].slice(0);
        }
      } else if (typeof init === 'object') {
        const method = init[Symbol.iterator];
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
  }

  defineIDLClass(Headers, 'Headers', {
    get(name) {
      name = `${name}`;
      validateHeaderName(name);
      const key = find(this[kHeaders], name);
      if (key === undefined) {
        return null;
      }
      return this[kHeaders][key].join(', ');
    },

    set(name, value) {
      name = `${name}`;
      value = `${value}`;
      validateHeaderName(name);
      validateHeaderValue(value);
      const key = find(this[kHeaders], name);
      this[kHeaders][key !== undefined ? key : name] = [value];
    },

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
    },

    has(name) {
      name = `${name}`;
      validateHeaderName(name);
      return find(this[kHeaders], name) !== undefined;
    },

    delete(name) {
      name = `${name}`;
      validateHeaderName(name);
      const key = find(this[kHeaders], name);
      if (key !== undefined) {
        delete this[kHeaders][key];
      }
    },

    forEach(callback, thisArg = undefined) {
      for (const [key, ...values] of createHeadersIterator(this, IT_KIND_ENTRIES)) {
        Reflect.apply(callback, thisArg, [values.join(', '), key]);
      }
    },

    keys() {
      return createHeadersIterator(this, IT_KIND_KEYS);
    },

    values() {
      return createHeadersIterator(this, IT_KIND_VALUES);
    },

    entries() {
      return createHeadersIterator(this, IT_KIND_ENTRIES);
    },
  });

  Headers.prototype[kCustomInspect] = function CustomInspect() {
    return this.entries();
  };

  Headers.prototype[Symbol.iterator] = Headers.prototype.entries;

  const Enqueue = (stream, chunk) => {
    ReadableStreamDefaultControllerEnqueue(stream[kReadableStreamController], chunk);
  };

  class File {}

  class Entry {
    constructor(name, value, filename) {
      this.name = name;
      if (value instanceof Blob) {
        value = new File('blob', value);
      }
      if (filename) {
        value = new File(filename, value);
      }
      this.value = value;
    }
  }

  class FormData {
    constructor() {
      this[kEntryList] = Object.create(null);
    }
  }

  defineIDLClass(FormData, undefined, {
    append(name, value, filename) {
      const entry = new Entry(name, value, filename);
      if (name in this[kEntryList]) {
        this[kEntryList][name].push(entry);
      } else {
        this[kEntryList][name] = [entry];
      }
    },
    delete(name) {
      delete this[kEntryList][name];
    },
    get(name) {
      if (name in this[kEntryList]) {
        return this[kEntryList][name][0];
      }
      return undefined;
    },
    getAll(name) {
      return this[kEntryList][name] || [];
    },
    has(name) {
      return name in this[kEntryList];
    },
    set(name, value, filename) {
      const entry = new Entry(name, value, filename);
      this[kEntryList][name] = [entry];
    },
  });

  const kDisturbed = PS('kDisturbed');
  const kContentType = PS('kContentType');
  const kAction = PS('kAction');
  const kStream = PS('kStream');
  class Body {
    constructor(body) {
      let stream = body === null ? null : CreateReadableStream();
      let contentType = null;
      let action = null;
      let source = null;

      if (body === null) {
        // stream = null;
      } else if (body instanceof Body) {
        // Set action to an action that reads body
        // If body’s type attribute is not the empty byte sequence, set contentType to its value
        source = body;
      } else if (ArrayBuffer.isView(body)) {
        Enqueue(stream, body);
        source = body;
      } else if (body instanceof FormData) {
        // AAAAAAA
      } else if (body instanceof URLSearchParams) {
        action = () => {
          // runs the application/x-www-form-urlencoded serializer with object’s list.
        };
        contentType = 'application/x-www-form-urlencoded;charset=UTF-8';
        source = body;
      } else if (typeof body === 'string') {
        action = () => {
          // runs UTF-8 encode on object.
        };
        contentType = 'text/plain;charset=UTF-8';
        source = body;
      } else if (body instanceof ReadableStream) {
        stream = body;
      }

      this[kDisturbed] = false;
      this[kStream] = stream || source;
      this[kContentType] = contentType;
      this[kAction] = action;
    }
  }

  const GetReader = () => 0;

  const consumeBody = (body, type) => {
    if (body[kDisturbed]) {
      throw new TypeError();
    }

    const stream = body[kStream] || CreateReadableStream(type);
    const reader = GetReader(stream);
    const promise = [...reader];
    return promise;
  };

  defineIDLClass(Body, undefined, {
    get body() {
      return this[kStream];
    },
    get bodyUsed() {
      return this[kDisturbed];
    },

    arrayBuffer() {
      return consumeBody(this);
    },
    blob() {
      return consumeBody(this);
    },
    formData() {
      return consumeBody(this);
    },
    json() {
      return consumeBody(this);
    },
    text() {
      return consumeBody(this);
    },
  });

  class Response extends Body {
    constructor(body = null, { status = 200, statusText = 'OK', headers } = {}) {
      super(body);

      if (status < 200 || status > 599) {
        throw new RangeError();
      }

      // If init’s statusText member does not match the reason-phrase token production,
      // then throw a TypeError.

      this[kHeaders] = new Headers(headers, { [kGuard]: 'response' });
      this[kStatus] = status;
      this[kStatusMessage] = statusText;
    }

    static error() {
      const r = new Response(); // NetworkError
      r[kHeaders] = new Headers(undefined, { [kGuard]: 'immutable' });
      return r;
    }

    static redirect(url, status = 302) {
      const baseURL = getURLFromFilePath(process.cwd);
      const parsedURL = new URL(url, baseURL);
      const r = new Response();
      r[kHeaders] = new Headers(undefined, { [kGuard]: 'immutable' });
      r[kStatus] = status;
      r[kHeaders].set('Location', `${parsedURL}`);
      return r;
    }
  }

  defineIDLClass(Response, 'Response', {
    get type() {
      return this[kType];
    },

    get url() {
      return `${this[kURLList][0]}`;
    },
    get redirected() {
      return this[kURLList].length > 1;
    },
    get status() {
      return this[kStatus];
    },
    get ok() {
      return this.status >= 200 && this.status < 300;
    },
    get statusText() {
      return this[kStatusMessage];
    },
    get headers() {
      return this[kHeaders];
    },
    get trailer() {
      return undefined;
    },
    clone() {},
  });

  const basicHTTPFetch = () => 0;

  class Request extends Body {
    constructor(input, init) {
      super();
      let fallbackMode = null;
      let fallbackCredentials = null;
      const baseURL = getURLFromFilePath(process.cwd);
      let signal = null;

      this[kURLList] = [];

      if (typeof input === 'string') {
        const parsedURL = new URL(input, baseURL);
        if (parsedURL.username || parsedURL.password) {
          throw new TypeError();
        }
        this[kURLList][0] = parsedURL;
        fallbackMode = 'cors';
        fallbackCredentials = 'same-origin';
      } else {
        signal = input[kSignal];
      }

      this[kMethod] = 'GET';
      this[kHeaders] = new Headers();
      this[kUnsafeRequest] = true;
      this[kClient] = null; // current settings object?
      this[kWindow] = global;
      this[kOrigin] = 'client';
      this[kReferrer] = 'client';
      this[kReferrerPolicy] = '';
      this[kMode] = 'no-cors';
      this[kCredentialsMode] = 'omit';
      this[kCacheMode] = 'default';
      this[kRedirectMode] = 'follow';
      this[kIntegrityMetadata] = '';
      this[kKeepAlive] = false;
      this[kReloadNavigation] = false;
      this[kHistoryNavigation] = false;

      if (init) {
        if (this[kMode] === 'navigate') {
          this[kMode] = 'same-origin';
        }
        this[kReloadNavigation] = false;
        this[kHistoryNavigation] = false;
        this[kReferrer] = 'client';
        this[kReferrerPolicy] = '';

        if (init.referrer) {
          const { referrer } = init;
          if (referrer === '') {
            this[kReferrer] = 'no-referrer';
          } else {
            const parsedReferrer = new URL(referrer, baseURL);
            if (parsedReferrer.cannotBeABaseURL &&
                parsedReferrer.scheme === 'about' &&
                parsedReferrer.path.includes('client')) {
              this[kReferrer] = 'client';
            } else {
              this[kReferrer] = parsedReferrer;
            }
          }
        }

        if (init.referrerPolicy) {
          this[kReferrerPolicy] = init.referrerPolicy;
        }

        const mode = init.mode || fallbackMode;
        if (mode === 'navigate') {
          throw new TypeError();
        }
        if (mode !== null) {
          this[kMode] = mode;
        }
      }

      return basicHTTPFetch(this, fallbackCredentials, signal);
    }
  }

  defineIDLClass(Request, 'Request', {
    get method() {
      return this[kMethod];
    },
    get url() {
      return `${this[kURLList][0]}`;
    },
    get headers() {
      return this[kHeaders];
    },

    get destination() {
      return undefined;
    },
    get referrer() {
      return this[kReferrer];
    },
    get referrerPolicy() {
      return this[kReferrerPolicy];
    },
    get mode() {
      return this[kMode];
    },
    get credentials() {
      return this[kCredentialsMode];
    },
    get cache() {
      return undefined;
    },
    get redirect() {
      return this[kRedirectMode];
    },
    get integrity() {
      return undefined;
    },
    get keepalive() {
      return this[kKeepAlive];
    },
    get isReloadNavigation() {
      return this[kReloadNavigation];
    },
    get isHistoryNavigation() {
      return this[kHistoryNavigation];
    },
    get signal() {
      return this[kSignal];
    },

    clone() {
      if (this[kDisturbed] || this[kLocked]) {
        throw new TypeError();
      }

      const request = new Request();
      const headers = new Headers(this[kHeaders]);
      request[kHeaders] = headers;

      // Make clonedRequestObject’s signal follow context object’s signal.

      return request;
    },
  });

  const AbortFetch = (promise, request, response) => {
    const error = new Error('AbortError');
    PromiseReject(promise, error);
    // If request’s body is not null and is readable, then cancel request’s body with error.
    if (response === null) {
      // stuff
    }
    // Reject responseObject’s trailer promise with error.
    // Let response be responseObject’s response.
    // If response’s body is not null and is readable, then error response’s body with error.
  };

  namespace.fetch = (input, init) => {
    const p = PromiseCreate();
    const requestObject = new Request(input, init);
    const request = requestObject;
    if (request[kSignal].aborted) {
      AbortFetch(p, request, null);
      PromiseReject(p);
      return p;
    }
    // const responseObject = new Response();
    // const locallyAborted = false;
    // step 8 signal stuff
  };

  namespace.Headers = Headers;
  namespace.Request = Request;
  namespace.Response = Response;
  namespace.FormData = FormData;
};
