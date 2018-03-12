// eslint-disable-next-line no-unused-expressions
({ binding }) => {
  const io = binding('io');

  function readFileSync(filename) {
    return io.ReadFileSync(filename, 'rb');
  }

  return {
    readFileSync,
  };
};
