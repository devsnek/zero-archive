export default class Maybe {
  #hasValue = false;
  #value;

  isNothing() {
    return !this.#hasValue;
  }

  isJust() {
    return this.#hasValue;
  }

  fromJust() {
    if (!this.#hasValue) {
      throw new Error('Maybe value is Nothing.');
    }

    return this.#value;
  }

  fromMaybe(defaultValue) {
    return this.#hasValue ? this.#value : defaultValue;
  }

  constructor(...args) {
    if (args.length === 1) {
      this.#hasValue = true;
      this.#value = args[0]; // eslint-disable-line prefer-destructuring
    }
  }
}
