'use strict';

({ load, namespace }) => {
  const util = load('util');
  const kStdout = util.privateSymbol('stdout');
  const kStderr = util.privateSymbol('stderr');
  const kTimers = util.privateSymbol('timers');

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
      write(this[kStdout], util.format(...args));
    }

    error(...args) {
      write(this[kStderr], util.format(...args));
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
