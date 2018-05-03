'use strict';

({ namespace, process, load, binding }) => {
  /* eslint-disable no-console */

  const prompt = '> ';
  const { TTYWrap } = binding('tty');
  const ScriptWrap = binding('script_wrap');
  const { cursorTo, emitKeys, CSI } = load('tty');

  let buffer = '';
  const history = [];

  const refresh = () => {
    cursorTo(0, 0); // lolno
    process.stdout.write(CSI.kClearScreenDown);
    process.stdout.write(buffer);
  };

  const onLine = () => {
    try {
      try {
        console.log(ScriptWrap.run('repl', `(${buffer})`));
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.log(ScriptWrap.run('repl', buffer));
        } else {
          throw err;
        }
      }
      history.unshift(buffer);
      buffer = '';
    } catch (err) {
      console.error(err);
    } finally {
      buffer = '';
      process.stdout.write(prompt);
    }
  };

  function start() {
    const decoder = emitKeys((s, key) => {
      if (key.ctrl || key.meta) {
        if (key.name === 'c' || key.name === 'd') {
          process.exit();
        }
        return;
      }
      switch (key.name) {
        case 'up':
          break;
        case 'down':
          break;
        case 'left':
          break;
        case 'right':
          break;
        case 'backspace':
        case 'delete':
          buffer = buffer.slice(0, buffer.length - 1);
          refresh();
          break;
        default: {
          if (s) {
            const lines = s.split(/\r\n|\n|\r/);
            for (let i = 0; i < lines.length; i += 1) {
              if (i > 0) {
                process.stdout.write('\n');
                onLine();
              }
              process.stdout.write(lines[i]);
              buffer += lines[i];
            }
          }
        }
      }
    });
    const stdin = new TTYWrap(0, (data) => {
      for (let i = 0; i < data.length; i += 1) {
        decoder.next(data[i]);
      }
    });
    global.exit = () => stdin.end();
    process.stdout.write(prompt);
  }

  namespace.start = start;
};
