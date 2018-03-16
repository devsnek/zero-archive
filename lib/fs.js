'use strict';

({ binding, namespace }) => {
  const io = binding('io');

  function readFileSync(filename) {
    return io.ReadFileSync(filename, 'rb');
  }

  namespace.readFileSync = readFileSync;
};
