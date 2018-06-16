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

    Object.entries(Object.getOwnPropertyDescriptors(obj)).forEach(([key, desc]) => {
      Object.defineProperty(clazz.prototype, key, {
        ...desc,
        enumerable: typeof desc.value !== 'symbol',
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
};
