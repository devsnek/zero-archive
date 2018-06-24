'use strict';

({ namespace, load, binding, process }) => {
  const {
    setImportModuleDynamicallyCallback,
    setInitializeImportMetaObjectCallback,
  } = binding('module_wrap');
  const { URL, getFilePathFromURL } = load('whatwg/url');

  const { ModuleJob } = load('loader/module_job');
  const { translators } = load('loader/translators');
  const { AsyncQueue } = load('util');

  const { stat } = load('fs');

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

    async resolve(specifier, referrer) {
      if (specifier === '[eval]') {
        return { url: '[eval]' };
      }
      if (referrer === '[eval]' || referrer === '[repl]') {
        referrer = `file://${process.cwd}/`;
      }

      const url = new URL(specifier, referrer || this.parentURL);

      if (url.protocol === 'file:') {
        const file = getFilePathFromURL(url);

        const handler = async (ext) => {
          try {
            await statQueue.add(() => stat(`${file}.${ext}`));
            return {
              url: `${url}.${ext}`,
              format: ext,
            };
          } catch (e) {
            return null;
          }
        };

        const resolved = (await Promise.all([
          statQueue.add(() =>
            stat(file).then(() => ({
              url: `${url}`,
              format: 'js',
            }), () => null)),
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
