import { localRequest } from './browser-service.js';
import { t, language } from './common.js';
import { postcodeRule, validatePostcode } from './postcode.js';
import { initializeProductFields } from './contact-products.js';
import { initializeContactDropdowns } from './contact-dropdowns.js';

export function initializeContact() {
  const form = document.querySelector('#contact-form');
  const status = document.querySelector('#form-status');
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.querySelector('[data-i18n]');
  const productFields = initializeProductFields(form);
  let pending = false;
  let feedback = '';
  let reference = '';

  function updatePostcode() {
    const { country, postcode } = form.elements;
    const rule = postcodeRule(country.value);
    const countryName = country.selectedOptions[0].textContent;
    const example = rule?.examples[0];
    const exampleHint = example ? t('postcode.example').replace('{example}', example) : '';
    postcode.required = Boolean(rule?.required);
    document.querySelector('#postcode-required').hidden = !postcode.required;
    postcode.placeholder = example ?? '';
    let hint = exampleHint;
    if (!rule?.supported) hint = t('postcode.unavailable');
    else if (!rule.usesPostcode) hint = t('postcode.notUsed');
    else if (!rule.required) hint = `${t('postcode.optional')} ${exampleHint}`.trim();
    document.querySelector('#postcode-hint').textContent = hint;
    const result = validatePostcode(country.value, postcode.value);
    postcode.setCustomValidity(
      !result.valid && postcode.value
        ? `${t('postcode.invalid').replace('{country}', countryName)} ${exampleHint}`.trim()
        : '',
    );
  }
  function updateCountries() {
    if (!form.elements.country) return;
    const names = new Intl.DisplayNames([language], { type: 'region' });
    for (const option of form.elements.country.options) option.textContent = names.of(option.value);
  }
  function showFeedback(key = '', enquiryReference = '') {
    feedback = key;
    reference = enquiryReference;
    status.textContent = key ? t(key).replace('{reference}', enquiryReference) : '';
    status.classList.toggle('is-success', key === 'form.submitted');
    status.classList.toggle('is-error', Boolean(key && key !== 'form.submitted'));
  }
  updateCountries();
  updatePostcode();
  form.elements.country?.addEventListener('change', () => {
    const phoneCode = form.elements.phoneCode;
    if ([...phoneCode.options].some((option) => option.value === form.elements.country.value))
      phoneCode.value = form.elements.country.value;
    updatePostcode();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    for (const field of form.querySelectorAll('[required]'))
      field.setCustomValidity(field.value.trim() ? '' : t('form.required'));
    const telephone = form.elements.telephone;
    if (telephone) {
      const digits = telephone.value.replace(/\D/g, '');
      telephone.setCustomValidity(
        /^[0-9\s()+.\-]+$/.test(telephone.value.trim()) && digits.length >= 5 && digits.length <= 15
          ? ''
          : t('form.invalidPhone'),
      );
    }
    updatePostcode();
    if (!form.reportValidity()) return;
    pending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    submitLabel.textContent = t('form.submitting');
    showFeedback();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await localRequest('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({
          kind: form.dataset.kind,
          language,
          fields: Object.fromEntries(new FormData(form)),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        showFeedback(response.status === 429 ? 'form.rateLimit' : 'form.submitError');
        const invalid = result.field && form.elements.namedItem(result.field);
        if (invalid?.setCustomValidity) {
          invalid.setCustomValidity(t('form.invalidField'));
          invalid.reportValidity();
        }
        return;
      }
      if (typeof result.reference !== 'string') throw new Error('Missing confirmation.');
      form.reset();
      productFields.reset();
      updatePostcode();
      showFeedback('form.submitted', result.reference);
    } catch {
      showFeedback('form.submitError');
    } finally {
      clearTimeout(timeout);
      pending = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      submitLabel.textContent = t('form.submit');
    }
  });
  form.addEventListener('input', (event) => {
    event.target.setCustomValidity?.('');
    if (event.target === form.elements.postcode) updatePostcode();
    if (!pending) showFeedback();
  });
  form.addEventListener('change', () => {
    if (!pending) showFeedback();
  });
  document.addEventListener('languagechange', () => {
    updateCountries();
    form.querySelectorAll('[required]').forEach((field) => field.setCustomValidity(''));
    updatePostcode();
    submitLabel.textContent = t(pending ? 'form.submitting' : 'form.submit');
    showFeedback(feedback, reference);
  });
  initializeContactDropdowns(form);
  submit.disabled = false;
}
