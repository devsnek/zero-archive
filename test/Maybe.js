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

  inspect() {
    return `${this.constructor.name} {${this.#hasValue ? ` ${this.#value} ` : ''}}`;
  }
}

export class Nothing extends Maybe {
  constructor() { // eslint-disable-line no-useless-constructor
    super(); // force calling with 0 args
  }
}

export class Just extends Maybe {
  constructor(value) { // eslint-disable-line no-useless-constructor
    super(value); // force calling with 1 arg
  }
}

console.log(new Nothing());
console.log(new Just(1));
