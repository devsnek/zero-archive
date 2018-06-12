'use strict';

({ binding, load, process }) => {
  const ffi = binding('ffi');
  Object.setPrototypeOf(ffi.types, null);

  function CFI(fn, returnType, argTypes) {
    const atypes = new Uint8Array(argTypes.length * ffi.types.pointer.size);
    argTypes.forEach((arg, i) => {
      const t = ffi.types[arg];
      ffi.writePointer(atypes, t, i * ffi.types.pointer.size);
    });

    const cif = new Uint8Array();

    ffi.ffi_prep_cif(cif, argTypes.length, ffi.types[returnType], atypes);

    return (...args) => {
      const ab = new Uint8Array();
      /*
      args.forEach((arg, i) => {
        const type = argTypes[i][kType];
        if (type === ffi.types.uint8) {
          ab[i] = arg;
        }
      });
      */

      const ret = new Uint8Array(ffi.types[returnType].size);
      ffi.ffi_call(cif, fn, ret, ab);
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
};
