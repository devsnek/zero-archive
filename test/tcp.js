import { Server } from '@ivan/tcp';

const server = new Server((c) => {
  console.log('connection!', c);
});

server.listen(8080, '0.0.0.0');
