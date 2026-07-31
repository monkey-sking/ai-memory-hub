function cleanStringList(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function normalizeReviewDimensions(value) {
  return cleanStringList(value);
}

export function normalizeAdversarialVerifier(value) {
  if (value === true) {
    return { enabled: true, checks: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, checks: [] };
  }
  return {
    enabled: value.enabled === true,
    checks: cleanStringList(value.checks)
  };
}

export function validateReviewDimensions(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    return { valid: false, error: "reviewDimensions must be an array of non-empty strings" };
  }
  return { valid: true };
}

export function validateAdversarialVerifier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, error: "adversarialVerifier must be an object" };
  }
  if (typeof value.enabled !== "boolean") {
    return { valid: false, error: "adversarialVerifier.enabled must be a boolean" };
  }
  if (value.checks !== undefined) {
    const validation = validateReviewDimensions(value.checks);
    if (!validation.valid) {
      return { valid: false, error: "adversarialVerifier.checks must be an array of non-empty strings" };
    }
  }
  return { valid: true };
}
