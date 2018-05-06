'use strict';

({ namespace, binding }) => {
  const { now, timeOrigin } = binding('performance');

  namespace.now = now;
  namespace.timeOrigin = timeOrigin;
};
