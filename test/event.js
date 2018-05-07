const t = new EventTarget();

t.addEventListener('test', (e) => {
  console.log('aaaa', e);
});

t.dispatchEvent(new CustomEvent('test'));

global.addEventListener('test2', (e) => {
  console.log('global worked', e);
});

dispatchEvent(new Event('test2'));
