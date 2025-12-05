// content.js — Extracts raw job information + auto-fill logic

console.log("AutoApply Pro: Content script loaded");

// Utility: wait for dynamic elements (React/SPA portals)
function waitFor(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const interval = 100;
    let waited = 0;

    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      }
      waited += interval;
      if (waited >= timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

// Extract text using a list of selectors
function extractText(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 3) {
      return el.textContent.trim();
    }
  }
  return "";
}

// Main extraction function — universal
async function extractJobDetails() {
  console.log("AutoApply Pro: Extracting job details...");

  const selectors = {
    title: [
      "[data-test-job-title]",
      "[data-testid='job-title']",
      ".job-details__title",
      ".top-card-layout__title",
      "h1"
    ],
    company: [
      ".top-card-layout__second-subline a",
      "[data-testid='company-name']",
      ".company-name",
      ".job-company",
      ".employer",
      ".company"
    ],
    location: [
      ".top-card__flavor--bullet",
      "[data-testid='job-location']",
      ".job-location",
      ".location"
    ],
    description: [
      ".jobs-description-content__text",
      ".description__text",
      "[data-testid='job-description']",
      "#job-details",
      ".job-description",
      ".description"
    ]
  };

  // Wait for dynamic pages to render something
  await waitFor(selectors.title[0], 3500);

  const jobDetails = {
    title: extractText(selectors.title),
    company: extractText(selectors.company),
    location: extractText(selectors.location),
    description: extractText(selectors.description)
  };

  console.log("AutoApply Pro: Extracted job details:", jobDetails);
  return jobDetails;
}

// -------------------------------
// Auto-fill application forms (field-agnostic)
// -------------------------------
async function autoFillForm() {
  console.log("AutoApply Pro: Auto-filling form...");

  try {
    const user = await chrome.storage.sync.get([
      "name",
      "email",
      "phone",
      "linkedin",
      "resumeText"
    ]);

    const selectors = {
      name: [
        "input[name*='name' i]",
        "input[id*='name' i]",
        "input[placeholder*='name' i]"
      ],
      email: [
        "input[type='email']",
        "input[name*='mail' i]",
        "input[placeholder*='email' i]"
      ],
      phone: [
        "input[type='tel']",
        "input[name*='phone' i]",
        "input[placeholder*='phone' i]"
      ],
      website: [
        "input[name*='website' i]",
        "input[name*='portfolio' i]",
        "input[name*='link' i]",
        "input[placeholder*='portfolio' i]",
        "input[placeholder*='linkedin' i]"
      ],
      coverLetter: [
        "textarea[name*='cover' i]",
        "textarea[placeholder*='cover' i]"
      ]
    };

    const fill = (selectorList, value) => {
      if (!value) return;
      for (const sel of selectorList) {
        const el = document.querySelector(sel);
        if (!el || el.disabled || el.type === "hidden") continue;

        const lastValue = el.value;
        el.value = value;

        const event = new Event("input", { bubbles: true });
        if (el._valueTracker) {
          el._valueTracker.setValue(lastValue);
        }
        el.dispatchEvent(event);
        el.dispatchEvent(new Event("change", { bubbles: true }));

        console.log("AutoApply Pro: Filled", sel);
        return true;
      }
    };

    fill(selectors.name, user.name);
    fill(selectors.email, user.email);
    fill(selectors.phone, user.phone);
    fill(selectors.website, user.linkedin);

    console.log("AutoApply Pro: Form auto-fill completed");
    return { success: true };
  } catch (err) {
    console.error("AutoApply Pro: Auto-fill error:", err);
    return { success: false, error: err.message };
  }
}

// -------------------------------
// Message listener
// -------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("AutoApply Pro: Content script message:", message);

  if (message.action === "extractJobDetails") {
    extractJobDetails().then((jobDetails) => sendResponse({ jobDetails }));
  }

  if (message.action === "autoFillForm") {
    autoFillForm().then((result) => sendResponse(result));
  }

  return true;
});
