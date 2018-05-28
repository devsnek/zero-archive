'use strict';

// https://github.com/nodejs/node/blob/master/lib/timers.js

({ namespace, binding, load }) => {
  const { TimerWrap } = binding('timer_wrap');
  const performance = load('w3/performance');

  const queue = [];

  const wrap = new TimerWrap(() => {
    const now = performance.now();
    queue.forEach((item, index) => {
      if (item.expiry > now) {
        return;
      }

      try {
        Reflect.apply(item.handler, global, item.handlerArgs);
      } catch (err) {} // eslint-disable-line no-empty

      queue.splice(index, 1);
      if (item.repeat) {
        const drift = now - item.expiry;
        insert(item, performance.now() - drift); // eslint-disable-line no-use-before-define
      }
    });

    const next = queue[0];
    if (next) {
      wrap.update(Math.max(next.expiry - performance.now(), 1));
    }
  });

  const insert = (item, start) => {
    const msecs = item.timeout;
    if (msecs < 0 || msecs === undefined) {
      return;
    }

    item.start = start;

    const expiry = start + msecs;
    item.expiry = expiry;

    if (queue.length > 0) {
      const next = queue[0];
      if (next.expiry > expiry) {
        wrap.update(msecs);
      }
      queue.push(item);
      queue.sort((a, b) => a.expiry - b.expiry || a.id - b.id);
    } else {
      queue.push(item);
      wrap.update(msecs);
    }
  };

  let timerId = 0;
  class Timer {
    constructor(handler, timeout, args, repeat) {
      this.handler = handler;
      this.handlerArgs = args;

      this.start = undefined;

      this.timeout = timeout;
      this.repeat = repeat;

      this.id = timerId;
      timerId += 1;
    }
  }

  namespace.setTimeout = (handler, timeout, ...args) => {
    const t = new Timer(handler, timeout, args, false);
    insert(t, performance.now());
    return t.id;
  };

  namespace.setInterval = (handler, timeout, ...args) => {
    const t = new Timer(handler, timeout, args, true);
    insert(t, performance.now());
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
