'use strict';

// https://github.com/nodejs/node/blob/master/lib/timers.js

({ namespace, binding, load }) => {
  const { TimerWrap } = binding('timer_wrap');
  const ScriptWrap = binding('script_wrap');
  const { performance } = load('w3');

  const queue = [];

  let nestingLevel = 0;

  const wrap = new TimerWrap(() => {
    const now = performance.now();
    queue.forEach((item, index) => {
      if (item.expiry > now) {
        return;
      }

      queue.splice(index, 1);

      if (item.repeat) {
        insert(item); // eslint-disable-line no-use-before-define
      }

      const lastNestingLevel = nestingLevel;
      nestingLevel = item.nestingLevel; // eslint-disable-line prefer-destructuring

      try {
        if (typeof item.handler === 'function') {
          Reflect.apply(item.handler, global, item.handlerArgs);
        } else {
          ScriptWrap.run('', item.handler);
        }
      } catch (err) {} // eslint-disable-line no-empty

      nestingLevel = lastNestingLevel;
    });

    if (queue.length > 0) {
      const next = queue[0];
      wrap.update(Math.max(next.expiry - performance.now(), 1));
    }
  });

  const insert = (item) => {
    const msecs = item.timeout;
    if (msecs < 0 || msecs === undefined) {
      return;
    }

    item.expiry = item.expiry ?
      item.expiry + msecs :
      performance.now() + msecs;

    if (queue.length > 0) {
      const next = queue[0];
      if (next.expiry > item.expiry) {
        wrap.update(msecs);
      }
      queue.push(item);
      queue.sort((a, b) => a.expiry - b.expiry || a.id - b.id);
    } else {
      queue.push(item);
      wrap.update(msecs);
    }
  };

  const TIMEOUT_MAX = (2 ** 31) - 1;
  let timerId = 0;
  class Timer {
    constructor(handler, timeout, args, repeat) {
      this.handler = handler;
      this.handlerArgs = args;

      this.nestingLevel = nestingLevel + 1;

      this.expiry = undefined;

      this.repeat = repeat;

      this.id = timerId;
      timerId += 1;

      if (this.nestingLevel > 5 && this.timeout < 4) {
        this.timeout = 4;
      } else {
        this.timeout = timeout || 1;
        if (this.timeout > TIMEOUT_MAX || this.timeout < 1) {
          this.timeout = 1;
        }
      }
    }
  }

  namespace.setTimeout = (handler, timeout, ...args) => {
    const t = new Timer(handler, timeout, args, false);
    insert(t);
    return t.id;
  };

  namespace.setInterval = (handler, timeout, ...args) => {
    const t = new Timer(handler, timeout, args, true);
    insert(t);
    return t.id;
  };

  namespace.clearTimeout = namespace.clearInterval = (handle) => {
    const index = queue.findIndex((item) => item.id === handle);
    if (index !== -1) {
      queue.splice(index, 1);
      return true;
    }
    return false;
  };
};
