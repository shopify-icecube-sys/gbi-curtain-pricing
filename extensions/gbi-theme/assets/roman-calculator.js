const ROMAN_CONFIG = {
  lining: {
    "Bonded": 11.00,
    "Blackout Bonded": 11.00,
    "Thermal Lining": 11.00,
    "Standard Ivory": 5.00,
    "Blackout": 7.00,
    "Unlined": 0.00
  },
  postage: 20.00
};

const ROMAN_MAKEUP_GRID = {
  widths: [65, 110, 140, 170, 200, 230, 250],
  drops: [
    { maxDrop: 95, prices: [180, 204, 228, 252, 276, 300, 324] },
    { maxDrop: 125, prices: [192, 216, 240, 264, 288, 312, 336] },
    { maxDrop: 155, prices: [204, 228, 252, 276, 300, 324, 348] },
    { maxDrop: 170, prices: [216, 240, 264, 288, 312, 336, 360] },
    { maxDrop: 200, prices: [228, 252, 276, 300, 324, 348, 372] },
    { maxDrop: 230, prices: [240, 264, 288, 312, 336, 360, 384] },
    { maxDrop: 250, prices: [252, 276, 300, 324, 348, 372, 396] }
  ]
};

function getRomanMakeupCost(width, drop) {
  let widthIndex = ROMAN_MAKEUP_GRID.widths.length - 1;
  for (let i = 0; i < ROMAN_MAKEUP_GRID.widths.length; i++) {
    if (width <= ROMAN_MAKEUP_GRID.widths[i]) {
      widthIndex = i;
      break;
    }
  }

  let dropRow = ROMAN_MAKEUP_GRID.drops[ROMAN_MAKEUP_GRID.drops.length - 1];
  for (let i = 0; i < ROMAN_MAKEUP_GRID.drops.length; i++) {
    if (drop <= ROMAN_MAKEUP_GRID.drops[i].maxDrop) {
      dropRow = ROMAN_MAKEUP_GRID.drops[i];
      break;
    }
  }

  return dropRow.prices[widthIndex];
}

// "Thermal  Lining" / "thermal lining" / "THERMAL-LINING" all resolve to the same key.
function gbiRomanNormalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function gbiRomanLookup(table, value) {
  if (value == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(table, value)) return table[value];
  const wanted = gbiRomanNormalise(value);
  for (const key of Object.keys(table)) {
    if (gbiRomanNormalise(key) === wanted) return table[key];
  }
  return undefined;
}

function gbiRomanVariantData() {
  const el = document.getElementById('gbi-variant-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.warn('[GBI Roman] Could not parse variant data', e);
    return null;
  }
}

function gbiRomanForm() {
  return document.querySelector('product-form form[action*="/cart/add"]')
    || document.querySelector('form[action*="/cart/add"]');
}

function gbiRomanVariantId() {
  const form = gbiRomanForm();
  const input = form && form.querySelector('[name="id"]');
  const value = input && (input.value || input.getAttribute('value'));
  return value ? String(value).trim() : null;
}

// Reads Lining from the SELECTED VARIANT, so it works whether the theme renders
// the option picker as radios, swatches or a dropdown.
function gbiRomanLiningFromVariant() {
  const data = gbiRomanVariantData();
  const variantId = gbiRomanVariantId();
  if (!data || !variantId) return null;

  const values = data.variants ? data.variants[variantId] : null;
  if (!values) return null;

  const names = data.optionNames || [];
  for (let i = 0; i < names.length; i++) {
    if (gbiRomanNormalise(names[i]).indexOf('lining') !== -1) return values[i];
  }
  return null;
}

// Legacy DOM scraping, kept only as a fallback when the variant map is unavailable.
function gbiRomanLiningFromDom() {
  const legends = document.querySelectorAll('fieldset legend');
  for (const legend of legends) {
    if (legend.textContent.trim().includes('Lining')) {
      const checked = legend.parentElement.querySelector('input[type="radio"]:checked');
      if (checked) return checked.value.trim();
    }
  }

  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.trim().includes('Lining')) {
      const selectId = label.getAttribute('for');
      const select = selectId ? document.getElementById(selectId) : null;
      if (select && select.value) return select.value.trim();
    }
  }

  return null;
}

function gbiRomanFormatMoney(amount) {
  const data = gbiRomanVariantData() || {};
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

let gbiRomanHasCalculated = false;
let gbiRomanLastVariantId = null;

function runRomanCalculation(options) {
  const silent = !!(options && options.silent);

  const widthInput = document.getElementById('gbi-roman-width');
  const dropInput = document.getElementById('gbi-roman-drop');
  const width = parseFloat(widthInput && widthInput.value) || 0;
  const drop = parseFloat(dropInput && dropInput.value) || 0;

  if (width <= 0 || drop <= 0) {
    if (!silent) alert('Please enter valid width and drop.');
    resetRomanPrice();
    return;
  }

  const liningName = gbiRomanLiningFromVariant() || gbiRomanLiningFromDom();

  if (!liningName) {
    if (!silent) alert('Please select a Lining variant.');
    resetRomanPrice();
    return;
  }

  const liningCost = gbiRomanLookup(ROMAN_CONFIG.lining, liningName);

  if (liningCost === undefined) {
    console.warn('[GBI Roman] Mapping missing for selected lining:', liningName);
    if (!silent) alert('Pricing is not configured for the selected lining. Please contact us.');
    resetRomanPrice();
    return;
  }

  const fabricRRP = parseFloat(document.getElementById('gbi-roman-meta-metre-cost') && document.getElementById('gbi-roman-meta-metre-cost').value) || 0;
  const verticalRepeat = parseFloat(document.getElementById('gbi-roman-meta-vertical-repeat') && document.getElementById('gbi-roman-meta-vertical-repeat').value) || 0;
  const postageEl = document.getElementById('gbi-roman-fixed-postage');
  const postage = parseFloat(postageEl && postageEl.value) || ROMAN_CONFIG.postage;

  // Roman Blind Fabric Logic
  // Cutoff is now 123cm according to client.
  let fabricRequiredCm = 0;

  if (width <= 123) {
    // 1 width is ok
    fabricRequiredCm = drop + 20;
  } else {
    // 2 widths of fabric pattern matched: (drop + 20) * 2 + vertical repeat
    fabricRequiredCm = ((drop + 20) * 2) + verticalRepeat;
  }

  // Convert to metres and round up to 1 decimal
  const fabricMetres = Math.ceil((fabricRequiredCm / 100) * 10) / 10;

  // Calculate costs
  const totalFabricCost = fabricMetres * fabricRRP;
  const totalLiningCost = fabricMetres * liningCost;

  // Use new Matrix for Make up and Headrail
  const totalMakeupAndHeadrail = getRomanMakeupCost(width, drop);

  const finalPrice = totalFabricCost + totalLiningCost + totalMakeupAndHeadrail + postage;

  console.log('[GBI Roman] Breakdown', {
    lining: liningName,
    liningRatePerMetre: liningCost,
    fabricMetres: fabricMetres,
    totalFabricCost: totalFabricCost,
    totalLiningCost: totalLiningCost,
    makeupAndHeadrail: totalMakeupAndHeadrail,
    postage: postage,
    finalPrice: finalPrice
  });

  const priceDisplay = document.getElementById('gbi-roman-display-price');
  if (priceDisplay) {
    priceDisplay.innerText = gbiRomanFormatMoney(finalPrice);
  }

  const breakdown = document.getElementById('gbi-roman-price-breakdown');
  if (breakdown) {
    breakdown.innerHTML = [
      fabricMetres.toFixed(1) + 'm fabric @ ' + gbiRomanFormatMoney(fabricRRP) + '/m',
      liningName + ' lining @ ' + gbiRomanFormatMoney(liningCost) + '/m',
      'Make up & headrail ' + gbiRomanFormatMoney(totalMakeupAndHeadrail),
      'Delivery ' + gbiRomanFormatMoney(postage)
    ].join('<br>');
  }

  gbiRomanHasCalculated = true;
  gbiRomanInjectProperty('gbi_calculated_price', finalPrice.toFixed(2));
  gbiRomanInjectProperty('Width (cm)', width);
  gbiRomanInjectProperty('Drop (cm)', drop);
}

function resetRomanPrice() {
  gbiRomanHasCalculated = false;

  const priceDisplay = document.getElementById('gbi-roman-display-price');
  if (priceDisplay) priceDisplay.innerText = gbiRomanFormatMoney(0);

  const breakdown = document.getElementById('gbi-roman-price-breakdown');
  if (breakdown) breakdown.innerHTML = '';

  const form = gbiRomanForm();
  if (!form) return;
  const stale = form.querySelector('input[name="properties[gbi_calculated_price]"]');
  if (stale) stale.remove();
}

function gbiRomanInjectProperty(propertyName, propertyValue) {
  const form = gbiRomanForm();

  if (!form) {
    console.warn('[GBI Roman] Add to cart form not found.');
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
function gbiRomanWatchVariant() {
  gbiRomanLastVariantId = gbiRomanVariantId();

  setInterval(function () {
    const id = gbiRomanVariantId();
    if (!id || id === gbiRomanLastVariantId) return;
    gbiRomanLastVariantId = id;

    if (gbiRomanHasCalculated) {
      runRomanCalculation({ silent: true });
    } else {
      resetRomanPrice();
    }
  }, 300);
}

// Delegated so it survives theme section re-renders on variant change.
document.addEventListener('click', function (e) {
  const btn = e.target.closest && e.target.closest('#gbi-roman-calculate-btn');
  if (!btn) return;
  e.preventDefault();
  runRomanCalculation();
});

document.addEventListener('input', function (e) {
  if (e.target.id === 'gbi-roman-width' || e.target.id === 'gbi-roman-drop') {
    if (gbiRomanHasCalculated) runRomanCalculation({ silent: true });
  }
});

document.addEventListener('submit', function (e) {
  const form = e.target;

  if (!form.closest('product-form') && (!form.action || !form.action.includes('/cart/add'))) return;
  if (!document.getElementById('gbi-roman-calculate-btn')) return;

  const existingInput = form.querySelector('input[name="properties[gbi_calculated_price]"]');

  if (!existingInput || !parseFloat(existingInput.value)) {
    console.warn('[GBI Roman] Missing calculated price before submit');
    e.preventDefault();
    e.stopImmediatePropagation(); // Stop theme's AJAX script from firing
    alert('Please calculate the Roman Blind price first before adding to cart.');
  }
});

gbiRomanWatchVariant();
