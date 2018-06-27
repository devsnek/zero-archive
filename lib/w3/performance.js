'use strict';

({ namespace, binding, load, PrivateSymbol: PS }) => {
  const {
    now,
    timeOrigin,
  } = binding('performance');
  const { defineIDLClass } = load('util');

  const kMarks = PS('kMarks');
  const kName = PS('kName');
  const kEntryType = PS('kEntryType');
  const kStartTime = PS('kStartTime');
  const kEndTime = PS('kEndTime');

  class PerformanceTiming {}
  defineIDLClass(PerformanceTiming, 'PerformanceTiming', {});

  class PerformanceEntry {
    constructor() {
      this[kName] = undefined;
      this[kEntryType] = undefined;
      this[kStartTime] = undefined;
      this[kEndTime] = undefined;
    }
  }
  defineIDLClass(PerformanceEntry, 'PerformanceEntry', {
    get name() {
      return this[kName];
    },
    get entryType() {
      return this[kEntryType];
    },
    get startTime() {
      return this[kStartTime];
    },
    get duration() {
      return this[kEndTime] - this[kStartTime];
    },
  });

  const makeEntry = (name, type, start, end) => {
    const e = new PerformanceEntry();
    e[kName] = name;
    e[kEntryType] = type;
    e[kStartTime] = start;
    e[kEndTime] = end;
    return e;
  };

  class Performance {
    constructor() {
      this[kMarks] = new Map();
    }
  }

  defineIDLClass(Performance, undefined, {
    now,
    timeOrigin,
    timing: new PerformanceTiming(),
    mark(name) {
      name = `${name}`;
      const n = now();
      this[kMarks].set(name, makeEntry(name, 'mark', n, n));
    },
    measure(name, startMark, endMark) {
      name = `${name}`;
      startMark = startMark !== undefined ? `${startMark}` : undefined;
      endMark = `${endMark}`;

      const marks = this[kMarks];
      if (!marks.has(endMark)) {
        throw new Error('Invalid performance mark');
      }

      let startTimestamp = timeOrigin;
      const start = marks.get(startMark);
      if (start && start[kStartTime] !== 0) {
        startTimestamp = start[kStartTime];
      } else {
        // check timing, currently noop
      }

      const endTimestamp = marks.get(endMark)[kStartTime];
      return makeEntry(name, 'measure', startTimestamp, endTimestamp);
    },
    clearMarks(name) {
      if (name !== undefined) {
        name = `${name}`;
        this[kMarks].delete(name);
      } else {
        this[kMarks].clear();
      }
    },
  });

  namespace.Performance = Performance;
};
