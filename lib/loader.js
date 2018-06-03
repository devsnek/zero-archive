'use strict';

({ namespace, load, binding, process }) => {
  const {
    setImportModuleDynamicallyCallback,
    setInitializeImportMetaObjectCallback,
  } = binding('module_wrap');
  const { URL } = load('whatwg/url');

  const { ModuleJob } = load('loader/module_job');
  const { translators } = load('loader/translators');

  const EXPOSED_BUILTINS = [];

  class Loader {
    constructor(parentURL) {
      this.parentURL = parentURL;
      this.moduleMap = new Map();
    }

    async import(specifier, referrer) {
      const job = await this.getModuleJob(specifier, referrer);
      await job.run();
      return job.module.getNamespace();
    }

    async resolve(specifier, referrer) {
      if (specifier === '[eval]') {
        return { url: '[eval]' };
      }
      if (referrer === '[eval]' || referrer === '[repl]') {
        referrer = `file://${process.cwd}/`;
      }
      return {
        url: new URL(specifier, referrer || this.parentURL).toString(),
      };
    }

    async getModuleJob(specifier, referrer) {
      const { url } = await this.resolve(specifier, referrer);

      if (this.moduleMap.has(url)) {
        return this.moduleMap.get(url);
      }

      let translation;
      if (EXPOSED_BUILTINS.includes(url)) {
        translation = translators.get('builtin')(url);
      } else {
        translation = translators.get('esm')(url);
      }

      const job = new ModuleJob(this, url, translation);

      return job;
    }
  }

  namespace.attachLoaderGlobals = (loader) => {
    setImportModuleDynamicallyCallback(async (referrer, specifier) =>
      loader.import(specifier, referrer));

    setInitializeImportMetaObjectCallback((meta, wrap) => {
      meta.url = wrap.url;
    });
  };

  namespace.Loader = Loader;
};
