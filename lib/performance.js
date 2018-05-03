'use strict';

({ namespace, binding }) => {
  const { hrtime } = binding('performance');

  const hrValues = new Uint32Array(3);

  namespace.now = () => {
    hrtime(hrValues);
    return (((hrValues[0] * 0x100000000) + hrValues[1]) * 1000) + (hrValues[2] / 1e6);
  };
};
