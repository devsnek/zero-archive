'use strict';

({ binding }) => {
  const { createMessage } = binding('util');

  const getFrameString = (frame) => ` at ${frame}`;

  Error.prepareStackTrace = (error, frames) => {
    const {
      sourceLine,
      resourceName,
      lineNumber,
      startColumn,
      endColumn,
    } = createMessage(error);

    const errorString = `${error}`;
    let frameString = ' ';
    frames.forEach((frame) => {
      if (frameString !== ' ') {
        frameString = `${frameString}\n `;
      }
      frameString = `${frameString}${getFrameString(frame)}`;
    });
    const stackString = `${errorString}\n${frameString}`;

    const arrowLength = endColumn - startColumn;
    return `${resourceName}:${lineNumber}:${startColumn}
${sourceLine}
${' '.repeat(startColumn)}${'^'.repeat(arrowLength)}
${stackString}`;
  };
};
