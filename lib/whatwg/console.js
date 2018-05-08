'use strict';

({ load, namespace, PrivateSymbol }) => {
  const { format } = load('util');
  const performance = load('w3/performance');

  const kStdout = PrivateSymbol('stdout');
  const kStderr = PrivateSymbol('stderr');
  const kTimers = PrivateSymbol('timers');

  function write(tty, string) {
    string += '\n';
    tty.write(string);
  }

  class Console {
    constructor(stdout, stderr) {
      this[kStdout] = stdout;
      this[kStderr] = stderr;
      this[kTimers] = new Map();

      this.log = this.log.bind(this);
      this.error = this.error.bind(this);

      this.debug = this.log;
      this.info = this.log;

      this.warn = this.error;

      this.time = this.time.bind(this);
      this.timeEnd = this.timeEnd.bind(this);
    }

    log(...args) {
      write(this[kStdout], format(...args));
    }

    error(...args) {
      write(this[kStderr], format(...args));
    }

    time(label = 'default') {
      label = `${label}`;
      if (this[kTimers].has(label)) {
        return;
      }
      this[kTimers].set(label, performance.now());
    }

    timeEnd(label = 'default') {
      label = `${label}`;
      if (!this[kTimers].has(label)) {
        return;
      }
      const time = this[kTimers].get(label);
      this[kTimers].delete(label);
      const duration = performance.now() - time;
      this.log(`${label}: ${duration.toFixed(3)}ms`);
    }
  }

  namespace.Console = Console;
};
