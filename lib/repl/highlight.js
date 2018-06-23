'use strict';

({ namespace }) => {
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
    bigint: 'blue',
    number: 'blue',
    boolean: 'yellow',
    undefined: 'grey',
    null: 'bold',
    string: 'green',
    regexp: 'red',
    function: 'green',
    return: 'yellow',
    fn_internal: 'red',
    modifier: 'yellow',
    variable: 'magenta',
    branch: 'magenta',
  });

  const stylize = (str, styleName) => {
    const style = styles[styleName];
    if (style !== undefined) {
      const [start, end] = ansi[style];
      return `\u001b[${start}m${str}\u001b[${end}m`;
    }
    return str;
  };

  const grammar = [
    ['string', /^("")/],
    ['string', /^('')/],
    ['string', /^(``)/],
    ['string', /^[^\\]?(".*?[^\\]?")/],
    ['string', /^[^\\]?('.*?[^\\]?')/],
    ['string', /^[^\\]?(`(.|\n)*?[^\\]?`)/],
    ['bigint', /^\b(\d+n)\b/],
    ['number', /^\b(\d+)\b/],
    ['boolean', /^(true|false)/],
    ['null', /^(null)/],
    ['undefined', /^(undefined)/],
    ['regexp', /^(\/.+?\/[gmiyus]*)/],
    ['function', /^(function)/],
    ['return', /^\b(return)\b/],
    ['fn_internal', /^\b(this|arguments|new)\b/],
    ['modifier', /^\b(async|await|yield)\b/],
    ['variable', /^\b(var|const|let)\b/],
    ['branch', /^\b(instanceof)\b/],
    ['branch', /^\b(try|catch|finally|if|else|do|while|for|of|break|continue|goto|switch|case)\b/],
  ];

  const highlight = (str) => {
    let out = '';
    while (str.length) {
      let matched;
      for (const [name, regex] of grammar) {
        const m = regex.exec(str);
        if (m) {
          const ins = m[0].split(m[1]);
          if (ins[0]) {
            out += ins[0];
          }
          out += stylize(m[1], name);
          if (ins[1]) {
            out += ins[1];
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
