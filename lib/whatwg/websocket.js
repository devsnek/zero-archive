'use strict';

({ namespace, load, PrivateSymbol: PS }) => {
  const { defineIDLClass } = load('util');
  const { EventTarget } = load('whatwg/events');
  const { URL } = load('whatwg/url');
  const { TextEncoder } = load('whatwg/encoding');
  const { Blob } = load('w3/blob');

  const kURL = PS('kURL');
  const kReadyState = PS('kReadyState');
  const kExtensions = PS('kExtensions');
  const kProtocol = PS('kProtocol');
  const kBinaryType = PS('kBinaryType');
  const kBufferedAmount = PS('kBufferedAmount');

  const CONNECTING = 0;
  const OPEN = 1;
  const CLOSING = 2;
  const CLOSED = 3;

  const encoder = new TextEncoder();

  class WebSocket extends EventTarget {
    constructor(url, protocols) {
      super();

      if (typeof protocols === 'string') {
        protocols = [protocols];
      }

      const urlRecord = new URL(url);

      if (urlRecord.protocol !== 'wss:' && urlRecord.protocol !== 'ws:') {
        throw new SyntaxError('Invalid protocol');
      }

      if (urlRecord.fragment) {
        throw new SyntaxError('Invalid URL');
      }

      this[kURL] = url;
      this[kReadyState] = CONNECTING;
      this[kExtensions] = '';
      this[kProtocol] = '';
      this[kBinaryType] = 'blob';
      this[kBufferedAmount] = 0;
    }
  }

  defineIDLClass(WebSocket, undefined, {
    get url() {
      return this[kURL];
    },

    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,

    get readyState() {
      return this[kReadyState];
    },
    get bufferedAmount() {
      return this[kBufferedAmount];
    },

    get extensions() {
      return this[kExtensions];
    },
    get protocol() {
      return this[kProtocol];
    },

    close(code, reason) {
      if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
        throw new RangeError();
      }

      let reasonBytes;
      if (reason !== undefined) {
        reasonBytes = encoder.encode(reason);
        if (reasonBytes.byteLength > 123) {
          throw new SyntaxError();
        }
      }

      if (this[kReadyState] === CLOSING || this[kReadyState] === CLOSED) {
        return;
      }

      // more

      this[kReadyState] = CLOSING;
    },

    get binaryType() {
      return this[kBinaryType];
    },
    set binaryType(v) {
      this[kBinaryType] = v;
    },

    send(data) {
      if (typeof data === 'string') {
        const e = encoder.encode(data);
        this[kBufferedAmount] += e.byteLength;
        // send(e);
      }

      if (data instanceof Blob) {
        this[kBufferedAmount] += data.length;
        // send(e[kBuffer]);
      }

      if (data instanceof ArrayBuffer) {
        this[kBufferedAmount] += data.byteLength;
        // send(data);
      }

      if (ArrayBuffer.isView(data)) {
        // dunno
        // send(data);
      }
    },
  });

  namespace.WebSocket = WebSocket;
};
