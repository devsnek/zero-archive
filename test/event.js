const t = new EventTarget();

t.addEventListener('test', (e) => {
  console.log('aaaa', e);
});

t.dispatchEvent(new CustomEvent('test'));
