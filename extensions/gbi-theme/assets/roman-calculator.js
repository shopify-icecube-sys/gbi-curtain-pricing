const ROMAN_CONFIG = {
  lining: {
    "Bonded": 11.00,
    "Blackout Bonded": 11.00, // Placeholder as requested
    "Thermal Lining": 11.00   // Placeholder as requested
  },
  labourPerWidth: 25.00,
  cassetteFixed: 25.00,
  postage: 20.00
};

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
  // if width < 120cm: Drop + 20cm
  // if width >= 120cm: Drop + 20cm + (repeat * 2)
  let fabricRequiredCm = 0;
  let numWidths = Math.ceil(width / 140); // Standard roll width assumption for labour

  if (width < 120) {
    fabricRequiredCm = drop + 20;
  } else {
    fabricRequiredCm = drop + 20 + (verticalRepeat * 2);
  }

  // Convert to metres and round up to 1 decimal
  let fabricMetres = Math.ceil((fabricRequiredCm / 100) * 10) / 10;

  // Calculate costs
  let totalFabricCost = fabricMetres * fabricRRP;
  let totalLiningCost = fabricMetres * liningCost;
  let totalLabourCost = numWidths * ROMAN_CONFIG.labourPerWidth;
  let totalCassetteCost = ROMAN_CONFIG.cassetteFixed;

  let finalPrice = totalFabricCost + totalLiningCost + totalLabourCost + totalCassetteCost + ROMAN_CONFIG.postage;

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
  const forms = document.querySelectorAll('form[action*="/cart/add"]');

  if (forms.length === 0) {
    console.warn('[GBI Roman] No add to cart forms found.');
    return;
  }

  forms.forEach(form => {
    let existingInput = form.querySelector(`input[name="properties[${propertyName}]"]`);

    if (!existingInput) {
      existingInput = document.createElement('input');
      existingInput.type = 'hidden';
      existingInput.name = `properties[${propertyName}]`;
      form.appendChild(existingInput);
    }

    existingInput.value = propertyValue;
    console.log(`[GBI Roman] Injected ${propertyName} = ${propertyValue} into form`);
  });
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

  if (!form.action || !form.action.includes('/cart/add')) return;

  const calculatorExists = document.getElementById('gbi-roman-calculate-btn');
  if (!calculatorExists) return;

  const existingInput = form.querySelector('input[name="properties[_calculated_price]"]');

  if (!existingInput || !existingInput.value) {
    console.warn('[GBI Roman] Missing calculated price before submit');
    e.preventDefault();
    alert('Please calculate the Roman Blind price first before adding to cart.');
    return;
  }
});
