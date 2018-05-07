'use strict';

({ load, process, namespace }) => {
  const { EventTarget, Event, CustomEvent } = load('whatwg/events');
  const { Console } = load('whatwg/console');
  const { TextEncoder, TextDecoder } = load('whatwg/encoding');
  const { URL, URLSearchParams } = load('whatwg/url');
  const { fetch } = load('whatwg/fetch');

  const attach = (name, value) => {
    Object.defineProperty(global, name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  };

  const console = new Console(process.stdout, process.stderr);

  attach('EventTarget', EventTarget);
  attach('Event', Event);
  attach('CustomEvent', CustomEvent);
  attach('console', console);
  attach('TextEncoder', TextEncoder);
  attach('TextDecoder', TextDecoder);
  attach('URL', URL);
  attach('URLSearchParams', URLSearchParams);
  attach('fetch', fetch);

  const globalProto = Object.getPrototypeOf(global);
  globalProto.addEventListener = EventTarget.prototype.addEventListener.bind(globalProto);
  globalProto.removeEventListener = EventTarget.prototype.removeEventListener.bind(globalProto);
  globalProto.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(globalProto);
  EventTarget.call(globalProto);

  namespace.console = console;
};
