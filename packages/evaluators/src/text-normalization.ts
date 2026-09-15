export type UnicodeForm = "NFC" | "NFD" | "NFKC" | "NFKD";

export type TextNormalizationConfig = {
  caseSensitive?: boolean;
  unicodeNormalization?: UnicodeForm;
};

export function isTextNormalizationConfig(value: Record<string, unknown>): boolean {
  return (
    (value.caseSensitive === undefined || typeof value.caseSensitive === "boolean") &&
    (value.unicodeNormalization === undefined ||
      ["NFC", "NFD", "NFKC", "NFKD"].includes(String(value.unicodeNormalization)))
  );
}

export function normalizeText(value: string, config: TextNormalizationConfig): string {
  const normalized = value.normalize(config.unicodeNormalization ?? "NFC");
  return config.caseSensitive === false ? normalized.toLocaleLowerCase("en-US") : normalized;
}
