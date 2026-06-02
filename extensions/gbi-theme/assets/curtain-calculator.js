const GBI_MASTER_CONFIG = {
  lining: {
    "Standard Ivory": 5.00,
    "Poly Cotton": 5.00,
    "Satin Lined": 10.00,
    "Blackout": 8.00,
    "Thermal Lining": 10.00,
    "Thermal Blackout": 14.00
  },
  style: {
    "Eyelet": { fullness: 1.5, hem: 20, labor: 25.00 },
    "Pinch Pleat": { fullness: 2.5, hem: 20, labor: 25.00 },
    "Wave": { fullness: 2.0, hem: 20, labor: 25.00 },
    "3inch Pencil Pleat": { fullness: 2.0, hem: 20, labor: 25.00 },
    "6inch Pencil Pleat": { fullness: 2.0, hem: 20, labor: 25.00 },
    "Goblet Pleat": { fullness: 2.5, hem: 20, labor: 25.00 }
  }
};

function runGbiCalculation() {
  console.log("GBI Engine: Starting Calculation...");

  const widthInput = document.getElementById('gbi-width');
  const dropInput = document.getElementById('gbi-drop');
  const width = parseFloat(widthInput?.value) || 0;
  const drop = parseFloat(dropInput?.value) || 0;

  if (width <= 0 || drop <= 0) {
    alert("Please enter valid width and drop.");
    return;
  }

  function getVisibleValue(name) {
    // 1. Try finding fieldsets (Radio buttons)
    const legends = document.querySelectorAll('fieldset legend');
    for (let legend of legends) {
      if (legend.textContent.trim().includes(name)) {
        const checkedInput = legend.parentElement.querySelector('input[type="radio"]:checked');
        if (checkedInput) {
          return checkedInput.value.trim();
        }
      }
    }

    // 2. Try finding labels (Dropdowns)
    const labels = document.querySelectorAll('label');
    for (let label of labels) {
      if (label.textContent.trim().includes(name)) {
        const selectId = label.getAttribute('for');
        if (selectId) {
          const select = document.getElementById(selectId);
          if (select) return select.value.trim();
        }
      }
    }

    // 3. Shopify 2.0 variant select fallback
    const form = document.querySelector('form[action*="/cart/add"]');
    if (form) {
      const variantIdInput = form.querySelector('[name="id"]');
      if (variantIdInput) {
        const variantSelect = document.querySelector(`select[name="id"] option[value="${variantIdInput.value}"]`);
        if (variantSelect) {
          const text = variantSelect.textContent;
          if (name === "Style") {
            const styles = Object.keys(GBI_MASTER_CONFIG.style);
            for (let s of styles) if (text.includes(s)) return s;
          }
          if (name === "Lining") {
            const linings = Object.keys(GBI_MASTER_CONFIG.lining);
            for (let l of linings) if (text.includes(l)) return l;
          }
        }
      }
    }

    return null;
  }

  let styleName = getVisibleValue("Style");
  let liningName = getVisibleValue("Lining");

  if (!styleName || !liningName) {
    alert("Please select Style and Lining variants.");
    return;
  }

  const fabricRRP = parseFloat(document.getElementById('gbi-meta-metre-cost')?.value) || 0;
  const verticalRepeat = parseFloat(document.getElementById('gbi-meta-vertical-repeat')?.value) || 0;
  const rollWidth = parseFloat(document.getElementById('gbi-meta-roll-width')?.value) || 140;
  const postage = parseFloat(document.getElementById('gbi-fixed-postage')?.value) || 20.00;

  const style = GBI_MASTER_CONFIG.style[styleName];
  const liningCost = GBI_MASTER_CONFIG.lining[liningName];

  if (!style || liningCost === undefined) {
    console.warn("Mapping missing for selected options:", styleName, liningName);
    return;
  }

  let totalWidthNeeded = width * style.fullness;
  let rawWidths = totalWidthNeeded / rollWidth;
  let numWidths;
  let decimalPart = rawWidths - Math.floor(rawWidths);

  if (decimalPart <= 0.2 && Math.floor(rawWidths) >= 1) {
    numWidths = Math.floor(rawWidths);
  } else {
    numWidths = Math.ceil(rawWidths);
  }

  let dropInMeters = (drop + style.hem + verticalRepeat) / 100;
  let totalMeterage = Math.ceil((dropInMeters * numWidths) * 10) / 10;

  let finalPrice = (totalMeterage * fabricRRP) + (totalMeterage * liningCost) + (numWidths * style.labor) + postage;

  const priceDisplay = document.getElementById('gbi-display-price');
  if (priceDisplay) {
    priceDisplay.style.opacity = '0.5';
    setTimeout(() => {
      const formattedPrice = "₹" + finalPrice.toFixed(2);
      priceDisplay.innerText = formattedPrice;
      priceDisplay.style.opacity = '1';

      // Crucial: Inject hidden property into the product form so it goes to cart
      // We must inject directly into the DOM form because AJAX themes often ignore the `form=` attribute.
      injectHiddenPropertyToForm('gbi_calculated_price', finalPrice.toFixed(2));
      injectHiddenPropertyToForm('Width (cm)', width);
      injectHiddenPropertyToForm('Drop (cm)', drop);

    }, 50);
  }
}

function injectHiddenPropertyToForm(propertyName, propertyValue) {
  const form = document.querySelector('product-form form');

  console.log('[GBI] FORM FOUND:', form);

  if (!form) {
    console.warn('[GBI] Add to cart form not found.');
    return;
  }

  let existingInput = form.querySelector(
    `input[name="properties[${propertyName}]"]`
  );

  if (!existingInput) {
    existingInput = document.createElement('input');
    existingInput.type = 'hidden';
    existingInput.name = `properties[${propertyName}]`;

    form.appendChild(existingInput);
  }

  existingInput.value = propertyValue;

  console.log(`[GBI] Injected ${propertyName} = ${propertyValue}`);
}

document.addEventListener('DOMContentLoaded', function () {
  const calcBtn = document.getElementById('gbi-calculate-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', function (e) {
      e.preventDefault();
      runGbiCalculation();
    });
  }
});
document.addEventListener('submit', function (e) {
  const form = e.target;

  if (!form.closest('product-form')) return;

  const existingInput = form.querySelector(
    'input[name="properties[gbi_calculated_price]"]'
  );

  if (!existingInput) {
    console.warn('[GBI] Missing calculated price before submit');
    e.preventDefault();
    alert('Please calculate the curtain price first.');
    return;
  }

  console.log('[GBI] Cart property submitting:', existingInput.value);
});