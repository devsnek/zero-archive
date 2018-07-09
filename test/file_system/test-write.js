import { pass, fail, assertEqual, fixtures } from '../common';

const content = 'HELLO ZERO';
const path = new URL('fs_write_output.txt', fixtures);

fileSystem.writeFile(path, content)
  .then(async () => {
    assertEqual(await fileSystem.exists(path), true);

    assertEqual(await fileSystem.readFile(path, { encoding: 'utf8' }), content);

    pass();
  })
  .catch(fail);
