'use strict';

({ load, process, namespace }) => {
  const { setTimeout, clearTimeout, setInterval, clearInterval } = load('whatwg/timers');
  const { EventTarget, Event, CustomEvent } = load('whatwg/events');
  const { ReadableStream } = load('whatwg/streams/readable');
  const { WritableStream } = load('whatwg/streams/writable');
  const { TransformStream } = load('whatwg/streams/transform');
  const {
    ByteLengthQueuingStrategy,
    CountQueuingStrategy,
  } = load('whatwg/streams/queuing_strategy');
  const { Console } = load('whatwg/console');
  const { TextEncoder, TextDecoder } = load('whatwg/encoding');
  const { URL, URLSearchParams } = load('whatwg/url');
  const { Headers, FormData } = load('whatwg/fetch');
  const { WebSocket } = load('whatwg/websocket');

  const attach = (name, value, enumerable = false) => {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      enumerable,
      configurable: true,
    });
  };

  const console = new Console(process.stdout, process.stderr);

  attach('setTimeout', setTimeout, true);
  attach('clearTimeout', clearTimeout, true);
  attach('setInterval', setInterval, true);
  attach('clearInterval', clearInterval, true);

  attach('EventTarget', EventTarget);
  attach('Event', Event);
  attach('CustomEvent', CustomEvent);

  attach('ReadableStream', ReadableStream);
  attach('WritableStream', WritableStream);
  attach('TransformStream', TransformStream);
  attach('ByteLengthQueuingStrategy', ByteLengthQueuingStrategy);
  attach('CountQueuingStrategy', CountQueuingStrategy);

  attach('console', console);

  attach('TextEncoder', TextEncoder);
  attach('TextDecoder', TextDecoder);

  attach('URL', URL);
  attach('URLSearchParams', URLSearchParams);
  attach('FormData', FormData);
  attach('Headers', Headers);

  attach('WebSocket', WebSocket);

  attach('queueMicrotask', (callback) => {
    enqueueMicrotask(() => {
      try {
        callback();
      } catch (e) {
        const e = new ErrorEvent();
        EventTarget.prototype.dispatchEvent.call(global, e);
      }
    });
  });

  Object.assign(Object.getPrototypeOf(global), EventTarget.prototype);
  EventTarget.call(global);

  namespace.console = console;
};
