'use strict';

({ binding, load, process, PrivateSymbol: PS }) => {
  const { isLittleEndian } = process;

  const ffi = binding('ffi');
  Object.setPrototypeOf(ffi.types, null);

  ffi.types.void.wrap = () => {};
  ffi.types.void.unwrap = () => undefined;

  ffi.types.uint8.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.uint8);
    new DataView(a.buffer).setUint8(0, value, isLittleEndian);
    return a;
  };
  ffi.types.uint8.unwrap = (a) =>
    new DataView(a.buffer).getUint8(0, isLittleEndian);

  ffi.types.int8.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.int8);
    new DataView(a.buffer).setInt8(0, value, isLittleEndian);
    return a;
  };
  ffi.types.int8.unwrap = (a) =>
    new DataView(a.buffer).getInt8(0, isLittleEndian);

  ffi.types.uint16.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.uint16);
    new DataView(a.buffer).writeUint16(0, value, isLittleEndian);
    return a;
  };
  ffi.types.uint16.unwrap = (a) =>
    new DataView(a.buffer).getUint16(0, isLittleEndian);

  ffi.types.int16.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.int16);
    new DataView(a.buffer).writeInt16(0, value, isLittleEndian);
    return a;
  };
  ffi.types.int16.unwrap = (a) =>
    new DataView(a.buffer).getInt16(0, isLittleEndian);

  ffi.types.uint32.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.uint);
    new DataView(a.buffer).setUint32(0, value, isLittleEndian);
    return a;
  };
  ffi.types.uint32.unwrap = (a) =>
    new DataView(a.buffer).getUint32(0, isLittleEndian);

  ffi.types.int32.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.int);
    new DataView(a.buffer).setInt32(0, value, isLittleEndian);
    return a;
  };
  ffi.types.int32.unwrap = (a) =>
    new DataView(a.buffer).getInt32(0, isLittleEndian);

  ffi.types.uchar.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.uchar);
    new DataView(a.buffer).setUint8(0, value, isLittleEndian);
    return a;
  };
  ffi.types.uchar.unwrap = (a) =>
    new DataView(a.buffer).getUint8(0, isLittleEndian);

  ffi.types.char.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.char);
    new DataView(a.buffer).setInt8(0, value, isLittleEndian);
    return a;
  };
  ffi.types.char.unwrap = (a) =>
    new Uint8Array(a.buffer).getInt8(0, isLittleEndian);

  ffi.types.ushort.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.ushort);
    new DataView(a.buffer).setUint16(0, value, isLittleEndian);
    return a;
  };
  ffi.types.ushort.unwrap = (a) =>
    new DataView(a.buffer).getUint16(0, isLittleEndian);

  ffi.types.short.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.short);
    new DataView(a.buffer).setInt16(0, value, isLittleEndian);
    return a;
  };
  ffi.types.short.unwrap = (a) =>
    new DataView(a.buffer).getInt16(0, isLittleEndian);

  ffi.types.uint.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.uint);
    new DataView(a.buffer).setUint32(0, value, isLittleEndian);
    return a;
  };
  ffi.types.uint.unwrap = (a) =>
    new DataView(a.buffer).getUint32(0, isLittleEndian);

  ffi.types.int.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.int);
    new DataView(a.buffer).setInt32(0, value, isLittleEndian);
    return a;
  };
  ffi.types.int.unwrap = (a) =>
    new DataView(a.buffer).getInt32(0, isLittleEndian);

  ffi.types.float.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.float);
    new DataView(a.buffer).setFloat32(0, value, isLittleEndian);
  };
  ffi.types.float.unwrap = (a) =>
    new DataView(a.buffer).getFloat32(0);

  ffi.types.double.wrap = (value) => {
    const a = new Uint8Array(ffi.sizeof.double);
    new DataView(a.buffer).setFloat64(0, value, isLittleEndian);
    return a;
  };
  ffi.types.double.unwrap = (a) =>
    new DataView(a.buffer).getFloat64(0, isLittleEndian);

  const makeNumberWrapper = (type) =>
    (value) => {
      value = BigInt(value);
      const a = new Uint8Array(ffi.sizeof[type]);
      let i = 0;
      while (value > 0n) {
        if (i > ffi.sizeof[type]) {
          throw new RangeError();
        }
        a[i] = Number(value & 0xFFn);
        i += 1;
        value >>= 8n;
      }
      return a;
    };

  const makeNumberUnwrapper = () =>
    (a) => {
      let value = 0n;
      let b = 1n;
      for (let i = 0; i < a.length; i += 1) {
        const digit = BigInt(a[i]);
        value += digit * b;
        b <<= 8n;
      }
      return value;
    };

  ffi.types.uint64.wrap = makeNumberWrapper('uint64');
  ffi.types.uint64.unwrap = makeNumberUnwrapper('uint64');

  ffi.types.int64.wrap = makeNumberWrapper('int64');
  ffi.types.int64.unwrap = makeNumberUnwrapper('int64');

  ffi.types.ulonglong.wrap = makeNumberWrapper('ulonglong');
  ffi.types.longlong.wrap = makeNumberWrapper('longlong');

  const kInternalPointer = PS('kInternalPointer');

  ffi.types.pointer.wrap = (value) => {
    if (value === null) {
      return new Uint8Array(ffi.sizeof.pointer);
    }
    if (typeof value === 'string') {
      const ptr = new Uint8Array(ffi.sizeof.pointer);
      const { TextEncoder } = load('whatwg/encoding');
      const cstr = new TextEncoder().encode(`${value}\0`);
      ffi.writePointer(ptr, 0, cstr);
      return ptr;
    }
    if (value[kInternalPointer]) {
      return value[kInternalPointer];
    }
    throw new TypeError('invalid pointer');
  };
  ffi.types.pointer.unwrap = (a) => {
    const x = Object.create(null, {
      [Symbol.toStringTag]: {
        value: 'Pointer',
        configurable: false,
        enumerable: false,
        writable: false,
      },
      isNull: {
        value: () => a.every((b) => b === 0),
        enumerable: false,
        writable: false,
        configurable: false,
      },
    });
    x[kInternalPointer] = a;
    return Object.freeze(x);
  };

  ffi.types.cstring.wrap = ffi.types.pointer.wrap;
  ffi.types.cstring.unwrap = (a) => {
    if (a.every((b) => b === 0)) {
      return null;
    }
    return ffi.readCString(a, 0);
  };

  function CFI(fn, returnType, argTypes) {
    const atypes = new Uint8Array(argTypes.length * ffi.ffi_type_size);
    argTypes.forEach((arg, i) => {
      const t = ffi.types[arg];
      ffi.writePointer(atypes, i * ffi.ffi_arg_size, t);
    });

    const cif = new Uint8Array(ffi.ffi_cif_size);

    ffi.ffi_prep_cif(cif, argTypes.length, ffi.types[returnType], atypes);

    if (fn[kInternalPointer]) {
      fn = fn[kInternalPointer];
    }

    return (...args) => {
      if (args.length !== argTypes.length) {
        throw new RangeError('invalid arguments');
      }

      const ab = new Uint8Array(args.length * ffi.ffi_arg_size);
      args.forEach((arg, i) => {
        const type = ffi.types[argTypes[i]];
        ffi.writePointer(ab, i * ffi.ffi_arg_size, type.wrap(arg));
      });

      const ret = new Uint8Array(ffi.sizeof.pointer);
      ffi.ffi_call(cif, fn, ret, ab);

      return ffi.types[returnType].unwrap(ret);
    };
  }

  let lazyURL;
  function DynamicLibrary(file, functions) {
    if (new.target !== DynamicLibrary) {
      throw new Error('invalid class constructor');
    }

    if (file !== null) {
      if (lazyURL === undefined) {
        lazyURL = load('whatwg/url');
      }
      const { getURLFromFilePath, getFilePathFromURL, URL } = lazyURL;
      if (typeof file === 'string' && file[0] === '.') {
        file = getFilePathFromURL(new URL(file, `${getURLFromFilePath(process.cwd)}/`));
      } else if (file instanceof URL) {
        file = getFilePathFromURL(file);
      }
    }

    const funcNames = Object.keys(functions);
    const pointers = ffi.dlopen(file, funcNames);

    if (typeof pointers === 'string') {
      throw new Error(pointers);
    }

    const o = {};
    pointers.forEach((ptr, i) => {
      const name = funcNames[i];
      const [ret, args] = functions[name];
      const fn = CFI(ptr, ret, args);
      o[name] = fn;
    });

    return o;
  }

  Object.defineProperty(global, 'DynamicLibrary', {
    value: DynamicLibrary,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};
