'use strict';

// https://github.com/mozilla/libdweb/blob/master/src/FileSystem/FileSystem.js

({ binding, namespace, load, PrivateSymbol: PS }) => {
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
    rename,
    copy,
    futime,
    utime,
    eventStart,
    eventStop,
    // realpath,
    O_APPEND,
    O_CREAT,
    // O_EXCL,
    O_RDONLY,
    O_RDWR,
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
    UV_DIRENT_UNKNOWN,
    UV_DIRENT_FILE,
    UV_DIRENT_DIR,
    UV_DIRENT_LINK,
    UV_DIRENT_FIFO,
    UV_DIRENT_SOCKET,
    UV_DIRENT_CHAR,
    UV_DIRENT_BLOCK,
    UV_FS_EVENT_WATCH_ENTRY,
    UV_FS_EVENT_RECURSIVE,
  } = binding('fs');
  const { WeakRef } = binding('util');

  const kFD = PS('kFD');
  const kHandle = PS('kHandle');

  const uvTypeToReadable = {
    [UV_DIRENT_UNKNOWN]: 'unknown',
    [UV_DIRENT_FILE]: 'file',
    [UV_DIRENT_DIR]: 'directory',
    [UV_DIRENT_LINK]: 'link',
    [UV_DIRENT_FIFO]: 'fifo',
    [UV_DIRENT_SOCKET]: 'socket',
    [UV_DIRENT_CHAR]: 'character',
    [UV_DIRENT_BLOCK]: 'block',
  };

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

  const stats2human = (stats) => ({
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

  class FileHandle {
    constructor(fd) {
      this[kFD] = fd;

      WeakRef(this, () => {
        close(this[kFD]);
      });
    }

    static async open(url, {
      read = true, // eslint-disable-line no-shadow
      write = true, // eslint-disable-line no-shadow
      append = false,
      create = false,
    } = {}) {
      const path = resolvePath(url);
      let mode = 0;

      if (read && write) {
        mode |= O_RDWR;
      } else if (read) {
        mode |= O_RDONLY;
      } else if (write) {
        mode |= O_WRONLY;
      }

      if (append) {
        mode |= O_APPEND;
      }

      if (create) {
        mode |= O_CREAT;
      }

      const fd = await open(path, mode, DEFAULT_MODE);

      return new FileHandle(fd);
    }

    async read({
      size = undefined,
      position = -1,
      encoding = undefined,
    } = {}) {
      if (size === undefined) {
        const stats = await fstat(this[kFD]);
        ({ size } = stats);
      }
      const buffer = await read(this[kFD], size, position);
      if (encoding !== undefined) {
        if (!decoders.has(encoding)) {
          decoders.set(encoding, new TextDecoder(encoding));
        }
        return decoders.get(encoding).decode(buffer);
      }
      return buffer;
    }

    async write(buffer, {
      position = -1,
    } = {}) {
      if (typeof buffer === 'string') {
        buffer = encoder.encode(buffer);
      }
      await write(this[kFD], position, buffer);
    }

    async stat() {
      const stats = await fstat(this[kFD]);
      return stats2human(stats);
    }

    async setDates({ accessDate, modificationDate }) {
      await futime(this[kFD], accessDate, modificationDate);
    }

    async close() {
      await close(this[kFD]);
    }
  }

  class FileWatcher {
    constructor(url, cb, {
      entryOnly = false,
      recursive = false,
    } = {}) {
      let flags = 0;
      if (entryOnly) {
        flags |= UV_FS_EVENT_WATCH_ENTRY;
      }
      if (recursive) {
        flags |= UV_FS_EVENT_RECURSIVE;
      }

      const path = resolvePath(url);

      this[kHandle] = eventStart(path, flags, (filename, event) => {
        cb(filename, [null, 'rename', 'change'][event]);
      });

      WeakRef(this, () => {
        this.stop();
      });
    }

    stop() {
      eventStop(this[kHandle]);
    }
  }

  defineIDLClass(FileSystemManager, undefined, {
    open: FileHandle.open,

    async readFile(url, options) {
      const handle = await FileHandle.open(url);
      const buf = await handle.read(options);
      await handle.close();
      return buf;
    },

    async writeFile(url, buffer, options) {
      const handle = await FileHandle.open(url);
      await handle.write(buffer, options);
      await handle.close();
    },
    async removeFile(url, {
      ignoreAbsent = false,
    } = {}) {
      const path = resolvePath(url);
      try {
        await unlink(path);
      } catch (e) {
        if (!ignoreAbsent || e.code !== 'ENOENT') {
          throw e;
        }
      }
    },

    async setDates(url, { accessDate, modificationDate }) {
      const path = resolvePath(url);
      await utime(path, accessDate, modificationDate);
    },
    // setPermissions(url, permissions) {},
    async stat(url) {
      const path = resolvePath(url);
      const stats = await stat(path);
      return stats2human(stats);
    },
    async copy(from, to, {
      noOverwrite = false,
    } = {}) {
      const fromPath = resolvePath(from);
      const toPath = resolvePath(to);
      await copy(fromPath, toPath, noOverwrite ? UV_FS_COPYFILE_EXCL : 0);
    },
    async move(from, to) {
      const fromPath = resolvePath(from);
      const toPath = resolvePath(to);
      await rename(fromPath, toPath);
    },
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
    watch(url, cb, options) {
      return new FileWatcher(url, cb, options);
    },

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
        await Promise.all(items.map(async ([name]) => {
          try {
            await unlink(name);
          } catch (e) {
            await this.removeDirectory(name, { recursive });
          }
        }));
      } else {
        await rmdir(path);
      }
    },
    async readDirectory(url) {
      const path = resolvePath(url);
      const entries = await scandir(path);
      return entries.map(([name, type]) => ({
        name,
        type: uvTypeToReadable[type],
      }));
    },
  });

  namespace.FileSystemManager = FileSystemManager;
  namespace.fileSystem = new FileSystemManager();
};
