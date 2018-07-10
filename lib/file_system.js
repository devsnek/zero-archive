'use strict';

// https://github.com/mozilla/libdweb/blob/master/src/FileSystem/FileSystem.js

({ binding, namespace, load }) => {
  const {
    open,
    close,
    stat: _stat,
    fstat: _fstat,
    read,
    write,
    scandir,
    rmdir,
    unlink,
    mkdir,
    symlink,
    copy,
    // realpath,
    // O_APPEND,
    O_CREAT,
    // O_EXCL,
    O_RDONLY,
    // O_RDWR,
    // O_SYNC,
    // O_TRUNC,
    O_WRONLY,
    // S_IFBLK,
    // S_IFCHR,
    S_IFDIR,
    // S_IFIFO,
    S_IFLNK,
    S_IFMT,
    // S_IFREG,
    // S_IFSOCK,
    UV_FS_COPYFILE_EXCL,
  } = binding('fs');

  const DEFAULT_MODE = 0o666;

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
  const { TextDecoder, TextEncoder } = load('whatwg/encoding');

  const decoders = new Map();
  const encoder = new TextEncoder();

  class FileSystemManager {}

  const resolvePath = (url) => {
    if (typeof url === 'string' && !/^file:/.test(url)) {
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
      let fd;
      try {
        const path = resolvePath(url);
        fd = await open(path, O_RDONLY, DEFAULT_MODE);
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
        throw new Error(`${e.message}: "${url}"`);
      } finally {
        if (fd !== undefined) {
          await close(fd);
        }
      }
    },

    async writeFile(url, buffer, {
      position = -1,
    } = {}) {
      if (typeof buffer === 'string') {
        buffer = encoder.encode(buffer);
      }
      let fd;
      try {
        const path = resolvePath(url);
        fd = await open(path, O_WRONLY | O_CREAT, DEFAULT_MODE);
        await write(fd, position, buffer);
      } catch (e) {
        throw new Error(`${e.message}: "${url}"`);
      } finally {
        if (fd !== undefined) {
          await close(fd);
        }
      }
    },
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
    async copy(from, to, {
      noOverwrite = false,
    } = {}) {
      const fromPath = resolvePath(from);
      const toPath = resolvePath(to);
      await copy(fromPath, toPath, noOverwrite ? UV_FS_COPYFILE_EXCL : 0);
    },
    // move(from, to, options = {}) {},
    async createSymbolicLink(from, to) {
      const fromPath = resolvePath(from);
      const toPath = resolvePath(to);
      await symlink(fromPath, toPath);
    },
    async exists(url) {
      try {
        const path = resolvePath(url);
        await stat(path);
        return true;
      } catch (e) {
        return false;
      }
    },
    // watch(url, options = {}) {},

    async createDirectory(url, {
      ignoreExisting = false,
      unixMode = DEFAULT_MODE,
    } = {}) {
      const path = resolvePath(url);
      try {
        await mkdir(path, unixMode);
      } catch (e) {
        if (!ignoreExisting || e.code !== 'EEXIST') {
          throw e;
        }
      }
    },
    async removeDirectory(url, {
      recursive = false,
    } = {}) {
      const path = resolvePath(url);
      if (recursive) {
        const items = await this.readDirectory(path);
        await Promise.all(items.map(async (i) => {
          try {
            await unlink(i);
          } catch (e) {
            await this.removeDirectory(i, { recursive });
          }
        }));
      } else {
        await rmdir(path);
      }
    },
    async readDirectory(url) {
      const path = resolvePath(url);
      const entries = await scandir(path);
      return entries;
    },
  });

  namespace.FileSystemManager = FileSystemManager;
  namespace.fileSystem = new FileSystemManager();
};
