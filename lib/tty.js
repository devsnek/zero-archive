'use strict';

({ namespace, binding, load }) => {
  const { TTYWrap } = binding('tty');
  const { TextEncoder } = load('whatwg/encoding');

  const encoder = new TextEncoder('utf8');

  class TTY extends TTYWrap {
    write(arg) {
      if (typeof arg === 'string') {
        arg = encoder.encode(arg);
      }
      return super.write(arg);
    }
  }

  namespace.TTYWrap = TTY;
};
