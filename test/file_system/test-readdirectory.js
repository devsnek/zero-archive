import { pass, fail, assertEqual, fixtures } from '../common';

fileSystem.readDirectory(fixtures)
  .then((arr) => {
    const found = !!arr.find((i) => i.name === 'hello.txt' && i.type === 'file');
    assertEqual(found, true);
    pass();
  })
  .catch(fail);
