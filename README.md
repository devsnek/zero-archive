# zero

zero is a JavaScript runtime which has native ES Modules and shares many
browser spec globals.

A lot of code in zero is inspired from other codebases. Those codebases will be
linked at the top of the individual files.

Check out the [0.0.1 Release Project][] for info on what needs to be done still.

### Finished APIs

- WHATWG Console
- WHATWG Events
- WHATWG Timers
- WHATWG URL
- WHATWG Encoding
- W3C Web Performance Timing API

[Web Platform Tests]: https://github.com/web-platform-tests/wpt

## Temp Docs

### FFI

- `new DyanmicLibrary(path, functions)`
  * `path` `{string|URL}` Path to dynamic library. If relative it will be resolved
    to the current working directory.
  * `functions` `{object}` Object of definitions for the exported functions
    from the dynamic library. These definitions take the form:
    `name: [ 'return type', ['argument', 'types'] ]`

#### `Types`
- `uint8`
- `int8`
- `uint16`
- `int16`
- `uint32`
- `int32`
- `uint64`
- `int64`
- `uchar`
- `char`
- `ushort`
- `short`
- `uint`
- `int`
- `float`
- `double`
- `ulonglong`
- `longlong`
- `pointer`
- `cstring`

All number types where the value may be greater than
`Number.MAX_SAFE_INTEGER` are represented with BigInts. Arguments to these
types may be passed as Numbers but they will be converted to BigInt and
return values will always be BigInt.

The only difference between `pointer` and `cstring` is that `pointer` returns
and takes a special `Pointer` type (that the user cannot construct), while
`cstring` will take the pointer and produce a string from it. `cstring` is
equivalent to `char*`

[0.0.1 Release Project]: https://github.com/devsnek/zero/projects/1?fullscreen=true
