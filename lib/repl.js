'use strict';

({ namespace, process, load, binding }) => {
  /* eslint-disable no-console */

  const prompt = '> ';
  const { TTYWrap } = binding('tty');
  const ScriptWrap = binding('script_wrap');
  const { cursorTo, CSI, emitKeys } = load('tty');

  let buffer = '';
  let cursor = 0;
  const history = [];
  let historyIndex = 0;

  const moveCursor = (x) => {
    if ((cursor + x < 0) || (cursor + x > buffer.length)) {
      return;
    }
    cursor += x;
    cursorTo(this.stdout, cursor);
  };

  const refresh = () => {
    cursorTo(process.stdout, 0);
    process.stdout.write(CSI.kClearScreenDown);
    process.stdout.write(prompt + buffer);
    cursorTo(process.stdout, cursor + prompt.length);
  };

  Object.defineProperty(global, '_', {
    enumerable: false,
    writable: true,
    configurable: true,
  });

  const run = (s) => {
    const res = ScriptWrap.run('[repl]', s);
    global._ = res;
    return res;
  };

  const onLine = () => {
    try {
      process.stdout.write('\n');
      history.unshift(buffer);
      historyIndex = 0;
      try {
        console.log(run(`(${buffer})`));
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.log(run(buffer));
        } else {
          throw err;
        }
      }
      buffer = '';
    } catch (err) {
      console.error(err);
    } finally {
      buffer = '';
      cursor = 0;
      process.stdout.write(prompt);
    }
  };

  const write = (s) => {
    if (cursor < buffer.length) {
      const beg = buffer.slice(0, cursor);
      const end = buffer.slice(cursor, buffer.length);
      buffer = beg + s + end;
      cursor += s.length;
      refresh();
    } else {
      buffer += s;
      cursor += s.length;
      process.stdout.write(s);
      refresh();
    }
  };

  let stop = false;
  let closeOnThisOne = false;
  function start() {
    const decoder = emitKeys((s, key) => {
      if (key.ctrl || key.meta) {
        if (key.name === 'c' || key.name === 'd') {
          if (closeOnThisOne) {
            stdin.end(); // eslint-disable-line no-use-before-define
            stop = true;
          } else {
            console.log(`\n(To exit, press ^${key.name.toUpperCase()} again or call exit)`);
            buffer = '';
            cursor = 0;
            closeOnThisOne = true;
          }
        }
        return;
      }
      if (closeOnThisOne) {
        process.stdout.write(`\n${prompt}`);
        cursor = 0;
        closeOnThisOne = false;
      }
      switch (key.name) {
        case 'up': {
          const target = history[historyIndex];
          if (target) {
            buffer = target;
            historyIndex += 1;
            cursor = target.length;
            refresh();
          }
          break;
        }
        case 'down': {
          historyIndex -= 1;
          const target = history[historyIndex];
          if (target) {
            buffer = target;
            cursor = target.length;
            refresh();
          } else {
            buffer = '';
            cursor = 0;
            refresh();
          }
          break;
        }
        case 'left':
          moveCursor(-1);
          refresh();
          break;
        case 'right':
          moveCursor(1);
          refresh();
          break;
        case 'backspace':
        case 'delete':
          if (cursor === 0) {
            break;
          }
          buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor, buffer.length);
          moveCursor(-1);
          refresh();
          break;
        default: {
          if (s) {
            const lines = s.split(/\r\n|\n|\r/);
            for (let i = 0; i < lines.length; i += 1) {
              if (i > 0) {
                onLine();
              }
              write(lines[i]);
            }
          }
        }
      }
    });
    const stdin = new TTYWrap(0, (data) => {
      if (stop) {
        decoder.return();
        return;
      }
      for (let i = 0; i < data.length; i += 1) {
        decoder.next(data[i]);
      }
    });
    decoder.next(''); // TODO(devsnek): make it so i don't need this
    if (process.argv['expose-binding']) {
      global.binding = binding;
    }
    process.stdout.write(prompt);
  }

  namespace.start = start;
};
