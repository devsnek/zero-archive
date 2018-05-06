const buf = new TextEncoder().encode('hello');

console.log(buf);

console.log(new TextDecoder('utf8').decode(buf));
