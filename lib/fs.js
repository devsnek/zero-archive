'use strict';

({ binding, namespace }) => {
  const {
    open, fstat, read, close,
    O_RDONLY,
    /*
    O_WRONLY,
    O_RDWR,
    O_APPEND,
    O_SYNC,
    O_CREAT,
    O_TRUNC,
    O_EXCL,
    */
  } = binding('fs');

  namespace.readFile = async (path) => {
    let fd;
    try {
      fd = await open(path, O_RDONLY);
      const stat = await fstat(fd);
      const buffer = await read(fd, stat.size, -1);
      return buffer;
    } finally {
      if (fd !== undefined) {
        await close(fd);
      }
    }
  };
};
