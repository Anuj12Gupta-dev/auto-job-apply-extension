// popup.js - Cleaned & optimized for Tailwind UI

document.addEventListener("DOMContentLoaded", () => {

  // Buttons
  const extractBtn = get("extractBtn");
  const matchBtn = get("matchBtn");
  const coverLetterBtn = get("coverLetterBtn");
  const autofillBtn = get("autofillBtn");
  const optionsBtn = get("optionsBtn");

  // UI Elements
  const loading = get("loading");
  const resultBox = get("resultContainer");
  const resultTitle = get("resultTitle");
  const resultContent = get("resultContent");

  // Helper
  function get(id) {
    return document.getElementById(id);
  }

  // UI Handlers
  const ui = {
    showLoading() {
      loading.classList.remove("hidden");
      resultBox.classList.add("hidden");
    },

    hideLoading() {
      loading.classList.add("hidden");
    },

    showResult(title, html) {
      resultTitle.textContent = title;
      resultContent.innerHTML = html;
      resultBox.classList.remove("hidden");
      ui.hideLoading();
    },

    showError(err) {
      console.error("AutoApply Pro Error:", err);
      ui.showResult("Error", `<p class='text-red-600 text-sm'>${err.message || err}</p>`);
    }
  };

  // Messaging Logic
  async function askBackground(message) {
    try {
      ui.showLoading();
      const res = await chrome.runtime.sendMessage(message);

      if (res?.error) throw new Error(res.error);
      return res;
    } catch (e) {
      ui.showError(e);
      throw e;
    }
  }

  // Extract Job Details
  extractBtn.addEventListener("click", async () => {
    try {
      const res = await askBackground({ action: "extractJobDetails" });

      if (!res.jobDetails) {
        ui.showResult("No Job Found", "This page doesn't contain job information.");
        return;
      }

      const job = res.jobDetails;

      const html = `
        <p><strong>Title:</strong> ${job.title || "N/A"}</p>
        <p><strong>Company:</strong> ${job.company || "N/A"}</p>
        <p><strong>Location:</strong> ${job.location || "N/A"}</p>
        <p><strong>Description:</strong><br> ${job.description?.slice(0, 300) || "N/A"}...</p>
        <p><strong>Skills:</strong> ${job.skills?.join(", ") || "N/A"}</p>
      `;

      ui.showResult("Job Details Extracted", html);

    } catch (e) {
      ui.showError(e);
    }
  });

  // Match Resume
  matchBtn.addEventListener("click", async () => {
    try {
      const res = await askBackground({ action: "matchResumeToJob" });
      const m = res.matchResult;

      if (!m) {
        ui.showResult("Match Failed", "Save your resume in Settings first.");
        return;
      }

      const html = `
        <p><strong>Skill Match:</strong> <span class='text-blue-600 font-semibold'>${m.skillMatchPercentage}%</span></p>
        <p><strong>Matching Skills:</strong> ${m.matchingSkills?.join(", ") || "None"}</p>
        <p><strong>Missing Skills:</strong> <span class='text-red-600'>${m.missingSkills?.join(", ") || "None"}</span></p>
        <p><strong>Relevant Keywords:</strong> ${m.relevantKeywords?.join(", ") || "None"}</p>
        <p><strong>Overall Score:</strong> <span class='font-semibold'>${m.score}/100</span></p>
      `;

      ui.showResult("Resume Match Result", html);

    } catch (e) {
      ui.showError(e);
    }
  });

  // Generate Cover Letter
  coverLetterBtn.addEventListener("click", async () => {
    try {
      const res = await askBackground({ action: "generateCoverLetter" });

      if (!res.coverLetter) {
        ui.showResult("Cover Letter Failed", "Check your API key in Settings.");
        return;
      }

      ui.showResult("Generated Cover Letter", `<p class="whitespace-pre-line">${res.coverLetter}</p>`);

    } catch (e) {
      ui.showError(e);
    }
  });

  // Autofill Application
  autofillBtn.addEventListener("click", () => {
    ui.showResult(
      "Auto-Fill Confirmation",
      `
      <p>Do you want to auto-fill the job application?</p>
      <button id="confirmFill" 
        class="mt-3 w-full py-2 rounded bg-green-600 text-white hover:bg-green-700">
        Yes, Fill Now
      </button>
      `
    );

    setTimeout(() => {
      const confirmFill = get("confirmFill");
      if (!confirmFill) return;

      confirmFill.addEventListener("click", async () => {
        try {
          ui.showLoading();
          const res = await askBackground({ action: "autoFillForm" });

          if (res.success) {
            ui.showResult("Success", `<p class="text-green-600">Form filled successfully 🎉</p>`);
          } else {
            ui.showResult("Failed", `<p class="text-red-600">Could not autofill the form.</p>`);
          }

        } catch (e) {
          ui.showError(e);
        }
      });
    }, 100);
  });

  // Open Settings
  optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
});
