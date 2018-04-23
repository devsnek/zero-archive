'use strict';

({ binding, namespace }) => {
  const { open, fstat, read, close } = binding('io');

  namespace.readFile = async (path) => {
    const fd = await open(path, true);
    const stat = await fstat(fd, true);
    const buffer = await read(fd, stat.size, -1, true);
    await close(fd, true);
    return buffer;
  };
};
