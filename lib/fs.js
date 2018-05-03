'use strict';

({ binding, namespace }) => {
  const { open, fstat, read, close } = binding('fs');

  namespace.readFile = async (path) => {
    let fd;
    try {
      fd = await open(path);
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
