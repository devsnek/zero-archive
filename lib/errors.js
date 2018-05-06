'use strict';

({ binding }) => {
  const { createMessage } = binding('util');

  Error.prepareStackTrace = (error, frames) => {
    if (!frames.length) {
      return `${error}`;
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
${error}
  at ${frames.join('\n  at ')}`;
  };
};
