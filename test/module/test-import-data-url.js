import { pass, fail } from '../common';

import('data:text/javascript,export const a = 1')
  .then(({ a }) => {
    if (a !== 1) {
      fail();
    }
    pass();
  }, fail);
