export type FrameworkErrorOptions = {
  code: string;
  safeMessage: string;
  retryable: boolean;
  cause?: unknown;
};

export class FrameworkError extends Error {
  public readonly code: string;
  public readonly safeMessage: string;
  public readonly retryable: boolean;
  public override readonly cause?: unknown;

  public constructor(options: FrameworkErrorOptions) {
    super(options.safeMessage);
    this.name = new.target.name;
    this.code = options.code;
    this.safeMessage = options.safeMessage;
    this.retryable = options.retryable;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class ConfigurationError extends FrameworkError {
  public constructor(safeMessage: string) {
    super({ code: "CONFIGURATION_ERROR", safeMessage, retryable: false });
  }
}

export class DatasetValidationError extends FrameworkError {
  public constructor(safeMessage: string) {
    super({ code: "DATASET_VALIDATION_ERROR", safeMessage, retryable: false });
  }
}

export class ProviderError extends FrameworkError {
  public constructor(options: FrameworkErrorOptions) {
    super(options);
  }
}

export class EvaluatorError extends FrameworkError {
  public constructor(safeMessage: string, retryable = false, options: { cause?: unknown } = {}) {
    super({
      code: "EVALUATOR_ERROR",
      safeMessage,
      retryable,
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
  }
}

export class ArtifactError extends FrameworkError {
  public constructor(safeMessage: string) {
    super({ code: "ARTIFACT_ERROR", safeMessage, retryable: false });
  }
}

export class InternalError extends FrameworkError {
  public constructor(safeMessage = "An internal framework error occurred.") {
    super({ code: "INTERNAL_ERROR", safeMessage, retryable: false });
  }
}
