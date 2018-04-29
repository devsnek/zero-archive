'use strict';

const { spawn } = require('child_process');
const debug = require('util').debuglog('bob');

function topsort(edges) {
  const nodes = {};
  const sorted = [];
  const visited = new Set();

  edges.forEach(([from, to]) => {
    if (!nodes[from])
      nodes[from] = { id: from, afters: [] };
    if (!nodes[to])
      nodes[to] = { id: to, afters: [] };
    nodes[from].afters.push(to);
  });

  Object.keys(nodes).forEach(function visit(idstr, ancestors) {
    const node = nodes[idstr];
    const { id } = node;

    if (visited.has(idstr))
      return;

    if (!Array.isArray(ancestors))
      ancestors = [];

    ancestors.push(id);

    visited.add(idstr);

    node.afters.forEach((afterId) => {
      if (ancestors.indexOf(afterId) >= 0)
        throw new Error(`Closed chain: ${afterId} is in ${id}`);

      visit(`${afterId}`, ancestors.slice(0));
    });

    sorted.unshift(id);
  });

  return sorted.reverse();
}

const rules = {};
const nodes = [];
const configs = {};

function runCommand(command, targets, output) {
  const [cmd, ...args] = command
    .replace(/\{in\}/g, targets)
    .replace(/\{out\}/g, output)
    .split(' ');
  console.log(cmd, args.join(' '));
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, {
      stdio: [process.stdin, process.stdout, process.stderr],
      cwd: process.cwd(),
    });
    c.once('error', reject);
    c.once('exit', resolve);
  }).then(() => console.log(''));
}

function rule(name, { command }) {
  if (typeof command === 'function')
    rules[name] = command;
  else
    rules[name] = (targets, output) => runCommand(command, targets, output);
}

function build(name, { dependencies, ...options } = {}) {
  if (dependencies) {
    for (const dep of dependencies)
      nodes.push([name, dep]);
  }
  configs[name] = { name, ...options };
}

module.exports = { build, rule };

process.nextTick(async () => {
  debug('building');
  const order = topsort(nodes);
  debug('order %s', order);
  for (const n of order) {
    const { rule, command, name, targets } = configs[n];
    debug('building %s with rule %s', name, rule);
    if (rule)
      await rules[rule](targets.join(' '), name);
    else
      await runCommand(command, targets, name);
  }
});
