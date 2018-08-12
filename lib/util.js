'use strict';

({ namespace, load, binding }) => {
  const ScriptWrap = binding('script_wrap');

  Object.assign(namespace, load('util/inspect'));

  function defineIDLClass(clazz, classStr, obj) {
    // https://heycam.github.io/webidl/#dfn-class-string
    if (classStr) {
      Object.defineProperty(clazz.prototype, Symbol.toStringTag, {
        writable: false,
        enumerable: false,
        configurable: true,
        value: classStr,
      });
    }

    const descriptors = Object.getOwnPropertyDescriptors(obj);

    Object.getOwnPropertySymbols(obj).forEach((key) => {
      const desc = descriptors[key];
      Object.defineProperty(clazz.prototype, key, {
        ...desc,
        enumerable: false,
        configurable: true,
      });
    });

    Object.getOwnPropertyNames(obj).forEach((key) => {
      const desc = descriptors[key];
      Object.defineProperty(clazz.prototype, key, {
        ...desc,
        enumerable: true,
        configurable: true,
      });
    });
  }

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

  namespace.style = (str, color) => {
    const [start, end] = ansi[color];
    return `\u001b[${start}m${str}\u001b[${end}m`;
  };

  namespace.uuid4122 = () => {
    let uuid = '';
    for (let i = 0; i < 32; i += 1) {
      if (i === 8 || i === 12 || i === 16 || i === 20) {
        uuid += '-';
      }

      const n = do {
        if (i === 12) {
          4;
        } else {
          const random = Math.random() * 16 | 0;
          if (i === 16) {
            (random & 3) | 0;
          } else {
            random;
          }
        }
      };

      uuid += n.toString(16);
    }
    return uuid;
  };

  namespace.defineIDLClass = defineIDLClass;

  namespace.CreatePromise = () => new Promise(() => undefined);
  const {
    MarkPromiseAsHandled,
    ResolvePromise,
    RejectPromise,
  } = ScriptWrap.run('[PromiseNative]', `({
  MarkPromiseAsHandled: (p) => { %PromiseMarkAsHandled(p); },
  ResolvePromise: (p, v) => { %ResolvePromise(p, v); },
  RejectPromise: (p, r) => { %RejectPromise(p, r); },
})`);
  namespace.MarkPromiseAsHandled = MarkPromiseAsHandled;
  namespace.ResolvePromise = ResolvePromise;
  namespace.RejectPromise = RejectPromise;

  class AsyncQueue {
    constructor(concurrency) {
      this.queue = [];
      this.concurrency = concurrency;
      this.current = 0;
    }

    async run() {
      if (this.current >= this.concurrency) {
        return;
      }
      this.current += 1;

      const item = this.queue.shift();
      if (item) {
        const { job, resolve, reject } = item;
        try {
          resolve(await job());
        } catch (e) {
          reject(e);
        }

        this.current -= 1;
        return this.run();
      }

      this.current -= 1;
    }

    add(job) {
      return new Promise((resolve, reject) => {
        this.queue.push({ job, resolve, reject });
        this.run();
      });
    }
  }


  // https://github.com/jsdom/abab/blob/master/lib/btoa.js
  const b64table = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
    'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
    'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
    'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f',
    'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
    'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
    'w', 'x', 'y', 'z', '0', '1', '2', '3',
    '4', '5', '6', '7', '8', '9', '+', '/',
  ];
  namespace.base64decode = (data) => {
    data = `${data}`;
    for (let i = 0; i < data.length; i += 1) {
      if (data.charCodeAt(i) > 255) {
        return null;
      }
    }
    let out = '';
    for (let i = 0; i < data.length; i += 3) {
      const groupsOfSix = [undefined, undefined, undefined, undefined];
      groupsOfSix[0] = data.charCodeAt(i) >> 2;
      groupsOfSix[1] = (data.charCodeAt(i) & 0x03) << 4;
      if (data.length > i + 1) {
        groupsOfSix[1] |= data.charCodeAt(i + 1) >> 4;
        groupsOfSix[2] = (data.charCodeAt(i + 1) & 0x0f) << 2;
      }
      if (data.length > i + 2) {
        groupsOfSix[2] |= data.charCodeAt(i + 2) >> 6;
        groupsOfSix[3] = data.charCodeAt(i + 2) & 0x3f;
      }
      for (let j = 0; j < groupsOfSix.length; j += 1) {
        if (typeof groupsOfSix[j] === 'undefined') {
          out += '=';
        } else {
          out += b64table[groupsOfSix[j]];
        }
      }
    }
    return out;
  };

  namespace.AsyncQueue = AsyncQueue;
};
