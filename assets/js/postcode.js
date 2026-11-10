import { postcodeRules } from './postcode-rules.js';

export function postcodeRule(country) {
  return Object.hasOwn(postcodeRules, country) ? postcodeRules[country] : null;
}

export function validatePostcode(country, input) {
  const rule = postcodeRule(country);
  const value = typeof input === 'string' ? input.trim().toUpperCase() : '';
  if (
    !rule ||
    typeof input !== 'string' ||
    value.length > 20 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return { valid: false, value };
  if (!value) return { valid: !rule.required, value };
  const valid = rule.pattern
    ? new RegExp(`^(?:${rule.pattern})$`, 'i').test(value)
    : /^[A-Z0-9][A-Z0-9 -]*$/.test(value);
  return { valid, value };
}
