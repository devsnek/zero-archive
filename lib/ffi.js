'use strict';

({ binding, PrivateSymbol: PS, kCustomInspect }) => {
  const ffi = binding('ffi');
  Object.setPrototypeOf(ffi.types, null);

  const kName = PS();
  const kType = PS();

  class Type {
    constructor() {
      this[kName] = undefined;
      this[kType] = undefined;

      this[kCustomInspect] = () => `Type { ${this[kName]} }`;
    }

    get name() {
      return this[kName];
    }
  }

  const makeType = (name, type) => {
    const t = new Type();
    t[kName] = name;
    t[kType] = type;
    return t;
  };

  const types = {};
  Object.keys(ffi.types).forEach((name) => {
    types[name] = makeType(name, ffi.types[name]);
  });

  class PointerBuffer extends Uint8Array {
    writePointer(ptr, offset) {
      ffi.writePointer(this, ptr, offset);
    }
  }

  function CFI(fn, returnType, argTypes) {
    const cfi = new PointerBuffer();

    const atypes = new PointerBuffer(argTypes.length * ffi.types.pointer.size);
    argTypes.forEach((arg, i) => {
      const t = arg[kType];
      atypes.writePointer(t, i * ffi.types.pointer.size);
    });

    ffi.ffi_prep_cfi(cfi, returnType[kType], atypes);

    const wrap = () => 0;
    Object.setPrototypeOf(wrap, null);
    return new Proxy(wrap, {
      apply(_, __, args) {
        const ret = new PointerBuffer(returnType[kType].size);
        const ab = new PointerBuffer();
        args.forEach((arg, i) => {
          const type = argTypes[i][kType];
          if (type === ffi.types.uint8) {
            ab[i] = arg;
          }
        });
        ffi.ffi_call(cfi, fn, ret, ab);
      },
    });
  }

  global.edge.ffi = {
    CFI,
    types,
  };
};
