const h = new Headers();

h.set('a', '1');
h.append('a', '2');

h.set('b', '3');

console.log([...h]);
