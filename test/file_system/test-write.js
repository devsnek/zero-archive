import { pass, fail, assertEqual } from '../common';

const content = 'HELLO ZERO';
const path = '/tmp/zero_test.txt';

fileSystem.writeFile(path, content)
  .then(async () => {
    assertEqual(await fileSystem.exists(path), true);

    assertEqual(await fileSystem.readFile(path, { encoding: 'utf8' }), content);

    pass();
  })
  .catch(fail);
