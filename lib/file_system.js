'use strict';

// https://github.com/mozilla/libdweb/blob/master/src/FileSystem/FileSystem.js

({ binding, namespace, load }) => {
  const {
    open,
    stat: _stat,
    fstat: _fstat,
    read,
    close,
    // O_APPEND,
    // O_CREAT,
    // O_EXCL,
    O_RDONLY,
    // O_RDWR,
    // O_SYNC,
    // O_TRUNC,
    // O_WRONLY,
    // S_IFBLK,
    // S_IFCHR,
    S_IFDIR,
    // S_IFIFO,
    S_IFLNK,
    S_IFMT,
    // S_IFREG,
    // S_IFSOCK,
  } = binding('fs');

  const nsFromTimeSpecBigInt = (sec, nsec) => (sec * 1000000000n) + nsec;

  const convertStats = (array) => ({
    dev: array[0],
    mode: array[1],
    nlink: array[2],
    uid: array[3],
    gid: array[4],
    rdev: array[5],
    ino: array[6],
    size: array[7],
    blksize: array[8],
    blocks: array[9],
    flags: array[10],
    gen: array[11],
    atim: nsFromTimeSpecBigInt(array[12], array[13]),
    mtim: nsFromTimeSpecBigInt(array[14], array[15]),
    ctim: nsFromTimeSpecBigInt(array[16], array[17]),
    birthtim: nsFromTimeSpecBigInt(array[18], array[19]),
  });

  const stat = async (f) => {
    const stats = await _stat(f);
    return convertStats(stats);
  };

  const fstat = async (f) => {
    const stats = await _fstat(f);
    return convertStats(stats);
  };

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
    async stat(url) {
      const path = resolvePath(url);
      const stats = await stat(path);

      return {
        isDir: (stats.mode & S_IFMT) === S_IFDIR,
        isSymlink: (stats.mode & S_IFMT) === S_IFLNK,
        size: stats.size,
        lastAccessDate: stats.atim,
        lastModificationDate: stats.mtim,

        unixOwner: stats.uid,
        unixGroup: stats.gid,
        unixMode: stats.mode,
        unixLastStatusChangeDate: stats.ctim,
        winBirthDate: undefined,
        winAttributes: undefined,
      };
    },
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
