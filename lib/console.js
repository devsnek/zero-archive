'use strict';

({ load, namespace }) => {
  const kStdout = Symbol('stdout');
  const kStderr = Symbol('stderr');

  const util = load('util');

  function write(tty, string) {
    string += '\n';
    tty.write(string);
  }

  class Console {
    #timers = new Map();

    constructor(stdout, stderr) {
      this[kStdout] = stdout;
      this[kStderr] = stderr;

      this.log = this.log.bind(this);
      this.error = this.error.bind(this);

      this.debug = this.log;
      this.info = this.log;

      this.warn = this.error;
    }

    log(...args) {
      write(this[kStdout], util.format(...args));
    }

    error(...args) {
      write(this[kStderr], util.format(...args));
    }

    time(label = 'default') {
      label = `${label}`;
      if (this.#timers.has(label)) {
        return;
      }
      this.#timers.set(label, performance.now());
    }

    timeEnd(label = 'default') {
      label = `${label}`;
      if (!this.#timers.has(label)) {
        return;
      }
      const time = this.#timers.get(label);
      this.#timers.delete(label);
      const duration = performance.now() - time;
      this.log(`${label}: ${duration.toFixed(3)}ms`);
    }
  }

  namespace.Console = Console;
};
