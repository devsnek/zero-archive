'use strict';

({ binding, namespace, PrivateSymbol }) => {
  const { createMessage, safeToString } = binding('util');

  const kNoErrorFormat = PrivateSymbol('kNoErrorFormat');
  namespace.kNoErrorFormat = kNoErrorFormat;

  const kMessage = PrivateSymbol('kMessage');
  const kName = PrivateSymbol('kName');

  const prepareStackTrace = (error, frames) => {
    if (!frames.length) {
      return `${error}`;
    }

    const errorString = safeToString(error);

    if (error[kNoErrorFormat] === true) {
      return `${errorString}\n  at ${frames.join('\n  at ')}`;
    }

    const {
      sourceLine,
      resourceName,
      lineNumber,
      startColumn,
      endColumn,
    } = createMessage(error);

    return `${resourceName}:${lineNumber}:${startColumn}
${sourceLine}
${' '.repeat(startColumn)}${'^'.repeat(endColumn - startColumn)}
${errorString}
  at ${frames.join('\n  at ')}`;
  };

  Object.defineProperty(Error, 'prepareStackTrace', {
    value: prepareStackTrace,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  // https://heycam.github.io/webidl/#idl-exceptions

  const nameToCodeMap = new Map();

  class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super();
      this[kMessage] = `${message}`;
      this[kName] = `${name}`;
      Error.captureStackTrace(this, DOMException);
    }

    get name() {
      return this[kName];
    }

    get message() {
      return this[kMessage];
    }

    get code() {
      const code = nameToCodeMap.get(this[kName]);
      return code === undefined ? 0 : code;
    }
  }

  for (const [name, codeName, code] of [
    ['IndexSizeError', 'INDEX_SIZE_ERR', 1],
    ['DOMStringSizeError', 'DOMSTRING_SIZE_ERR', 2],
    ['HierarchyRequestError', 'HIERARCHY_REQUEST_ERR', 3],
    ['WrongDocumentError', 'WRONG_DOCUMENT_ERR', 4],
    ['InvalidCharacterError', 'INVALID_CHARACTER_ERR', 5],
    ['NoDataAllowedError', 'NO_DATA_ALLOWED_ERR', 6],
    ['NoModificationAllowedError', 'NO_MODIFICATION_ALLOWED_ERR', 7],
    ['NotFoundError', 'NOT_FOUND_ERR', 8],
    ['NotSupportedError', 'NOT_SUPPORTED_ERR', 9],
    ['InUseAttributeError', 'INUSE_ATTRIBUTE_ERR', 10],
    ['InvalidStateError', 'INVALID_STATE_ERR', 11],
    ['SyntaxError', 'SYNTAX_ERR', 12],
    ['InvalidModificationError', 'INVALID_MODIFICATION_ERR', 13],
    ['NamespaceError', 'NAMESPACE_ERR', 14],
    ['InvalidAccessError', 'INVALID_ACCESS_ERR', 15],
    ['ValidationError', 'VALIDATION_ERR', 16],
    ['TypeMismatchError', 'TYPE_MISMATCH_ERR', 17],
    ['SecurityError', 'SECURITY_ERR', 18],
    ['NetworkError', 'NETWORK_ERR', 19],
    ['AbortError', 'ABORT_ERR', 20],
    ['URLMismatchError', 'URL_MISMATCH_ERR', 21],
    ['QuotaExceededError', 'QUOTA_EXCEEDED_ERR', 22],
    ['TimeoutError', 'TIMEOUT_ERR', 23],
    ['InvalidNodeTypeError', 'INVALID_NODE_TYPE_ERR', 24],
    ['DataCloneError', 'DATA_CLONE_ERR', 25],
  ]) {
    const desc = {
      value: code,
      enumerable: true,
      configurable: false,
      writable: false,
    };
    Object.defineProperty(DOMException, codeName, desc);
    Object.defineProperty(DOMException.prototype, codeName, desc);
    nameToCodeMap.set(name, code);
  }

  Object.defineProperty(global, 'DOMException', {
    value: DOMException,
    writable: true,
    enumerable: false,
    configurable: true,
  });
};
