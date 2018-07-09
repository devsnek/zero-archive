'use strict';

// https://github.com/mozilla/libdweb/blob/master/src/FileSystem/FileSystem.js

({ binding, namespace, load }) => {
  const {
    open, stat, fstat, read, close,
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

  const { defineIDLClass } = load('util');
  const { getFilePathFromURL } = load('whatwg/url');
  const { TextDecoder } = load('whatwg/encoding');

  const decoders = new Map();

  class FileSystemManager {}

  const resolvePath = (url) => {
    url = `${url}`;
    if (!/^file:/.test(url)) {
      return url;
    }
    return getFilePathFromURL(url);
  };

  defineIDLClass(FileSystemManager, undefined, {
    // open(url, mode, options = {}) {},

    async readFile(url, {
      size = undefined,
      position = -1,
      encoding = undefined,
    } = {}) {
      const path = resolvePath(url);
      let fd;
      try {
        fd = await open(path, O_RDONLY);
        if (size === undefined) {
          const stats = await fstat(fd);
          ({ size } = stats);
        }
        const buffer = await read(fd, size, position);
        if (encoding !== undefined) {
          if (!decoders.has(encoding)) {
            decoders.set(encoding, new TextDecoder(encoding));
          }
          return decoders.get(encoding).decode(buffer);
        }
        return buffer;
      } catch (e) {
        throw new Error(`${e.message}: "${path}"`);
      } finally {
        if (fd !== undefined) {
          await close(fd);
        }
      }
    },

    // writeFile(url, options = {}) {},
    // removeFile(url, options = {}) {},

    // setDates(url, dates) {},
    // setPermissions(url, permissions) {},
    // stat(url) {},
    // copy(from, to, options = {}) {},
    // move(from, to, options = {}) {},
    // createSymbolicLink(from, to) {},
    async exists(url) {
      const path = resolvePath(url);
      try {
        await stat(path);
        return true;
      } catch (e) {
        return false;
      }
    },
    // watch(url, options = {}) {},

    // createDirectory(url, options = {}) {},
    // removeDirectory(url, options = {}) {},
    // readDirectory(url, options = {}) {},
  });

  namespace.FileSystemManager = FileSystemManager;
  namespace.FileSystem = new FileSystemManager();
};
