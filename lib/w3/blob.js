'use strict';

// https://github.com/bmeck/node/tree/service-loader/blob/master/internal/blob.js

({ namespace, load, PrivateSymbol: PS, kCustomInspect }) => {
  const { defineIDLClass } = load('util');
  const { TextEncoder } = load('whatwg/encoding');
  const { MIME } = load('mime');

  const ENCODER = new TextEncoder('utf8');

  const ArrayBufferSource = {
    __proto__: null,
    [Symbol.hasInstance](v) {
      return v instanceof Uint8Array ||
        v instanceof Uint16Array ||
        v instanceof Uint32Array ||
        v instanceof Int8Array ||
        v instanceof Int16Array ||
        v instanceof Int32Array ||
        v instanceof Float32Array ||
        v instanceof Float64Array ||
        v instanceof Uint8ClampedArray ||
        v instanceof DataView ||
        v instanceof ArrayBuffer;
    },
  };

  const kType = PS('kType');
  const kBuffer = PS('kBuffer');

  const convertLineEndingsToNative = (str) => {
    const nativeLineEnding = '\n';
    const chars = [...str];
    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i].codePointAt(0);
      if (char === 0x0d /* \r */) {
        chars[i] = nativeLineEnding;
        i += 1;
        if (i < chars.length) {
          if (chars[i].codePointAt(0) === 0x0a /* \n */) {
            chars[i] = '';
            i += 1;
          }
        }
      } else if (char === 0x0a /* \n */) {
        chars[i] = nativeLineEnding;
      }
    }
    return chars.join('');
  };

  const processBlobParts = (blobParts, endings) => {
    const retParts = [];
    let length = 0;
    for (const part of blobParts) {
      if (part instanceof Blob) { // eslint-disable-line no-use-before-define
        // no need to copy, isn't be shared / writable
        const other = part[kBuffer];
        retParts.push(other);
        length += other.byteLength;
      } else if (typeof part === 'string') {
        let str;
        if (endings === 'native') {
          str = convertLineEndingsToNative(part);
        } else if (endings === 'transparent') {
          str = part;
        }
        const encoded = ENCODER.encode(str);
        retParts.push(encoded);
        length += encoded.byteLength;
      } else if (part instanceof ArrayBufferSource) {
        const buf = new Uint8Array(part.byteLength);
        buf.set(part, 0);
        retParts.push(buf);
        length += part.byteLength;
      } else {
        throw new TypeError('Not a sequence');
      }
    }
    const ret = new Uint8Array(length);
    let index = 0;
    for (const part of retParts) {
      ret.set(part, index);
      index += part.byteLength;
    }
    return ret;
  };

  class Blob {
    constructor(blobParts, { endings = 'transparent', type = '' } = {}) {
      if (this instanceof Blob !== true) {
        throw new Error('cannot construct invalid subclass');
      }

      if (type !== '') {
        try {
          type = `${new MIME(type)}`;
        } catch (e) {
          type = '';
        }
      }

      let buffer;
      if (arguments.length === 0) {
        buffer = new Uint8Array(0);
      } else {
        buffer = processBlobParts(blobParts, endings);
      }

      this[kType] = type;
      this[kBuffer] = buffer;

      this[kCustomInspect] = () => ({
        __proto__: Blob.prototype,
        size: this.size,
        type: this.type,
      });
    }
  }

  defineIDLClass(Blob, undefined, {
    get size() {
      return this[kBuffer].byteLength;
    },

    get type() {
      return this[kType];
    },

    slice(start, end, contentType) {
      const buffer = this[kBuffer];
      const size = buffer.byteLength;
      if (start === null || start === undefined) {
        start = 0;
      }
      if (start < 0) {
        start = Math.max(size + start, 0);
      } else {
        start = Math.min(start, size);
      }
      if (end === null || end === undefined) {
        end = size;
      }
      if (end < 0) {
        end = Math.max(size + end, 0);
      } else {
        end = Math.min(end, size);
      }
      if (contentType === null || contentType === undefined) {
        contentType = '';
      } else {
        // handled by constructor
      }
      return new Blob([buffer.slice(start, end)], {
        type: contentType,
      });
    },
  });

  namespace.Blob = Blob;
};
