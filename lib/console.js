'use strict';

({ load, namespace, binding }) => {
  const kStdout = Symbol('stdout');
  const kStderr = Symbol('stderr');

  const util = load('util');
  const debug = binding('debug');

  function write(fn, string) {
    string += '\n';
    fn(string, false);
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
  namespace.default = new Console(debug.log, debug.error);
};
