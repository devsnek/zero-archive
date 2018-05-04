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

    const arrowLength = endColumn - startColumn;
    return `${resourceName}:${lineNumber}:${startColumn}
${sourceLine}
${' '.repeat(startColumn)}${'^'.repeat(arrowLength)}
${error}
  at ${frames.join('\n  at ')}`;
  };
};
