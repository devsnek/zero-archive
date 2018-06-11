const { ffi } = edge;

const dlopencif = ffi.prefCif(ffi.FFI_DEFAULT_ABI, 1, ffi.types.pointer, [ffi.types.char]);

const cif = ffi.prefCif(ffi.FFI_DEFAULT_ABI, 1, ffi.types.uint64, [ffi.types.int]);

const fiblibptr = ffi.call(dlopencif, ffi.dlopen, ['./fibonnaci.dylib']);
