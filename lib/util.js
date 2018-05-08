'use strict';

({ binding, namespace, load }) => {
  Object.assign(namespace, load('util/inspect'));
};
