'use strict';

({ namespace, PrivateSymbol }) => {
  const kNext = PrivateSymbol();
  const kPrev = PrivateSymbol();

  namespace.init = (list) => {
    list[kNext] = list;
    list[kPrev] = list;
  };

  namespace.peek = (list) => {
    if (list[kPrev] === list) {
      return null;
    }

    return list[kPrev];
  };

  namespace.remove = (item) => {
    if (item[kNext]) {
      item[kNext][kPrev] = item[kPrev];
    }

    if (item[kPrev]) {
      item[kPrev][kNext] = item[kNext];
    }

    item[kNext] = null;
    item[kPrev] = null;
  };

  namespace.append = (list, item) => {
    if (item[kNext] || item[kPrev]) {
      namespace.remove(item);
    }

    item[kNext] = list[kNext];
    item[kPrev] = list;

    list[kNext][kPrev] = item;
    list[kNext] = item;
  };
};
