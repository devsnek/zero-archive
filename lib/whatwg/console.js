'use strict';

({ load, namespace, PrivateSymbol, binding, process }) => {
  const { format } = load('util');
  const performance = load('w3/performance');
  const { table: cliTable } = load('util/cli_table');
  const { defineIDLClass } = load('util');
  const { kNoErrorFormat } = load('errors');

  const kStdout = PrivateSymbol('stdout');
  const kStderr = PrivateSymbol('stderr');
  const kCounts = PrivateSymbol('counts');
  const kTimers = PrivateSymbol('timers');
  const kGroupIndent = PrivateSymbol('groupIndent');
  const kPrint = PrivateSymbol('print');

  const toStderr = ['error', 'warn', 'assert'];

  const keyKey = 'Key';
  const valuesKey = 'Values';
  const indexKey = '(index)';
  const iterKey = '(iteration index)';

  const {
    isTypedArray,
    isMap,
    isSet,
    isWeakSet,
    isWeakMap,
    isMapIterator,
    isSetIterator,
  } = binding('types');
  const { previewEntries } = binding('util');

  const isArray = (v) => Array.isArray(v) || isTypedArray(v);

  const color = !!process.stdout.isTTY;

  class Console {
    constructor(stdout, stderr) {
      this[kStdout] = stdout;
      this[kStderr] = stderr;

      this[kCounts] = new Map();
      this[kTimers] = new Map();

      this[kGroupIndent] = 0;

      this[kPrint] = (level, args) => {
        let message = format({ color }, ...args);

        const indent = this[kGroupIndent];
        if (indent > 0) {
          const i = '  '.repeat(indent);
          if (/\n/g.test(message)) {
            message = message.replace(/\n/g, `\n${i}`);
          }
          message = `${i}${message}`;
        }

        message += '\n';

        if (toStderr.includes(level)) {
          this[kStderr].write(message);
        } else {
          this[kStdout].write(message);
        }
      };

      this.assert = this.assert.bind(this);

      this.count = this.count.bind(this);
      this.countReset = this.countReset.bind(this);

      this.debug = this.debug.bind(this);

      this.error = this.error.bind(this);

      this.info = this.info.bind(this);

      this.log = this.log.bind(this);

      this.table = this.table.bind(this);

      this.trace = this.trace.bind(this);

      this.warn = this.warn.bind(this);

      this.dirxml = this.dirxml.bind(this);

      this.group = this.group.bind(this);
      this.groupCollapsed = this.groupCollapsed.bind(this);
      this.groupEnd = this.groupEnd.bind(this);

      this.time = this.time.bind(this);
      this.timeEnd = this.timeEnd.bind(this);
    }
  }

  defineIDLClass(Console, 'Console', {
    assert(condition, ...data) {
      if (condition) {
        return;
      }

      const message = 'Assertion failed';

      if (data.length === 0) {
        data.push(message);
      } else {
        const first = data[0];
        if (typeof first !== 'string') {
          data.unshift(message);
        } else {
          const concat = `${message}: ${first}`;
          data[0] = concat;
        }
      }

      this[kPrint]('assert', data);
    },

    clear() {
      if (this[kStdout].isTTY) {
        const { cursorTo, CSI } = load('tty');
        cursorTo(this[kStdout], 0, 0);
        this[kStdout].write(CSI.kClearScreenDown);
      }
    },

    count(label = 'default') {
      label = `${label}`;
      const count = this[kCounts].get(label);
      if (count) {
        this[kCounts].set(label, count + 1);
      } else {
        this[kCounts].set(label, 1);
      }

      this[kPrint]('count', [`${label}: ${count + 1 || 1}`]);
    },

    countReset(label = 'default') {
      label = `${label}`;
      if (this[kCounts].has(label)) {
        this[kCounts].delete(label);
      } else {
        this[kPrint]('count', [`No count available for ${label}`]);
      }
    },

    debug(...data) {
      this[kPrint]('debug', data);
    },

    error(...data) {
      this[kPrint]('error', data);
    },

    info(...data) {
      this[kPrint]('info', data);
    },

    log(...data) {
      this[kPrint]('log', data);
    },

    table(tabularData, properties) {
      if (tabularData == null || typeof tabularData !== 'object') {
        return this[kPrint]('log', [tabularData]);
      }

      const final = (k, v) => this[kPrint]('log', [cliTable(k, v)]);
      const inspect = (v) => {
        const opt = { depth: 0, maxArrayLength: 3 };
        if (v !== null && typeof v === 'object' &&
          !isArray(v) && Object.keys(v).length > 2) {
          opt.depth = -1;
        }
        return format({ color }, v);
      };

      const getIndexArray = (length) => Array.from({ length }, (_, i) => format({ color }, i));

      const mapIter = isMapIterator(tabularData);
      if (mapIter) {
        tabularData = previewEntries(tabularData);
      }

      if (mapIter || isMap(tabularData) || isWeakMap(tabularData)) {
        const keys = [];
        const values = [];
        let length = 0;
        for (const [k, v] of tabularData) {
          keys.push(inspect(k));
          values.push(inspect(v));
          length += 1;
        }
        return final([
          iterKey, keyKey, valuesKey,
        ], [
          getIndexArray(length),
          keys,
          values,
        ]);
      }

      const setIter = isSetIterator(tabularData);
      if (setIter) {
        tabularData = previewEntries(tabularData);
      }

      const setlike = setIter || isSet(tabularData) || isWeakSet(tabularData);
      if (setlike) {
        const values = [];
        let length = 0;
        for (const v of tabularData) {
          values.push(inspect(v));
          length += 1;
        }
        return final([setlike ? iterKey : indexKey, valuesKey], [
          getIndexArray(length),
          values,
        ]);
      }

      const map = {};
      let hasPrimitives = false;
      const valuesKeyArray = [];
      const indexKeyArray = Object.keys(tabularData);

      for (let i = 0; i < indexKeyArray.length; i += 1) {
        const item = tabularData[indexKeyArray[i]];
        const primitive = item === null ||
        (typeof item !== 'function' && typeof item !== 'object');
        if (properties === undefined && primitive) {
          hasPrimitives = true;
          valuesKeyArray[i] = inspect(item);
        } else {
          const keys = properties || Object.keys(item);
          for (const key of keys) {
            if (map[key] === undefined) {
              map[key] = [];
            }
            if ((primitive && properties) || !hasOwnProperty(item, key)) {
              map[key][i] = '';
            } else {
              map[key][i] = item == null ? item : inspect(item[key]);
            }
          }
        }
      }

      const keys = Object.keys(map);
      const values = Object.values(map);
      if (hasPrimitives) {
        keys.push(valuesKey);
        values.push(valuesKeyArray);
      }
      keys.unshift(indexKey);
      values.unshift(indexKeyArray);

      final(keys, values);
    },

    trace(...data) {
      const err = {
        name: 'Trace',
        message: format({ color }, ...data),
        [kNoErrorFormat]: true,
      };
      Error.captureStackTrace(err, this.trace);
      this[kPrint]('trace', [err.stack]);
    },

    warn(...data) {
      this[kPrint]('warn', data);
    },

    dir(item) {
      this[kPrint]('dir', [item]);
    },

    dirxml(...data) {
      this[kPrint]('dirxml', data);
    },

    group(...data) {
      if (data.length > 0) {
        this[kPrint]('group', data);
      }
      this[kGroupIndent] += 1;
    },

    groupCollapsed(...data) {
      return Reflect.apply(this.group, this, data);
    },

    groupEnd() {
      this[kGroupIndent] -= 1;
    },

    time(label = 'default') {
      label = `${label}`;
      if (this[kTimers].has(label)) {
        return;
      }
      this[kTimers].set(label, performance.now());
    },

    timeEnd(label = 'default') {
      label = `${label}`;
      if (!this[kTimers].has(label)) {
        return;
      }
      const time = this[kTimers].get(label);
      this[kTimers].delete(label);
      const duration = performance.now() - time;
      this[kPrint]('timeEnd', [`${label}: ${duration.toFixed(3)}ms`]);
    },
  });

  namespace.Console = Console;
};
