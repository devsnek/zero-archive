const { ffi: { CIF, types, dlopen } } = edge;


const f = new CIF(dlopen, types.pointer, [types.pointer]);

console.log(f);
