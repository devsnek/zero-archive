import { assertEqual } from '../common.js';

const lib = new DynamicLibrary(new URL('./libfibonacci.dylib', import.meta.url), {
  fibonacci: ['uint64', ['int']],
});

assertEqual(lib.fibonacci(10), 55n);
