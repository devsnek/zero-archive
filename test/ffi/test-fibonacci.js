const lib = edge.loadDynamicLibrary('./fibonacci.dylib', {
  fibonacci: ['uint64', ['int']],
});

console.log(lib);
console.log(lib.fibonacci(4));
