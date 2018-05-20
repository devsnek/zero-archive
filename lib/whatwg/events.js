'use strict';

// https://github.com/jsdom/jsdom/blob/master/lib/jsdom/living/events/EventTarget-impl.js

({ namespace, PrivateSymbol: PS, load }) => {
  const { defineIDLClass } = load('util');

  const kEventListeners = PS();
  const kType = PS();
  const kBubbles = PS();
  const kTarget = PS();
  const kCurrentTarget = PS();
  const kEventPhase = PS();
  const kCancelable = PS();
  const kIsTrusted = PS();
  const kTimeStamp = PS();
  const kInitializedFlag = PS();
  const kStopPropagationFlag = PS();
  const kStopImmediatePropagationFlag = PS();
  const kCanceledFlag = PS();
  const kDispatchFlag = PS();
  const kDetail = PS();

  class Event {
    constructor(type, eventInitDict = { bubbles: false, cancelable: false }) {
      this[kType] = type;
      this[kBubbles] = false; // eventInitDict.bubbles;
      this[kCancelable] = eventInitDict.cancelable;
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
    }
  }

  Event.NONE = 0;
  Event.CAPTURING_PHASE = 1;
  Event.AT_TARGET = 2;
  Event.BUBBLING_PHASE = 3;

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
      if (this[kCancelable]) {
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
      const { capture, once/* , passive */ } = listener.options;

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

      event[kEventPhase] = Event.CAPTURING_PHASE;
      // parenting is not a thing yet

      event[kEventPhase] = Event.AT_TARGET;
      if (!event[kStopPropagationFlag]) {
        if (target[kEventListeners][event.type]) {
          const eventListeners = target[kEventListeners][event.type];
          invokeEventListeners(eventListeners, event.target, event);
        }
      }

      if (event.bubbles) { // always false
        event[kEventPhase] = Event.BUBBLING_PHASE;
        // bubble stuff
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
    constructor(type, eventInitDict) {
      super(type, eventInitDict);
      this[kDetail] = eventInitDict ? eventInitDict.detail : undefined;
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
