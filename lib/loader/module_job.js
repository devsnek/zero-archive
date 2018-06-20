'use strict';

({ namespace }) => {
  const resolvedPromise = Promise.resolve();

  class ModuleJob {
    constructor(loader, url, modulePromise) {
      this.loader = loader;
      this.url = url;
      this.modulePromise = modulePromise;
      this.module = undefined;

      const dependencyJobs = [];
      this.linked = (async () => {
        this.module = await this.modulePromise;

        const promises = this.module.link(async (specifier) => {
          const jobPromise = this.loader.getModuleJob(specifier, this.url);
          dependencyJobs.push(jobPromise);
          return (await jobPromise).modulePromise;
        });

        if (promises !== undefined) {
          await Promise.all(promises);
        }

        return Promise.all(dependencyJobs);
      })();

      this.instantiated = undefined;
    }

    async instantiate() {
      if (this.instantiated === undefined) {
        this.instantiated = this._instantiate();
      }
      await this.instantiated;
    }

    async run() {
      await this.instantiate();
      return { result: this.module.evaluate(), __proto__: null };
    }

    async _instantiate() {
      const jobsInGraph = new Set();
      const addJobsToDependencyGraph = async (moduleJob) => {
        if (jobsInGraph.has(moduleJob)) {
          return;
        }
        jobsInGraph.add(moduleJob);
        const dependencyJobs = await moduleJob.linked;
        return Promise.all(dependencyJobs.map(addJobsToDependencyGraph));
      };

      await addJobsToDependencyGraph(this);

      this.module.instantiate();

      for (const dependencyJob of jobsInGraph) {
        dependencyJob.instantiated = resolvedPromise;
      }
    }
  }

  namespace.ModuleJob = ModuleJob;
};
