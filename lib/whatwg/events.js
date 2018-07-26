'use strict';

// https://github.com/jsdom/jsdom/blob/master/lib/jsdom/living/events/EventTarget-impl.js

({ namespace, PrivateSymbol: PS, load }) => {
  const { defineIDLClass } = load('util');

  const kEventListeners = PS('kEventListeners');
  const kType = PS('kType');
  const kBubbles = PS('kBubbles');
  const kTarget = PS('kTarget');
  const kCurrentTarget = PS('kCurrentTarget');
  const kEventPhase = PS('kEventPhase');
  const kCancelable = PS('kCancelable');
  const kIsTrusted = PS('kIsTrusted');
  const kTimeStamp = PS('kTimeStamp');
  const kInitializedFlag = PS('kInitializedFlag');
  const kStopPropagationFlag = PS('kStopPropagationFlag');
  const kStopImmediatePropagationFlag = PS('kStopImmediatePropogationFlag');
  const kCanceledFlag = PS('kCanceledFlag');
  const kDispatchFlag = PS('kDispatchFlag');
  const kDetail = PS('kDetail');
  const kInPassiveListener = PS('kInPassiveListener');

  class Event {
    constructor(type, { bubbles = false, cancelable = false } = {}) {
      this[kType] = type;
      this[kBubbles] = bubbles;
      this[kCancelable] = cancelable;
      this[kTarget] = null;
      this[kCurrentTarget] = null;
      this[kEventPhase] = Event.NONE;
      this[kInitializedFlag] = true;
      this[kStopPropagationFlag] = false;
      this[kStopImmediatePropagationFlag] = false;
      this[kCanceledFlag] = false;
      this[kDispatchFlag] = false;
      this[kIsTrusted] = false;
      this[kTimeStamp] = Date.now();
      this[kInPassiveListener] = false;
    }
  }

  [
    'NONE',
    'CAPTURING_PHASE',
    'AT_TARGET',
    'BUBBLING_PHASE',
  ].forEach((name, index) => {
    Object.defineProperty(Event, name, {
      value: index,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  });

  defineIDLClass(Event, 'Event', {
    get type() {
      return this[kType];
    },

    get target() {
      return this[kTarget];
    },

    get currentTarget() {
      return this[kCurrentTarget];
    },

    get eventPhase() {
      return this[kEventPhase];
    },

    stopPropagation() {
      this[kStopPropagationFlag] = true;
    },

    stopImmediatePropagation() {
      this[kStopPropagationFlag] = true;
      this[kStopImmediatePropagationFlag] = true;
    },

    get bubbles() {
      return this[kBubbles];
    },

    get cancelable() {
      return this[kCancelable];
    },

    preventDefault() {
      if (this[kCancelable] && !this[kInPassiveListener]) {
        this[kCanceledFlag] = true;
      }
    },

    get defaultPrevented() {
      return this[kCanceledFlag];
    },

    get isTrusted() {
      return this[kIsTrusted];
    },

    get timeStamp() {
      return this[kTimeStamp];
    },
  });

  function normalizeEventHandlerOptions(options, defaultBoolKeys) {
    const returnValue = {};

    // no need to go further here
    if (typeof options === 'boolean' || options === null || typeof options === 'undefined') {
      returnValue.capture = Boolean(options);
      return returnValue;
    }

    // non objects options so we typecast its value as "capture" value
    if (typeof options !== 'object') {
      returnValue.capture = Boolean(options);
      // at this point we don't need to loop the "capture" key anymore
      defaultBoolKeys = defaultBoolKeys.filter((k) => k !== 'capture');
    }

    for (const key of defaultBoolKeys) {
      returnValue[key] = Boolean(options[key]);
    }

    return returnValue;
  }

  function invokeEventListeners(listeners, target, event) {
    event[kCurrentTarget] = target;

    if (!listeners) {
      return;
    }

    const handlers = listeners.slice();
    for (let i = 0; i < handlers.length; i += 1) {
      if (event[kStopImmediatePropagationFlag]) {
        return;
      }

      const listener = handlers[i];
      const { capture, once, passive } = listener.options;
      if (passive) {
        event[kInPassiveListener] = true;
      }

      if (listeners.indexOf(listener) === -1 ||
        (event.eventPhase === Event.CAPTURING_PHASE && !capture) ||
        (event.eventPhase === Event.BUBBLING_PHASE && capture)) {
        continue;
      }

      if (once) {
        listeners.splice(listeners.indexOf(listener), 1);
      }

      try {
        if (typeof listener.callback === 'object') {
          if (typeof listener.callback.handleEvent === 'function') {
            listener.callback.handleEvent(event);
          }
        } else {
          listener.callback.call(event.currentTarget, event);
        }
      } catch (e) {
        // something has to happen here
      }

      event[kInPassiveListener] = false;
    }
  }

  // implemented as a function so it can be .call'd on global
  function EventTarget() {
    this[kEventListeners] = Object.create(null);
  }

  defineIDLClass(EventTarget, 'EventTarget', {
    addEventListener(type, callback, options) {
      const target = this ? this : global;
      if (callback === undefined || callback === null) {
        callback = null;
      } else if (typeof callback !== 'object' && typeof callback !== 'function') {
        throw new TypeError('Only undefined, null, an object, or a function are allowed for the callback parameter');
      }

      options = normalizeEventHandlerOptions(options, ['capture', 'once']);

      if (callback === null) {
        return;
      }

      if (!target[kEventListeners][type]) {
        target[kEventListeners][type] = [];
      }

      const listeners = target[kEventListeners][type];
      const len = listeners.length;
      for (let i = 0; i < len; i += 1) {
        const listener = listeners[i];
        if (listener.options.capture === options.capture && listener.callback === callback) {
          return;
        }
      }

      listeners.push({
        callback,
        options,
      });
    },

    removeEventListener(type, callback, options) {
      const target = this ? this : global;
      if (callback === undefined || callback === null) {
        callback = null;
      } else if (typeof callback !== 'object' && typeof callback !== 'function') {
        throw new TypeError('Only undefined, null, an object, or a function are allowed for the callback parameter');
      }

      options = normalizeEventHandlerOptions(options, ['capture']);

      if (callback === null) {
        // Optimization, not in the spec.
        return;
      }

      if (!target[kEventListeners][type]) {
        return;
      }

      const listeners = target[kEventListeners][type];
      const len = listeners.length;
      for (let i = 0; i < len; i += 1) {
        const listener = listeners[i];
        if (listener.callback === callback && listener.options.capture === options.capture) {
          listeners.splice(i, 1);
          break;
        }
      }
    },

    dispatchEvent(event) {
      const target = this ? this : global;
      if (event[kDispatchFlag] || !event[kInitializedFlag]) {
        throw new Error('Tried to dispatch an uninitialized event');
      }
      if (event[kEventPhase] !== Event.NONE) {
        throw new Error('Tried to dispatch a dispatching event');
      }

      // users can't touch this and it needs to be set before dispatching anyway
      // event[kIsTrusted] = false;

      event[kDispatchFlag] = true;
      event[kTarget] = target;

      // eventPath is always empty because we have no dom \o/
      const eventPath = [];

      event[kEventPhase] = Event.CAPTURING_PHASE;

      for (let i = eventPath.length - 1; i >= 0; i -= 1) {
        if (event[kStopPropagationFlag]) {
          break;
        }

        const obj = eventPath[i];
        const eventListeners = obj[kEventListeners][event.type];
        invokeEventListeners(eventListeners, obj, event);
      }

      event[kEventPhase] = Event.AT_TARGET;
      if (!event[kStopPropagationFlag]) {
        if (target[kEventListeners][event.type]) {
          const eventListeners = target[kEventListeners][event.type];
          invokeEventListeners(eventListeners, event.target, event);
        }
      }

      if (event.bubbles) {
        event[kEventPhase] = Event.BUBBLING_PHASE;
        for (let i = 0; i < eventPath.length; i += 1) {
          if (event[kStopPropagationFlag]) {
            break;
          }

          const obj = eventPath[i];
          const eventListeners = obj[kEventListeners][event.type];
          invokeEventListeners(eventListeners, obj, event);
        }
      }

      event[kDispatchFlag] = false;
      event[kStopPropagationFlag] = false;
      event[kStopImmediatePropagationFlag] = false;
      event[kEventPhase] = Event.NONE;
      event[kCurrentTarget] = null;
      return !event[kCanceledFlag];
    },
  });

  class CustomEvent extends Event {
    constructor(type, eventInitDict = {}) {
      super(type, eventInitDict);
      this[kDetail] = eventInitDict.detail;
    }
  }

  defineIDLClass(CustomEvent, 'CustomEvent', {
    get detail() {
      return this[kDetail];
    },
  });

  namespace.EventTarget = EventTarget;
  namespace.Event = Event;
  namespace.CustomEvent = CustomEvent;
  namespace.markTrusted = (e) => {
    e[kIsTrusted] = true;
  };
};
