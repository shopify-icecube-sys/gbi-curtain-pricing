const GBI_MASTER_CONFIG = {
  lining: {
    "Standard Ivory": 5.00,
    "Ivory Sateen": 5.00,
    "Poly Cotton": 5.00,
    "Satin Lined": 10.00,
    "Blackout": 7.00,
    "Thermal Lining": 9.00,
    "Thermal Blackout": 14.00,
    "Unlined": 0.00
  },
  style: {
    "Eyelet": { fullness: 1.7, labor: 73.00 },
    "Pinch Pleat": { fullness: 2.5, labor: 73.00 },
    "Wave": { fullness: 2.2, labor: 55.00 },
    "3inch Pencil Pleat": { fullness: 2.0, labor: 50.00 },
    "6inch Pencil Pleat": { fullness: 2.0, labor: 50.00 },
    "Goblet Pleat": { fullness: 2.5, labor: 73.00 }
  },
  hemAllowance: 30
};

// "Thermal  Lining" / "thermal lining" / "THERMAL-LINING" all resolve to the same key.
function gbiNormalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function gbiLookup(table, value) {
  if (value == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(table, value)) return table[value];
  const wanted = gbiNormalise(value);
  for (const key of Object.keys(table)) {
    if (gbiNormalise(key) === wanted) return table[key];
  }
  return undefined;
}

function gbiVariantData() {
  const el = document.getElementById('gbi-variant-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.warn('[GBI] Could not parse variant data', e);
    return null;
  }
}

function gbiProductForm() {
  return document.querySelector('product-form form[action*="/cart/add"]')
    || document.querySelector('form[action*="/cart/add"]');
}

function gbiCurrentVariantId() {
  const form = gbiProductForm();
  const input = form && form.querySelector('[name="id"]');
  const value = input && (input.value || input.getAttribute('value'));
  return value ? String(value).trim() : null;
}

// Reads Lining / Style from the SELECTED VARIANT, which works no matter how the
// theme renders the option picker (radios, swatches, dropdowns, custom markup).
function gbiOptionsFromVariant() {
  const data = gbiVariantData();
  const variantId = gbiCurrentVariantId();
  if (!data || !variantId) return {};

  const values = data.variants ? data.variants[variantId] : null;
  if (!values) return {};

  const names = data.optionNames || [];
  const result = {};
  names.forEach((name, index) => {
    const key = gbiNormalise(name);
    if (key.indexOf('lining') !== -1) result.lining = values[index];
    if (key.indexOf('style') !== -1 || key.indexOf('heading') !== -1 || key.indexOf('pleat') !== -1) {
      result.style = values[index];
    }
  });
  return result;
}

// Legacy DOM scraping, kept only as a fallback when the variant map is unavailable.
function gbiValueFromDom(name) {
  const legends = document.querySelectorAll('fieldset legend');
  for (const legend of legends) {
    if (legend.textContent.trim().includes(name)) {
      const checkedInput = legend.parentElement.querySelector('input[type="radio"]:checked');
      if (checkedInput) return checkedInput.value.trim();
    }
  }

  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.trim().includes(name)) {
      const selectId = label.getAttribute('for');
      const select = selectId ? document.getElementById(selectId) : null;
      if (select && select.value) return select.value.trim();
    }
  }

  return null;
}

function gbiFormatMoney(amount) {
  const data = gbiVariantData() || {};
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

let gbiHasCalculated = false;
let gbiLastVariantId = null;

function runGbiCalculation(options) {
  const silent = !!(options && options.silent);

  const widthInput = document.getElementById('gbi-width');
  const dropInput = document.getElementById('gbi-drop');
  const width = parseFloat(widthInput && widthInput.value) || 0;
  const drop = parseFloat(dropInput && dropInput.value) || 0;

  if (width <= 0 || drop <= 0) {
    if (!silent) alert('Please enter valid width and drop.');
    resetGbiPrice();
    return;
  }

  const fromVariant = gbiOptionsFromVariant();
  const styleName = fromVariant.style || gbiValueFromDom('Style');
  const liningName = fromVariant.lining || gbiValueFromDom('Lining');

  if (!styleName || !liningName) {
    if (!silent) alert('Please select Style and Lining variants.');
    resetGbiPrice();
    return;
  }

  const style = gbiLookup(GBI_MASTER_CONFIG.style, styleName);
  const liningCost = gbiLookup(GBI_MASTER_CONFIG.lining, liningName);

  if (!style || liningCost === undefined) {
    console.warn('[GBI] Mapping missing for selected options:', styleName, liningName);
    if (!silent) alert('Pricing is not configured for the selected options. Please contact us.');
    resetGbiPrice();
    return;
  }

  const fabricRRP = parseFloat(document.getElementById('gbi-meta-metre-cost') && document.getElementById('gbi-meta-metre-cost').value) || 0;
  const verticalRepeat = parseFloat(document.getElementById('gbi-meta-vertical-repeat') && document.getElementById('gbi-meta-vertical-repeat').value) || 0;
  const rollWidth = parseFloat(document.getElementById('gbi-meta-roll-width') && document.getElementById('gbi-meta-roll-width').value) || 140;
  const postage = parseFloat(document.getElementById('gbi-fixed-postage') && document.getElementById('gbi-fixed-postage').value) || 20.00;

  const totalWidthNeeded = width * style.fullness;
  // Step 1: Strictly round up to the next whole width
  const numWidths = Math.ceil(totalWidthNeeded / rollWidth);

  // Step 2: Calculate cut length per width (rounded up to 1 decimal place)
  const cutLength = Math.ceil(((drop + GBI_MASTER_CONFIG.hemAllowance + verticalRepeat) / 100) * 10) / 10;

  // Step 3: Total Meterage (rounded up to 1 decimal place)
  const totalMeterage = Math.ceil((cutLength * numWidths) * 10) / 10;

  // Step 4: Final Costing
  const fabricTotal = totalMeterage * fabricRRP;
  const liningTotal = totalMeterage * liningCost;
  const laborTotal = numWidths * style.labor;
  const finalPrice = fabricTotal + liningTotal + laborTotal + postage;

  console.log('[GBI] Breakdown', {
    style: styleName,
    lining: liningName,
    liningRatePerMetre: liningCost,
    numWidths: numWidths,
    totalMeterage: totalMeterage,
    fabricTotal: fabricTotal,
    liningTotal: liningTotal,
    laborTotal: laborTotal,
    postage: postage,
    finalPrice: finalPrice
  });

  const priceDisplay = document.getElementById('gbi-display-price');
  if (priceDisplay) {
    priceDisplay.innerText = gbiFormatMoney(finalPrice);
  }

  const breakdown = document.getElementById('gbi-price-breakdown');
  if (breakdown) {
    breakdown.innerHTML = [
      totalMeterage.toFixed(1) + 'm fabric @ ' + gbiFormatMoney(fabricRRP) + '/m',
      liningName + ' lining @ ' + gbiFormatMoney(liningCost) + '/m',
      numWidths + ' width(s) ' + styleName + ' making @ ' + gbiFormatMoney(style.labor),
      'Delivery ' + gbiFormatMoney(postage)
    ].join('<br>');
  }

  gbiHasCalculated = true;
  gbiInjectProperty('gbi_calculated_price', finalPrice.toFixed(2));
  gbiInjectProperty('Width (cm)', width);
  gbiInjectProperty('Drop (cm)', drop);
}

function resetGbiPrice() {
  gbiHasCalculated = false;

  const priceDisplay = document.getElementById('gbi-display-price');
  if (priceDisplay) priceDisplay.innerText = gbiFormatMoney(0);

  const breakdown = document.getElementById('gbi-price-breakdown');
  if (breakdown) breakdown.innerHTML = '';

  const form = gbiProductForm();
  if (!form) return;
  const stale = form.querySelector('input[name="properties[gbi_calculated_price]"]');
  if (stale) stale.remove();
}

function gbiInjectProperty(propertyName, propertyValue) {
  const form = gbiProductForm();

  if (!form) {
    console.warn('[GBI] Add to cart form not found.');
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
function gbiWatchVariant() {
  gbiLastVariantId = gbiCurrentVariantId();

  setInterval(function () {
    const id = gbiCurrentVariantId();
    if (!id || id === gbiLastVariantId) return;
    gbiLastVariantId = id;

    if (gbiHasCalculated) {
      runGbiCalculation({ silent: true });
    } else {
      resetGbiPrice();
    }
  }, 300);
}

// Delegated so it survives theme section re-renders on variant change.
document.addEventListener('click', function (e) {
  const btn = e.target.closest && e.target.closest('#gbi-calculate-btn');
  if (!btn) return;
  e.preventDefault();
  runGbiCalculation();
});

document.addEventListener('input', function (e) {
  if (e.target.id === 'gbi-width' || e.target.id === 'gbi-drop') {
    if (gbiHasCalculated) runGbiCalculation({ silent: true });
  }
});

document.addEventListener('submit', function (e) {
  const form = e.target;
  if (!form.closest('product-form')) return;

  const existingInput = form.querySelector('input[name="properties[gbi_calculated_price]"]');

  if (!existingInput || !parseFloat(existingInput.value)) {
    console.warn('[GBI] Missing calculated price before submit');
    e.preventDefault();
    alert('Please calculate the curtain price first.');
  }
});

gbiWatchVariant();
