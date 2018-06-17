import { assertEqual } from '../common.js';

const lib = new DynamicLibrary(new URL('./libfibonacci.dylib', import.meta.url), {
  fibonacci: ['uint64', ['int']],
});

const n = lib.fibonacci(10);
console.log(n);
assertEqual(n, 55n);
