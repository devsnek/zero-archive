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
  }

  namespace.Console = Console;
};
