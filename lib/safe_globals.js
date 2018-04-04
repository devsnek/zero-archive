// Copyright Node.js contributors. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

'use strict';

const copyProps = (unsafe, safe) => {
  for (const key of [
    ...Object.getOwnPropertyNames(unsafe),
    ...Object.getOwnPropertySymbols(unsafe),
  ]) {
    if (!Object.getOwnPropertyDescriptor(safe, key)) {
      Object.defineProperty(safe, key,
        Object.getOwnPropertyDescriptor(unsafe, key));
    }
  }
};
const makeSafe = (unsafe, safe) => {
  copyProps(unsafe.prototype, safe.prototype);
  copyProps(unsafe, safe);
  Object.setPrototypeOf(safe.prototype, null);
  Object.freeze(safe.prototype);
  Object.freeze(safe);
  return safe;
};

({ namespace }) => {
  namespace.SafeMap = makeSafe(Map, class SafeMap extends Map {});
  namespace.SafeSet = makeSafe(Set, class SafeSet extends Set {});
  namespace.SafePromise = makeSafe(Promise, class SafePromise extends Promise {});
};

