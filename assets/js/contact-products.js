import { t, language } from './common.js';
import { enquiryCatalogue } from './enquiry-catalogue.js';
import { findEnquiryProduct, productFromParameters } from './enquiry-products.js';

export function initializeProductFields(form) {
  const group = document.querySelector('#contact-product-group');
  const { requestType, manufacturer, category, product, topicInterest, message } = form.elements;
  const initial = productFromParameters(new URLSearchParams(location.search));
  let automaticTopic = '';
  let automaticMessage = '';
  const labelIndex = () => Math.max(0, ['en', 'el', 'de', 'fr'].indexOf(language));

  function options(select, choices, placeholder, selected) {
    select.replaceChildren(new Option(t(placeholder), ''));
    for (const choice of choices) select.add(new Option(choice.name, choice.id));
    select.value = choices.some((item) => item.id === selected) ? selected : '';
  }

  function update() {
    const active = requestType.value === 'products';
    const previous = {
      manufacturer: manufacturer.value,
      category: category.value,
      product: product.value,
    };
    options(
      manufacturer,
      enquiryCatalogue,
      'contactForm.chooseManufacturer',
      previous.manufacturer,
    );
    let selection = findEnquiryProduct(manufacturer.value, previous.category, previous.product);
    options(
      category,
      (selection.manufacturer?.categories ?? []).map((item) => ({
        id: item.id,
        name: item.labels[labelIndex()],
      })),
      'contactForm.chooseCategory',
      previous.category,
    );
    options(
      product,
      selection.category?.products ?? [],
      'contactForm.chooseProduct',
      previous.product,
    );
    selection = findEnquiryProduct(manufacturer.value, category.value, product.value);
    group.hidden = !active;
    manufacturer.disabled = !active;
    category.disabled = !active || !selection.manufacturer;
    product.disabled = !active || !selection.category;
    for (const select of [manufacturer, category, product]) {
      select.required = active;
      select.setCustomValidity('');
    }
    const selected = active ? selection.product : null;
    const nextTopic = selected?.name ?? '';
    const nextMessage = selected
      ? t('catalog.enquiryMessage').replace('{product}', selected.name)
      : '';
    if (!topicInterest.value || topicInterest.value === automaticTopic)
      topicInterest.value = nextTopic;
    if (!message.value || message.value === automaticMessage) message.value = nextMessage;
    automaticTopic = nextTopic;
    automaticMessage = nextMessage;
  }

  function reset() {
    automaticTopic = '';
    automaticMessage = '';
    if (initial) requestType.value = 'products';
    update();
    if (initial) {
      manufacturer.value = initial.manufacturer.id;
      update();
      category.value = initial.category.id;
      update();
      product.value = initial.product.id;
      update();
    }
  }
  manufacturer.addEventListener('change', () => {
    category.value = '';
    product.value = '';
    update();
  });
  category.addEventListener('change', () => {
    product.value = '';
    update();
  });
  product.addEventListener('change', update);
  requestType.addEventListener('change', update);
  document.addEventListener('languagechange', update);
  reset();
  return { reset };
}
