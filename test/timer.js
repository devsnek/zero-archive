const O = performance.now();
const T = () => performance.now() - O;

setTimeout(() => {
  console.log(1500, T());
}, 1500);

setTimeout(() => {
  console.log(500, T());
}, 500);

const INTERVAL = setInterval((...args) => {
  console.log(`interval 1000 ${T()} ${args}`);
}, 1000, 1, 2, 3);

setTimeout(() => {
  clearInterval(INTERVAL);
  console.log('cleared interval');
}, 3000);

const I = setTimeout(() => {
  console.log('!!! FAIL !!!');
}, 1000);
clearInterval(I);
