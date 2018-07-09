import { pass, fail, assertEqual, assertDeepEqual, fixtures } from '../common';

const url = new URL('hello.txt', fixtures);

Promise.all([
  fileSystem.readFile(url),
  fileSystem.readFile(url, { encoding: 'utf8' }),
]).then(([buf, str]) => {
  assertDeepEqual(buf, new Uint8Array([104, 101, 108, 108, 111, 10]));

  assertEqual(str, 'hello\n');

  pass();
}).catch(fail);
