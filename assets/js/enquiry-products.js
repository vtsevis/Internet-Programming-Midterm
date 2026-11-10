import { enquiryCatalogue } from './enquiry-catalogue.js';

export function findEnquiryProduct(manufacturerId, categoryId, productId) {
  const manufacturer = enquiryCatalogue.find((item) => item.id === manufacturerId);
  const category = manufacturer?.categories.find((item) => item.id === categoryId);
  const product = category?.products.find((item) => item.id === productId);
  return { manufacturer, category, product };
}

export function productFromParameters(parameters) {
  const manufacturer = parameters.get('manufacturer');
  const category = parameters.get('category');
  const product = parameters.get('product');
  if (manufacturer || category) {
    const selection = findEnquiryProduct(manufacturer, category, product);
    return selection.product ? selection : null;
  }
  // Preserve links shared before catalogue IDs were included in product URLs.
  for (const maker of enquiryCatalogue)
    for (const group of maker.categories) {
      const item = group.products.find((item) => item.name === product);
      if (item) return { manufacturer: maker, category: group, product: item };
    }
  return null;
}
