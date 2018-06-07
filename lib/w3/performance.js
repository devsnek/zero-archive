'use strict';

({ namespace, binding, load }) => {
  const { now, timeOrigin } = binding('performance');
  const { defineIDLClass } = load('util');

  class Performance {}

  defineIDLClass(Performance, 'Performance', {
    now,
    timeOrigin,
  });

  namespace.Performance = Performance;
};
