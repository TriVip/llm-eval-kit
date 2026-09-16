import { dirname, resolve } from "node:path";

import {
  loadEvaluationSuite,
  loadProjectConfig,
  loadStudioProjectManifest,
} from "@llm-eval-kit/config";
import type { ProjectDetail } from "@llm-eval-kit/api-contracts";
import { ConfigurationError } from "@llm-eval-kit/core";

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

export class ProjectRegistry {
  private constructor(
    private readonly projects: ReadonlyMap<string, ProjectDetail>,
    public readonly workspaceRoot: string,
  ) {}

  static async create(options: ProjectRegistryOptions): Promise<ProjectRegistry> {
    const root = await canonicalRoot(options.workspaceRoot);
    const environment = options.environment ?? process.env;
    const projects = new Map<string, ProjectDetail>();
    for (const requestedManifest of options.manifestPaths) {
      const manifestPath = await containedFile(root, requestedManifest, manifestExtensions);
      const manifest = await loadStudioProjectManifest(manifestPath);
      if (projects.has(manifest.id)) {
        throw new ConfigurationError(`Duplicate Studio project id: ${manifest.id}`);
      }
      const manifestDirectory = dirname(manifestPath);
      const targets = await Promise.all(
        manifest.targets.map(async (target) => {
          const configPath = await containedFile(
            root,
            resolve(manifestDirectory, target.config),
            configExtensions,
          );
          const config = await loadProjectConfig(configPath);
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
      const suites = await Promise.all(
        manifest.suites.map(async (suiteEntry) => {
          const suitePath = await containedFile(
            root,
            resolve(manifestDirectory, suiteEntry.file),
            suiteExtensions,
          );
          const suite = await loadEvaluationSuite(suitePath);
          await Promise.all(
            suiteEntry.fixtureSets.map((fixture) =>
              containedFile(root, resolve(manifestDirectory, fixture.file), fixtureExtensions),
            ),
          );
          return {
            id: suiteEntry.id,
            name: suite.name,
            caseCount: suite.cases.length,
            fixtureSets: suiteEntry.fixtureSets.map(({ id }) => ({ id })),
          };
        }),
      );
      projects.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        targets,
        suites,
        scenarios: manifest.scenarios.map((scenario) => ({
          id: scenario.id,
          name: scenario.name ?? scenario.id,
          targetId: scenario.targetId,
          suiteId: scenario.suiteId,
          ...(scenario.fixtureSetId === undefined ? {} : { fixtureSetId: scenario.fixtureSetId }),
        })),
      });
    }
    return new ProjectRegistry(projects, root);
  }

  list(): ProjectDetail[] {
    return [...this.projects.values()];
  }

  get(projectId: string): ProjectDetail | undefined {
    return this.projects.get(projectId);
  }
}
