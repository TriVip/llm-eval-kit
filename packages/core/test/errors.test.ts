import { describe, expect, it } from "vitest";

import {
  ArtifactError,
  ConfigurationError,
  DatasetValidationError,
  EvaluatorError,
  FrameworkError,
  InternalError,
  ProviderError,
} from "../src/index.js";

describe("framework error model", () => {
  it("keeps a safe public message and a stable code", () => {
    const error = new ConfigurationError("The configuration is invalid.");

    expect(error).toBeInstanceOf(FrameworkError);
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.safeMessage).toBe("The configuration is invalid.");
    expect(error.retryable).toBe(false);
  });

  it("separates dataset failures from provider failures", () => {
    const datasetError = new DatasetValidationError("Case id is required.");
    const providerError = new ProviderError({
      code: "PROVIDER_RATE_LIMIT",
      safeMessage: "The provider rate limit was reached.",
      retryable: true,
    });

    expect(datasetError.code).toBe("DATASET_VALIDATION_ERROR");
    expect(providerError.code).toBe("PROVIDER_RATE_LIMIT");
    expect(providerError.retryable).toBe(true);
  });

  it("retains an internal cause without exposing it as the safe message", () => {
    const cause = new Error("sensitive upstream details");
    const error = new ProviderError({
      code: "PROVIDER_SERVER_ERROR",
      safeMessage: "The provider request failed.",
      retryable: true,
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe("The provider request failed.");
  });

  it("provides stable codes for evaluator, artifact, and internal failures", () => {
    const evaluatorError = new EvaluatorError("The evaluator output was invalid.", true);
    const artifactError = new ArtifactError("The run artifact could not be written.");
    const internalError = new InternalError();

    expect(evaluatorError).toMatchObject({ code: "EVALUATOR_ERROR", retryable: true });
    expect(artifactError).toMatchObject({ code: "ARTIFACT_ERROR", retryable: false });
    expect(internalError).toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "An internal framework error occurred.",
    });
  });
});
