'use strict';

({ namespace, load }) => {
  Object.assign(namespace, load('util/inspect'));

  function defineIDLClass(clazz, classStr, obj) {
    // https://heycam.github.io/webidl/#dfn-class-string
    Object.defineProperty(clazz.prototype, Symbol.toStringTag, {
      writable: false,
      enumerable: false,
      configurable: true,
      value: classStr,
    });

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

  namespace.defineIDLClass = defineIDLClass;
};
