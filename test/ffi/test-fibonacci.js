import { assertEqual } from '../common.js';

// build-shared ./fibonacci.c

const lib = new DynamicLibrary(new URL('./libfibonacci.shared', import.meta.url), {
  fibonacci: ['uint64', ['int']],
});

assertEqual(lib.fibonacci(10), 55n);
