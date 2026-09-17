import { dirname, resolve } from "node:path";

import type { ProjectDetail, StudioRunRequest } from "@llm-eval-kit/api-contracts";
import {
  loadEvaluationSuite,
  loadProjectConfig,
  loadStudioProjectManifest,
} from "@llm-eval-kit/config";
import {
  ConfigurationError,
  type CaseFilters,
  type EvaluationSuite,
  type ProjectConfig,
} from "@llm-eval-kit/core";
import { loadMockFixtureFile, type MockFixtureFile } from "@llm-eval-kit/providers";

import { canonicalRoot, containedFile } from "./safe-path.js";

const manifestExtensions = new Set([".json"]);
const configExtensions = new Set([".json", ".yaml", ".yml"]);
const suiteExtensions = new Set([".json", ".yaml", ".yml"]);
const fixtureExtensions = new Set([".json"]);

export type ProjectRegistryOptions = {
  workspaceRoot: string;
  manifestPaths: string[];
  environment?: Readonly<Record<string, string | undefined>>;
};

export type ResolvedRun = {
  project: ProjectDetail;
  config: ProjectConfig;
  suite: EvaluationSuite;
  schemaRoot: string;
  filters?: CaseFilters;
  targetFixtures?: MockFixtureFile;
};

type RegisteredProject = {
  detail: ProjectDetail;
  targets: Map<string, ProjectConfig>;
  suites: Map<string, { suite: EvaluationSuite; fixtures: Map<string, MockFixtureFile> }>;
  scenarios: Map<string, StudioRunRequest>;
  schemaRoot: string;
};

export class ProjectRegistry {
  private constructor(
    private readonly projects: ReadonlyMap<string, RegisteredProject>,
    public readonly workspaceRoot: string,
  ) {}

  static async create(options: ProjectRegistryOptions): Promise<ProjectRegistry> {
    const root = await canonicalRoot(options.workspaceRoot);
    const environment = options.environment ?? process.env;
    const projects = new Map<string, RegisteredProject>();
    for (const requestedManifest of options.manifestPaths) {
      const manifestPath = await containedFile(root, requestedManifest, manifestExtensions);
      const manifest = await loadStudioProjectManifest(manifestPath);
      if (projects.has(manifest.id)) {
        throw new ConfigurationError(`Duplicate Studio project id: ${manifest.id}`);
      }
      const manifestDirectory = dirname(manifestPath);
      const registeredTargets = new Map<string, ProjectConfig>();
      const targets = await Promise.all(
        manifest.targets.map(async (target) => {
          const configPath = await containedFile(
            root,
            resolve(manifestDirectory, target.config),
            configExtensions,
          );
          const config = await loadProjectConfig(configPath);
          registeredTargets.set(target.id, config);
          const envName = config.target.apiKeyEnv;
          const ready =
            config.target.provider === "mock" ||
            (envName !== undefined && Boolean(environment[envName]));
          return {
            id: target.id,
            provider: config.target.provider,
            model: config.target.model,
            ready,
          };
        }),
      );
      const registeredSuites = new Map<
        string,
        { suite: EvaluationSuite; fixtures: Map<string, MockFixtureFile> }
      >();
      const suites = await Promise.all(
        manifest.suites.map(async (suiteEntry) => {
          const suitePath = await containedFile(
            root,
            resolve(manifestDirectory, suiteEntry.file),
            suiteExtensions,
          );
          const suite = await loadEvaluationSuite(suitePath);
          const fixtures = new Map<string, MockFixtureFile>();
          for (const fixture of suiteEntry.fixtureSets) {
            const fixturePath = await containedFile(
              root,
              resolve(manifestDirectory, fixture.file),
              fixtureExtensions,
            );
            fixtures.set(fixture.id, await loadMockFixtureFile(fixturePath));
          }
          registeredSuites.set(suiteEntry.id, { suite, fixtures });
          return {
            id: suiteEntry.id,
            name: suite.name,
            caseCount: suite.cases.length,
            fixtureSets: suiteEntry.fixtureSets.map(({ id }) => ({ id })),
          };
        }),
      );
      const scenarios = manifest.scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name ?? scenario.id,
        targetId: scenario.targetId,
        suiteId: scenario.suiteId,
        ...(scenario.fixtureSetId === undefined ? {} : { fixtureSetId: scenario.fixtureSetId }),
        ...(scenario.filters === undefined ? {} : { filters: scenario.filters }),
      }));
      const detail: ProjectDetail = {
        id: manifest.id,
        name: manifest.name,
        targets,
        suites,
        scenarios,
      };
      projects.set(manifest.id, {
        detail,
        targets: registeredTargets,
        suites: registeredSuites,
        scenarios: new Map(
          manifest.scenarios.map((scenario) => [
            scenario.id,
            {
              projectId: manifest.id,
              targetId: scenario.targetId,
              suiteId: scenario.suiteId,
              ...(scenario.fixtureSetId === undefined
                ? {}
                : { fixtureSetId: scenario.fixtureSetId }),
              ...(scenario.filters === undefined ? {} : { filters: scenario.filters }),
            },
          ]),
        ),
        schemaRoot: manifestDirectory,
      });
    }
    return new ProjectRegistry(projects, root);
  }

  list(): ProjectDetail[] {
    return [...this.projects.values()].map(({ detail }) => detail);
  }

  get(projectId: string): ProjectDetail | undefined {
    return this.projects.get(projectId)?.detail;
  }

  scenario(projectId: string, scenarioId: string): StudioRunRequest | undefined {
    return this.projects.get(projectId)?.scenarios.get(scenarioId);
  }

  resolve(request: StudioRunRequest): ResolvedRun {
    const project = this.projects.get(request.projectId);
    if (project === undefined) throw new ConfigurationError("Project is not registered.");
    const config = project.targets.get(request.targetId);
    if (config === undefined) throw new ConfigurationError("Target is not registered.");
    if (project.detail.targets.find(({ id }) => id === request.targetId)?.ready !== true) {
      throw new ConfigurationError("The selected provider target is not configured on the server.");
    }
    const registeredSuite = project.suites.get(request.suiteId);
    if (registeredSuite === undefined) throw new ConfigurationError("Suite is not registered.");
    const targetFixtures =
      request.fixtureSetId === undefined
        ? undefined
        : registeredSuite.fixtures.get(request.fixtureSetId);
    if (request.fixtureSetId !== undefined && targetFixtures === undefined) {
      throw new ConfigurationError("Fixture set is not registered for the selected suite.");
    }
    const overrides = request.executionOverrides;
    const requestedFilters = request.filters;
    const filters: CaseFilters | undefined =
      requestedFilters === undefined
        ? undefined
        : {
            ...(requestedFilters.caseIds === undefined
              ? {}
              : { caseIds: requestedFilters.caseIds }),
            ...(requestedFilters.categories === undefined
              ? {}
              : { categories: requestedFilters.categories }),
            ...(requestedFilters.severities === undefined
              ? {}
              : { severities: requestedFilters.severities }),
            ...(requestedFilters.tags === undefined ? {} : { tags: requestedFilters.tags }),
          };
    return {
      project: project.detail,
      config: {
        ...config,
        execution: {
          ...config.execution,
          ...(overrides?.concurrency === undefined ? {} : { concurrency: overrides.concurrency }),
          ...(overrides?.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs }),
          ...(overrides?.maxRetries === undefined ? {} : { maxRetries: overrides.maxRetries }),
          ...(overrides?.maxEstimatedCostUsd === undefined
            ? {}
            : { maxEstimatedCostUsd: overrides.maxEstimatedCostUsd }),
        },
      },
      suite: registeredSuite.suite,
      schemaRoot: project.schemaRoot,
      ...(filters === undefined ? {} : { filters }),
      ...(targetFixtures === undefined ? {} : { targetFixtures }),
    };
  }
}
