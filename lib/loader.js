'use strict';

({ namespace, load, binding, process }) => {
  const {
    setImportModuleDynamicallyCallback,
    setInitializeImportMetaObjectCallback,
  } = binding('module_wrap');
  const { URL } = load('whatwg/url');

  const { ModuleJob } = load('loader/module_job');
  const { translators } = load('loader/translators');
  const { AsyncQueue } = load('util');
  const { FileSystem } = load('file_system');

  const statQueue = new AsyncQueue(10);

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

    async resolve(specifier, referrer = this.parentURL) {
      if (specifier === '[eval]') {
        return { url: '[eval]', format: 'js' };
      }
      if (referrer === '[eval]' || referrer === '[repl]') {
        referrer = `file://${process.cwd}/`;
      }

      if (/^data:/.test(specifier)) {
        return { url: specifier, format: 'js' };
      }

      const url = new URL(specifier, referrer);

      if (url.protocol === 'file:') {
        const handler = async (ext) => {
          const exists = await statQueue.add(() => FileSystem.exists(`${url}.${ext}`));
          if (exists) {
            return {
              url: `${url}.${ext}`,
              format: ext,
            };
          }

          return null;
        };

        const resolved = (await Promise.all([
          statQueue.add(async () => {
            const exists = await FileSystem.exists(url);
            if (exists) {
              return {
                url: `${url}`,
                format: 'js',
              };
            }
            return null;
          }),
          handler('js'),
        ])).find((a) => a !== null);

        if (!resolved) {
          throw new Error(`unable to resolve ${specifier}`);
        }

        return resolved;
      }

      return {
        url: `${url}`,
        format: 'https',
      };
    }

    async getModuleJob(specifier, referrer) {
      const { url, format } = await this.resolve(specifier, referrer);

      if (this.moduleMap.has(url)) {
        return this.moduleMap.get(url);
      }

      const translation = translators.get(format)(url);

      const job = new ModuleJob(this, url, translation);

      this.moduleMap.set(url, job);

      return job;
    }
  }

  namespace.attachLoaderGlobals = (loader) => {
    setImportModuleDynamicallyCallback((referrer, specifier) =>
      loader.import(specifier, referrer));

    setInitializeImportMetaObjectCallback((meta, wrap) => {
      meta.url = wrap.url;
    });
  };

  namespace.Loader = Loader;
};
