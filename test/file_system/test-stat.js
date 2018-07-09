import { pass, fail, assertEqual, fixtures } from '../common';

fileSystem.stat(new URL('hello.txt', fixtures))
  .then((stats) => {
    assertEqual(stats.isDir, false);
    assertEqual(stats.isSymlink, false);

    assertEqual(stats.size, 6);

    assertEqual(typeof stats.lastAccessDate, 'bigint');
    assertEqual(typeof stats.lastModificationDate, 'bigint');

    assertEqual(typeof stats.unixOwner, 'number');
    assertEqual(typeof stats.unixGroup, 'number');
    assertEqual(typeof stats.unixMode, 'number');

    assertEqual(typeof stats.unixLastStatusChangeDate, 'bigint');

    pass();
  })
  .catch(fail);
