'use strict';

({ namespace, binding }) => {
  const inspector = binding('inspector_sync');

  function start() {
    let count = 0;
    let lastMessage;

    const send = inspector.start((m) => {
      lastMessage = JSON.parse(m);
    });

    if (!send) {
      throw new Error('already running');
    }

    return (method, params) => {
      count += 1;
      send(JSON.stringify({
        id: count,
        method,
        params,
      }));
      if (lastMessage !== undefined) {
        const { error, result } = lastMessage;
        lastMessage = undefined;
        if (error) {
          const e = new Error(`${error.message}: ${error.data}`);
          e.code = error.code;
          throw e;
        } else {
          return result;
        }
      }
    };
  }

  namespace.start = start;
  namespace.stop = inspector.stop;
};
