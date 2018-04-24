'use strict';

({ namespace, load, binding }) => {
  const {
    setImportModuleDynamicallyCallback,
    setInitializeImportMetaObjectCallback,
  } = binding('module_wrap');

  const { ModuleJob } = load('loader/module_job');
  const { translators } = load('loader/translators');

  const EXPOSED_BUILTINS = ['fs', 'util'];

  class Loader {
    constructor() {
      this.moduleMap = new Map();
    }

    async import(specifier) {
      const job = await this.getModuleJob(specifier);
      await job.run();
      return job.module.getNamespace();
    }

    async run(source) {
      const job = await this.getModuleJob('eval:js', source);
      return job.run();
    }

    async getModuleJob(specifier, src) {
      if (this.moduleMap.has(specifier))
        return this.moduleMap.get(specifier);

      let translation;
      if (EXPOSED_BUILTINS.includes(specifier))
        translation = translators.get('builtin')(specifier);
      else
        translation = translators.get('esm')(specifier, src);

      const job = new ModuleJob(this, specifier, translation);

      return job;
    }
  }

  setImportModuleDynamicallyCallback(async () => {
    throw new Error('unimplemented');
  });

  setInitializeImportMetaObjectCallback((meta, wrap) => {
    meta.url = wrap.url;
  });

  namespace.Loader = Loader;
};
