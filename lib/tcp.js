'use strict';

({ namespace, binding, load, PrivateSymbol }) => {
  const {
    init,
    listen,
    sizeof_ivan_tcp_t: sizeofHandle,
  } = binding('tcp');

  const kServer = PrivateSymbol('server');
  const kHandle = PrivateSymbol('handle');


  class Connection {
    constructor(server) {
      this[kServer] = server;
      this[kHandle] = new ArrayBuffer(sizeofHandle);

      init(this[kHandle], this);
    }
  }

  class Server {
    constructor(cb) {
      this[kHandle] = new ArrayBuffer(sizeofHandle);

      init(
        this[kHandle],
        this,
        () => {
          const c = new Connection();
          return c[kHandle];
        },
        cb,
      );
    }

    listen(port, ip) {
      return listen(this[kHandle], port, ip);
    }
  }

  namespace.Server = Server;
};
