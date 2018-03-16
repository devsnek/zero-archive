'use strict';

const ArrayJoin = Function.call.bind(Array.prototype.join);
const ArrayMap = Function.call.bind(Array.prototype.map);

({ binding, namespace }) => {
  const { ModuleWrap } = binding('module_wrap');

  const createDynamicModule = (exports, url = '', evaluate) => {
    const names = ArrayMap(exports, (name) => `${name}`);
    const src = `
export let executor;
${ArrayJoin(ArrayMap(names, (name) => `export let $${name};`), '\n')}
(() => ({
  setExecutor: fn => executor = fn,
  reflect: {
    exports: { ${ArrayJoin(ArrayMap(names, (name) => `
      ${name}: {
        get: () => $${name},
        set: v => $${name} = v
      }`), ', \n')}
    }
  }
}));`;
    const reflectiveModule = new ModuleWrap(src, `cjs-facade:${url}`);
    reflectiveModule.instantiate();
    const { setExecutor, reflect } = reflectiveModule.evaluate()();
    // public exposed ESM
    const reexports = `
import {
  executor,
  ${ArrayMap(names, (name) => `$${name}`)}
} from "";
export {
  ${ArrayJoin(ArrayMap(names, (name) => `$${name} as ${name}`), ', ')}
}
if (typeof executor === "function") {
  executor()
}`;
    if (typeof evaluate === 'function')
      setExecutor(() => evaluate(reflect));

    const module = new ModuleWrap(reexports, `${url}`);
    module.link(async () => reflectiveModule);
    module.instantiate();
    return {
      module,
      reflect,
    };
  };

  namespace.default = createDynamicModule;
};
