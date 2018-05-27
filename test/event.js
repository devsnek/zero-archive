const t = new EventTarget();

console.log(t);

t.addEventListener('test', (e) => {
  console.log('aaaa', e);
});

t.dispatchEvent(new Event('test'));

global.addEventListener('test2', (e) => {
  console.log('global worked', e);
});

dispatchEvent(new CustomEvent('test2'));
