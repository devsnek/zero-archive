'use strict';

({ binding }) => {
  const ffi = binding('ffi');

  // FIXME: make wrapper around ffi
  global.edge.ffi = ffi;
};
