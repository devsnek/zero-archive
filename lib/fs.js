'use strict';

({ binding, namespace }) => {
  const { open, fstat, read, close } = binding('fs');

  namespace.readFile = async (path) => {
    const fd = await open(path);
    const stat = await fstat(fd);
    const buffer = await read(fd, stat.size, -1);
    await close(fd);
    return buffer;
  };
};
