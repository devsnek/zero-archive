import { pass, fail, assertEqual, fixtures } from '../common';

fileSystem.readDirectory(fixtures)
  .then((arr) => {
    assertEqual(arr.includes('hello.txt'), true);
    pass();
  })
  .catch(fail);
