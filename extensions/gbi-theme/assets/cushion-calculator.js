const CUSHION_CONFIG = {
  fabricMultiplier: 0.6,
  labourCost: 25.00,
  postage: 10.00
};

function gbiCushionNormalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function gbiCushionNumberFrom(id, fallback) {
  const el = document.getElementById(id);
  const value = parseFloat(el && el.value);
  return isNaN(value) ? fallback : value;
}

function gbiCushionVariantData() {
  const el = document.getElementById('gbi-variant-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.warn('[GBI Cushion] Could not parse variant data', e);
    return null;
  }
}

function gbiCushionForm() {
  return document.querySelector('product-form form[action*="/cart/add"]')
    || document.querySelector('form[action*="/cart/add"]');
}

function gbiCushionVariantId() {
  const form = gbiCushionForm();
  const input = form && form.querySelector('[name="id"]');
  const value = input && (input.value || input.getAttribute('value'));
  return value ? String(value).trim() : null;
}

// Reads the selected option values straight off the variant, so it works no
// matter how the theme renders the picker (dropdown, radios, swatches).
function gbiCushionOptions() {
  const data = gbiCushionVariantData();
  const variantId = gbiCushionVariantId();
  if (!data || !variantId) return {};

  const values = data.variants ? data.variants[variantId] : null;
  if (!values) return {};

  const names = data.optionNames || [];
  const result = {};
  names.forEach(function (name, index) {
    const key = gbiCushionNormalise(name);
    if (key.indexOf('edging') !== -1) result.edging = values[index];
    if (key.indexOf('size') !== -1) result.size = values[index];
  });
  return result;
}

function gbiCushionFormatMoney(amount) {
  const data = gbiCushionVariantData() || {};
  const currency = data.currency || 'GBP';
  try {
    return new Intl.NumberFormat(data.locale || 'en-GB', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (e) {
    return currency + ' ' + amount.toFixed(2);
  }
}

// Cushion filler, charged per pad. Matched on the wording so the option labels
// on the product page can be reworded without breaking the pricing.
function gbiCushionFillerRate(value) {
  const key = gbiCushionNormalise(value);
  if (key.indexOf('feather') !== -1) return gbiCushionNumberFrom('gbi-cushion-filler-feather', 25.00);
  if (key.indexOf('fibre') !== -1 || key.indexOf('fiber') !== -1) {
    return gbiCushionNumberFrom('gbi-cushion-filler-fibre', 13.00);
  }
  return 0;
}

function gbiCushionFillerSelect() {
  return document.querySelector('select[name="properties[Cushion Filler]"]');
}

function gbiCushionSelectedFiller() {
  const select = gbiCushionFillerSelect();
  return select ? select.value : '';
}

// Show the charge next to each filler option, using the rates from the block
// settings so there is only one place to change them.
function gbiCushionLabelFillerOptions() {
  const select = gbiCushionFillerSelect();
  if (!select) return;
  Array.prototype.forEach.call(select.options, function (option) {
    const rate = gbiCushionFillerRate(option.value);
    const base = option.getAttribute('data-gbi-label') || option.textContent.trim();
    option.setAttribute('data-gbi-label', base);
    option.textContent = rate > 0 ? base + ' (+' + gbiCushionFormatMoney(rate) + ')' : base;
  });
}

// The product page shows the line total, so the price follows the quantity box.
// The cart property stays per unit - Shopify multiplies it by the line quantity.
function gbiCushionQuantity() {
  const form = gbiCushionForm();
  const input = form && form.querySelector('[name="quantity"]');
  const value = parseInt(input && input.value, 10);
  return isNaN(value) || value < 1 ? 1 : value;
}

let gbiCushionHasCalculated = false;
let gbiCushionLastVariantId = null;

function runCushionCalculation(options) {
  const silent = !!(options && options.silent);

  const fabricRRP = gbiCushionNumberFrom('gbi-cushion-meta-metre-cost', 0);

  if (fabricRRP <= 0) {
    console.warn('[GBI Cushion] Fabric cost missing or zero');
    if (!silent) alert('This fabric has no price set. Please contact us.');
    resetCushionPrice();
    return;
  }

  const multiplier = gbiCushionNumberFrom('gbi-cushion-multiplier', CUSHION_CONFIG.fabricMultiplier);
  const labour = gbiCushionNumberFrom('gbi-cushion-labour', CUSHION_CONFIG.labourCost);
  const postage = gbiCushionNumberFrom('gbi-cushion-postage', CUSHION_CONFIG.postage);
  const pipedExtra = gbiCushionNumberFrom('gbi-cushion-piped-extra', 0);

  const selected = gbiCushionOptions();
  const isPiped = gbiCushionNormalise(selected.edging) === 'piped';
  const edgingCost = isPiped ? pipedExtra : 0;

  // Cost of fabric x multiplier + labour + p&p (+ piped edging when set)
  const fillerName = gbiCushionSelectedFiller();
  const fillerCost = gbiCushionFillerRate(fillerName);

  const totalFabricCost = fabricRRP * multiplier;
  const finalPrice = totalFabricCost + labour + postage + edgingCost + fillerCost;

  console.log('[GBI Cushion] Breakdown', {
    edging: selected.edging || null,
    size: selected.size || null,
    fabricRatePerMetre: fabricRRP,
    multiplier: multiplier,
    totalFabricCost: totalFabricCost,
    labour: labour,
    postage: postage,
    edgingCost: edgingCost,
    filler: fillerName || null,
    fillerCost: fillerCost,
    finalPrice: finalPrice
  });

  const quantity = gbiCushionQuantity();

  const priceDisplay = document.getElementById('gbi-cushion-display-price');
  if (priceDisplay) {
    priceDisplay.innerText = gbiCushionFormatMoney(finalPrice * quantity);
  }

  const qtyNote = document.getElementById('gbi-cushion-qty-note');
  if (qtyNote) {
    qtyNote.innerText = quantity > 1
      ? quantity + ' \u00d7 ' + gbiCushionFormatMoney(finalPrice) + ' each'
      : '';
  }

  const breakdown = document.getElementById('gbi-cushion-price-breakdown');
  if (breakdown) {
    breakdown.innerHTML = [
      'Fabric ' + gbiCushionFormatMoney(fabricRRP) + '/m x ' + multiplier + ' = ' + gbiCushionFormatMoney(totalFabricCost),
      'Making ' + gbiCushionFormatMoney(labour),
      'Delivery ' + gbiCushionFormatMoney(postage)
    ].concat(
      edgingCost > 0 ? ['Piped edging ' + gbiCushionFormatMoney(edgingCost)] : []
    ).concat(
      fillerCost > 0 ? [fillerName + ' ' + gbiCushionFormatMoney(fillerCost)] : []
    ).join('<br>');
  }

  gbiCushionHasCalculated = true;
  gbiCushionInjectProperty('gbi_calculated_price', finalPrice.toFixed(2));
}

function resetCushionPrice() {
  gbiCushionHasCalculated = false;

  const priceDisplay = document.getElementById('gbi-cushion-display-price');
  if (priceDisplay) priceDisplay.innerText = gbiCushionFormatMoney(0);

  const qtyNote = document.getElementById('gbi-cushion-qty-note');
  if (qtyNote) qtyNote.innerText = '';

  const breakdown = document.getElementById('gbi-cushion-price-breakdown');
  if (breakdown) breakdown.innerHTML = '';

  const form = gbiCushionForm();
  if (!form) return;
  const stale = form.querySelector('input[name="properties[gbi_calculated_price]"]');
  if (stale) stale.remove();
}

function gbiCushionInjectProperty(propertyName, propertyValue) {
  const form = gbiCushionForm();

  if (!form) {
    console.warn('[GBI Cushion] Add to cart form not found.');
    return;
  }

  let existingInput = form.querySelector('input[name="properties[' + propertyName + ']"]');

  if (!existingInput) {
    existingInput = document.createElement('input');
    existingInput.type = 'hidden';
    existingInput.name = 'properties[' + propertyName + ']';
    form.appendChild(existingInput);
  }

  existingInput.value = propertyValue;
}

// The price must follow the variant picker. Themes update [name="id"] via JS
// (no change event in many custom themes), so poll the selected variant id.
function gbiCushionWatchVariant() {
  gbiCushionLastVariantId = gbiCushionVariantId();

  setInterval(function () {
    const id = gbiCushionVariantId();
    if (!id || id === gbiCushionLastVariantId) return;
    gbiCushionLastVariantId = id;

    if (gbiCushionHasCalculated) {
      runCushionCalculation({ silent: true });
    } else {
      resetCushionPrice();
    }
  }, 300);
}

// Delegated so it survives theme section re-renders on variant change.
document.addEventListener('click', function (e) {
  const btn = e.target.closest && e.target.closest('#gbi-cushion-calculate-btn');
  if (!btn) return;
  e.preventDefault();
  runCushionCalculation();
});

document.addEventListener('submit', function (e) {
  const form = e.target;

  if (!form.closest('product-form') && (!form.action || !form.action.includes('/cart/add'))) return;
  if (!document.getElementById('gbi-cushion-calculate-btn')) return;

  const existingInput = form.querySelector('input[name="properties[gbi_calculated_price]"]');

  if (!existingInput || !parseFloat(existingInput.value)) {
    console.warn('[GBI Cushion] Missing calculated price before submit');
    e.preventDefault();
    e.stopImmediatePropagation(); // Stop theme's AJAX script from firing
    alert('Please calculate the Cushion price first before adding to cart.');
  }
});

gbiCushionWatchVariant();

document.addEventListener('change', function (e) {
  if (e.target && e.target.name === 'properties[Cushion Filler]') {
    if (gbiCushionHasCalculated) runCushionCalculation({ silent: true });
  }
});

document.addEventListener('DOMContentLoaded', gbiCushionLabelFillerOptions);
gbiCushionLabelFillerOptions();

function gbiCushionOnQuantityChange(e) {
  if (!e.target || e.target.name !== 'quantity') return;
  if (gbiCushionHasCalculated) runCushionCalculation({ silent: true });
}
document.addEventListener('change', gbiCushionOnQuantityChange);
document.addEventListener('input', gbiCushionOnQuantityChange);
