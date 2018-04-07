'use strict';

({ namespace, load, binding }) => {
  const { SafeMap, SafeSet, SafePromise } = load('safe_globals');
  const {
    ModuleWrap,
    setImportModuleDynamicallyCallback,
    setInitializeImportMetaObjectCallback,
  } = binding('module_wrap');
  const natives = binding('natives');

  const resolvedPromise = SafePromise.resolve();

  class ModuleJob {
    constructor(loader, url, module) {
      this.loader = loader;
      this.url = url;
      this.module = module;

      const dependencyJobs = [];
      this.linked = (async () => {
        const promises = this.module.link(async (specifier) => {
          const jobPromise = this.loader.getModuleJob(specifier);
          dependencyJobs.push(jobPromise);
          return (await jobPromise).module;
        });

        if (promises !== undefined)
          await Promise.all(promises);

        return Promise.all(dependencyJobs);
      })();

      this.instantiated = undefined;
    }

    async instantiate() {
      if (this.instantiated === undefined)
        this.instantiated = this._instantiate();
      await this.instantiated;
    }

    async run() {
      await this.instantiate();
      this.module.evaluate();
    }

    async _instantiate() {
      const jobsInGraph = new SafeSet();
      const addJobsToDependencyGraph = async (moduleJob) => {
        if (jobsInGraph.has(moduleJob))
          return;
        jobsInGraph.add(moduleJob);
        const dependencyJobs = await moduleJob.linked;
        return Promise.all(dependencyJobs.map(addJobsToDependencyGraph));
      };

      await addJobsToDependencyGraph(this);

      this.module.instantiate();

      for (const dependencyJob of jobsInGraph)
        dependencyJob.instantiated = resolvedPromise;
    }
  }

  class Loader {
    constructor() {
      this.moduleMap = new SafeMap();
    }

    async import(specifier) {
      const job = await this.getModuleJob(specifier);
      await job.run();
      return job.module.namespace();
    }

    async getModuleJob(specifier) {
      if (this.moduleMap.has(specifier))
        return this.moduleMap.get(specifier);

      if (natives[specifier] === undefined)
        throw new Error('Module not resolved');

      const job = new ModuleJob(this, specifier, new ModuleWrap(natives[specifier], specifier));

      return job;
    }
  }

  setImportModuleDynamicallyCallback(async (specifier, referrer) => {
    load('debug').log(`${referrer} -> ${specifier}`, true);
    return {};
  });

  setInitializeImportMetaObjectCallback((meta, wrapFn) => {
    if (typeof wrapFn === 'function')
      wrapFn(meta);
  });

  namespace.Loader = Loader;
};
