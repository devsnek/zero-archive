import '../common.js';

const lib = new DynamicLibrary(null, { exit: ['void', ['int']] });

lib.exit(0);
