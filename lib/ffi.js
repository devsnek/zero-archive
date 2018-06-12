'use strict';

({ binding, load, process }) => {
  const ffi = binding('ffi');
  Object.setPrototypeOf(ffi.types, null);

  function CFI(fn, returnType, argTypes) {
    const atypes = new Uint8Array(argTypes.length * ffi.ffi_type_size);
    argTypes.forEach((arg, i) => {
      const t = ffi.types[arg];
      ffi.writePointer(atypes, i * ffi.ffi_arg_size, t);
    });

    const cif = new Uint8Array(ffi.ffi_cif_size);

    ffi.ffi_prep_cif(cif, argTypes.length, ffi.types[returnType], atypes);

    return (...args) => {
      const ab = new Uint8Array(args.length * ffi.ffi_arg_size);
      args.forEach((arg, i) => {
        const typeName = argTypes[i];
        const type = ffi.types[typeName];
        const p = new Uint8Array(ffi.sizeof[typeName]);
        const view = new DataView(p.buffer);
        if (type === ffi.types.int) {
          view.setUint32(0, arg);
        } else if (type === ffi.types.char) {
          view.setUint8(0, arg);
        } else if (type === ffi.types.pointer) {
          if (typeof arg === 'string') {
            const b = new TextEncoder().encode(arg + '\0');
            ffi.writePointer(ab, i * ffi.ffi_arg_size, b);
            return;
          }
        }
        ffi.writePointer(ab, i * ffi.ffi_arg_size, p);
      });

      const ret = new Uint8Array(ffi.sizeof[returnType]);

      ffi.ffi_call(cif, fn, ret, ab);

      if (ffi.types[returnType] === ffi.types.int) {
        return new DataView(ret.buffer).getUint32(0);
      }

      if (ffi.types[returnType] === ffi.types.char) {
        return new DataView(ret.buffer).getUint8(0);
      }
    };
  }

  const dlopen = CFI(ffi.dlopen, 'pointer', ['pointer']);
  const dlsym = CFI(ffi.dlsym, 'pointer', ['pointer', 'pointer']);
  const dlerror = CFI(ffi.dlerror, 'void', []);
  // const dlclose = CFI(ffi.dlclose, 'void', ['pointer']);

  const loadDynamicLibrary = async (url, functions) => {
    const { getURLFromFilePath, getFilePathFromURL, URL } = load('whatwg/url');
    const file = getFilePathFromURL(new URL(url, `${getURLFromFilePath(process.cwd)}/`));

    const handle = dlopen(file);
    dlerror();

    const o = {};
    Object.keys(functions).forEach((name) => {
      const ptr = dlsym(handle, name);
      const [ret, args] = functions[name];
      const fn = CFI(ptr, ret, args);
      o[name] = fn;
    });

    return o;
  };

  global.edge.loadDynamicLibrary = loadDynamicLibrary;
  global.edge.test = CFI(ffi.test, 'int', ['pointer']);
};
