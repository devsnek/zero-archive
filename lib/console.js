'use strict';

({ load, debug, namespace }) => {
  const kStdout = Symbol('stdout');
  const kStderr = Symbol('stderr');

  const util = load('util');

  function write(fn, string) {
    string += '\n';
    fn(string, false);
  }

  class Console {
    constructor(stdout, stderr) {
      this[kStdout] = stdout;
      this[kStderr] = stderr;
    }

    log(...args) {
      write(this[kStdout], util.format(...args));
    }

    error(...args) {
      write(this[kStderr], util.format(...args));
    }
  }
  Console.prototype.debug = Console.prototype.log;
  Console.prototype.info = Console.prototype.log;
  Console.prototype.dirxml = Console.prototype.log;

  Console.prototype.error = Console.prototype.warn;

  namespace.Console = Console;
  namespace.default = new Console(debug.log, debug.error);
};
