'use strict';

({ namespace, load, PrivateSymbol: PS, kCustomInspect }) => {
  const { defineIDLClass } = load('util');

  const kParams = PS('kParams');
  const kType = PS('kType');
  const kSubtype = PS('kSubtype');
  const kMap = PS('kMap');

  const NotHTTPTokenCodePoint = /[^!#$%&'*+-.^_`|~A-Za-z0-9]/g;
  const NotHTTPQuotedStringCodePoint = /[^\t\u0020-~\u0080-\u00FF]/g;
  NotHTTPQuotedStringCodePoint[Symbol.replace] = null;

  const test = (pattern, value) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  };

  const encode = (value) => {
    const enc = test(NotHTTPTokenCodePoint, value);
    if (!enc) {
      return value;
    }
    const escaped = value.replace(/["\\]/g, '\\$&');
    const ret = `"${escaped}"`;
    return ret;
  };

  const MIMEStringify = (self) => {
    let ret = `${self[kType]}/${self[kSubtype]}`;
    const entries = self[kParams].entries();
    let keyValuePair;
    let done;
    for (;;) {
      ({ value: keyValuePair, done } = entries.next());
      if (done) {
        break;
      }
      const [key, value] = keyValuePair;
      const encoded = encode(value);
      ret += `;${key}=${encoded}`;
    }
    return ret;
  };

  class MIMEParams {
    constructor() {
      this[kMap] = new Map();
    }
  }

  defineIDLClass(MIMEParams, undefined, {
    delete(name) {
      this[kMap].delete(name);
    },

    get(name) {
      const map = this[kMap];
      if (map.has(name)) {
        return map.get(name);
      }
      return null;
    },

    has(name) {
      return this[kMap].has(name);
    },

    set(name, value) {
      name = name.trimLeft();
      const invalidName = test(NotHTTPTokenCodePoint, name);
      if (name.length === 0 || invalidName) {
        throw new Error('Invalid MIME parameter name');
      }
      const invalidValue = test(NotHTTPQuotedStringCodePoint, value);
      if (value.length === 0 || invalidValue) {
        throw new Error('Invalid MIME parameter value');
      }
      this[kMap].set(name, value);
    },

    * entries() {
      return yield* this[kMap].entries();
    },

    * keys() {
      return yield* this[kMap].keys();
    },

    * values() {
      return yield* this[kMap].values();
    },

    * [Symbol.iterator]() {
      return yield* this[kMap].entries();
    },
  });

  const parse = (input) => {
    let position = 0;

    let type = '';
    while (input[position] && input[position] !== '/') {
      type += input[position];
      position += 1;
    }

    // If type is the empty string or does not solely
    // contain HTTP token code points, then return failure.

    position += 1;

    let subtype = '';
    while (input[position] && input[position] !== ';') {
      subtype += input[position];
      position += 1;
    }

    // Remove any trailing ASCII whitespace from subtype.
    subtype = subtype.trimLeft();

    const mimeType = {
      type: type.toLowerCase(),
      subtype: subtype.toLowerCase(),
      parameters: new MIMEParams(),
    };

    while (input[position]) {
      position += 1;

      let parameterName = '';
      while (input[position] && input[position] !== ';' && input[position] !== '=') {
        parameterName += input[position];
        position += 1;
      }
      parameterName = parameterName.toLowerCase();

      position += 1;

      let parameterValue = '';
      if (input[position]) {
        if (input[position] === '"') {
          position += 1;
          while (true) { // eslint-disable-line no-constant-condition
            while (input[position] && input[position] !== '"' && input[position] !== '\\') {
              parameterValue += input[position];
              position += 1;
            }
            if (input[position] && input[position] === '\\') {
              position += 1;
              if (input[position]) {
                parameterValue += input[position];
                position += 1;
                continue;
              } else {
                parameterValue += '\\';
                break;
              }
            } else {
              break;
            }
          }
        } else {
          while (input[position] && input[position] !== ';') {
            parameterValue += input[position];
            position += 1;
          }
        }
      }

      if (parameterName && parameterValue && !mimeType.parameters.has(parameterName)) {
        mimeType.parameters.set(parameterName, parameterValue);
      }
    }

    return mimeType;
  };

  class MIME {
    constructor(string) {
      const data = parse(string);

      if (data === null) {
        throw new TypeError('Invalid MIME');
      }

      this[kType] = data.type;
      this[kSubtype] = data.subtype;
      this[kParams] = data.parameters;

      this[kCustomInspect] = () => ({
        __proto__: null,
        type: this.type,
        subtype: this.subtype,
        params: this.params,
      });
    }
  }

  defineIDLClass(MIME, undefined, {
    get type() {
      return this[kType];
    },

    set type(v) {
      v = v.trimLeft();
      const invalidType = test(NotHTTPTokenCodePoint, v);
      if (v.length === 0 || invalidType) {
        throw new Error('Invalid MIME type');
      }
      this[kType] = v;
    },

    get subtype() {
      return this[kSubtype];
    },

    set subtype(v) {
      v = v.trimRight();
      const invalidSubtype = test(NotHTTPTokenCodePoint, v);
      if (v.length === 0 || invalidSubtype) {
        throw new Error('Invalid MIME subtype');
      }
      this[kSubtype] = v;
    },

    get params() {
      return this[kParams];
    },

    toJSON() {
      return MIMEStringify(this);
    },

    toString() {
      return MIMEStringify(this);
    },
  });

  namespace.MIME = MIME;
};
