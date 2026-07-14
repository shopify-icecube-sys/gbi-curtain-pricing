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

function runRomanCalculation() {
  console.log("GBI Roman Engine: Starting Calculation...");

  const widthInput = document.getElementById('gbi-roman-width');
  const dropInput = document.getElementById('gbi-roman-drop');
  const width = parseFloat(widthInput?.value) || 0;
  const drop = parseFloat(dropInput?.value) || 0;

  if (width <= 0 || drop <= 0) {
    alert("Please enter valid width and drop.");
    return;
  }

  // Get Lining selection (similar to Curtain logic)
  function getVisibleValue(name) {
    const legends = document.querySelectorAll('fieldset legend');
    for (let legend of legends) {
      if (legend.textContent.trim().includes(name)) {
        const checkedInput = legend.parentElement.querySelector('input[type="radio"]:checked');
        if (checkedInput) {
          return checkedInput.value.trim();
        }
      }
    }

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
    return null;
  }

  let liningName = getVisibleValue("Lining");

  if (!liningName) {
    alert("Please select a Lining variant.");
    return;
  }

  const fabricRRP = parseFloat(document.getElementById('gbi-roman-meta-metre-cost')?.value) || 0;
  const verticalRepeat = parseFloat(document.getElementById('gbi-roman-meta-vertical-repeat')?.value) || 0;

  const liningCost = ROMAN_CONFIG.lining[liningName];

  if (liningCost === undefined) {
    console.warn("Mapping missing for selected lining:", liningName);
    return;
  }

  // Roman Blind Fabric Logic
  // if width <= 120cm: 1 width of fabric = Drop + 20cm hem
  // if width > 120cm: 2 widths of fabric = (Drop + 20cm hem + repeat) x 2
  let fabricRequiredCm = 0;
  let numWidths = width <= 120 ? 1 : 2;

  if (width <= 120) {
    fabricRequiredCm = drop + 20;
  } else {
    fabricRequiredCm = (drop + 20 + verticalRepeat) * 2;
  }

  // Convert to metres and round up to 1 decimal
  let fabricMetres = Math.ceil((fabricRequiredCm / 100) * 10) / 10;

  // Calculate costs
  let totalFabricCost = fabricMetres * fabricRRP;
  let totalLiningCost = fabricMetres * liningCost;
  
  // Use new Matrix for Make up and Headrail
  let totalMakeupAndHeadrail = getRomanMakeupCost(width, drop);
  
  let finalPrice = totalFabricCost + totalLiningCost + totalMakeupAndHeadrail + ROMAN_CONFIG.postage;

  const priceDisplay = document.getElementById('gbi-roman-display-price');
  if (priceDisplay) {
    priceDisplay.style.opacity = '0.5';
    setTimeout(() => {
      const formattedPrice = "₹" + finalPrice.toFixed(2);
      priceDisplay.innerText = formattedPrice;
      priceDisplay.style.opacity = '1';

      // Inject _calculated_price (must match Cart Transform function's attribute key)
      injectRomanHiddenPropertyToForm('gbi_calculated_price', finalPrice.toFixed(2));
      injectRomanHiddenPropertyToForm('Width (cm)', width);
      injectRomanHiddenPropertyToForm('Drop (cm)', drop);

    }, 50);
  }
}

function injectRomanHiddenPropertyToForm(propertyName, propertyValue) {
  // First try finding inside <product-form>, fallback to action attribute
  const form = document.querySelector('product-form form') || document.querySelector('form[action*="/cart/add"]');

  if (!form) {
    console.warn('[GBI Roman] Add to cart form not found.');
    return;
  }

  let existingInput = form.querySelector(`input[name="properties[${propertyName}]"]`);

  if (!existingInput) {
    existingInput = document.createElement('input');
    existingInput.type = 'hidden';
    existingInput.name = `properties[${propertyName}]`;
    form.appendChild(existingInput);
  }

  existingInput.value = propertyValue;
  console.log(`[GBI Roman] Injected ${propertyName} = ${propertyValue} into form`);
}

document.addEventListener('DOMContentLoaded', function () {
  const calcBtn = document.getElementById('gbi-roman-calculate-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', function (e) {
      e.preventDefault();
      runRomanCalculation();
    });
  }
});

document.addEventListener('submit', function (e) {
  const form = e.target;

  if (!form.closest('product-form') && (!form.action || !form.action.includes('/cart/add'))) return;

  const calculatorExists = document.getElementById('gbi-roman-calculate-btn');
  if (!calculatorExists) return;

  const existingInput = form.querySelector('input[name="properties[gbi_calculated_price]"]');

  if (!existingInput || !existingInput.value) {
    console.warn('[GBI Roman] Missing calculated price before submit');
    e.preventDefault();
    e.stopImmediatePropagation(); // Stop theme's AJAX script from firing
    alert('Please calculate the Roman Blind price first before adding to cart.');
    return;
  }
});
