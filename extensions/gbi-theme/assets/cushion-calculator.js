const CUSHION_CONFIG = {
  fabricMultiplier: 0.6,
  labourCost: 25.00,
  postage: 10.00
};

function runCushionCalculation() {
  console.log("GBI Cushion Engine: Starting Calculation...");

  const fabricRRP = parseFloat(document.getElementById('gbi-cushion-meta-metre-cost')?.value) || 0;

  if (fabricRRP <= 0) {
    console.warn("Fabric cost missing or zero");
  }

  // Cost of fabric x 0.6 + labour cost £25 + £10 p&p
  let totalFabricCost = fabricRRP * CUSHION_CONFIG.fabricMultiplier;

  let finalPrice = totalFabricCost + CUSHION_CONFIG.labourCost + CUSHION_CONFIG.postage;

  const priceDisplay = document.getElementById('gbi-cushion-display-price');
  if (priceDisplay) {
    priceDisplay.style.opacity = '0.5';
    setTimeout(() => {
      const formattedPrice = "₹" + finalPrice.toFixed(2);
      priceDisplay.innerText = formattedPrice;
      priceDisplay.style.opacity = '1';

      // Inject the calculated price. 
      // ⚠️ IMPORTANT: I am using _calculated_price to ensure the backend Cart Transform works!
      // If you changed the backend GraphQL back to gbi_calculated_price, you can change this too.
      injectCushionHiddenPropertyToForm('gbi_calculated_price', finalPrice.toFixed(2));

    }, 50);
  }
}

function injectCushionHiddenPropertyToForm(propertyName, propertyValue) {
  const form = document.querySelector('product-form form') || document.querySelector('form[action*="/cart/add"]');

  if (!form) {
    console.warn('[GBI Cushion] Add to cart form not found.');
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
  console.log(`[GBI Cushion] Injected ${propertyName} = ${propertyValue} into form`);
}

document.addEventListener('DOMContentLoaded', function () {
  const calcBtn = document.getElementById('gbi-cushion-calculate-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', function (e) {
      e.preventDefault();
      runCushionCalculation();
    });
  }
});

document.addEventListener('submit', function (e) {
  const form = e.target;

  if (!form.closest('product-form') && (!form.action || !form.action.includes('/cart/add'))) return;

  const calculatorExists = document.getElementById('gbi-cushion-calculate-btn');
  if (!calculatorExists) return;

  // Change this if you changed the backend to gbi_calculated_price
  const existingInput = form.querySelector('input[name="properties[gbi_calculated_price]"]');

  if (!existingInput || !existingInput.value) {
    console.warn('[GBI Cushion] Missing calculated price before submit');
    e.preventDefault();
    e.stopImmediatePropagation();
    alert('Please calculate the Cushion price first before adding to cart.');
    return;
  }
});
