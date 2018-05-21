'use strict';

({ namespace }) => {
  const grammar = [
    ['string', /^[^\\]?(".+?[^\\]")/],
    ['string', /^[^\\]?('.+?[^\\]')/],
    ['string', /^[^\\]?(`(.|\n)+?[^\\]`)/],
    ['bigint', /^(\d+n)/],
    ['number', /^(\d+)/],
    ['boolean', /^(true|false)/],
    ['null', /^(null)/],
  ];

  const ansi = Object.assign(Object.create(null), {
    bold: [1, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    white: [37, 39],
    grey: [90, 39],
    black: [30, 39],
    blue: [34, 39],
    cyan: [36, 39],
    green: [32, 39],
    magenta: [35, 39],
    red: [31, 39],
    yellow: [33, 39],
  });

  const styles = Object.assign(Object.create(null), {
    special: 'cyan',
    bigint: 'blue',
    number: 'blue',
    boolean: 'yellow',
    undefined: 'grey',
    null: 'bold',
    string: 'green',
    symbol: 'green',
    date: 'magenta',
    regexp: 'red',
  });

  const stylize = (str, styleName) => {
    const style = styles[styleName];
    if (style !== undefined) {
      const [start, end] = ansi[style];
      return `\u001b[${start}m${str}\u001b[${end}m`;
    }
    return str;
  };

  const highlight = (str) => {
    let out = '';
    while (str.length) {
      let matched;
      for (const [name, regex] of grammar) {
        const m = regex.exec(str);
        if (m) {
          if (m[0] !== m[1]) {
            const ins = m[0].split(m[1]);
            out += ins[0];
            out += stylize(m[1], name);
            if (ins[1]) {
              out += ins[1];
            }
          } else {
            out += stylize(m[1], name);
          }
          str = str.replace(m[0], '');
          break;
        }
      }
      if (!matched && str.length) {
        out += str[0];
        str = str.slice(1);
      }
    }
    return out;
  };

  namespace.highlight = highlight;
};
