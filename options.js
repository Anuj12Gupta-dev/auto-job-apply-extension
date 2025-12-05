// options.js — Clean, modern, Tailwind-compatible version

document.addEventListener("DOMContentLoaded", () => {

  // Inputs
  const nameInput = el("name");
  const emailInput = el("email");
  const phoneInput = el("phone");
  const linkedinInput = el("linkedin");
  const resumeText = el("resumeText");
  const resumeFile = el("resumeFile");
  const fileName = el("fileName");
  const newSkill = el("newSkill");
  const skillsContainer = el("skillsContainer");
  const addSkillBtn = el("addSkillBtn");
  const geminiKeyInput = el("geminiKey");
  const saveBtn = el("saveBtn");
  const statusBox = el("statusMessage");

  let resumeBase64 = null;

  // Quick helper
  function el(id) {
    return document.getElementById(id);
  }

  // Load saved data on page load
  loadData();


  // ------------------------------------------
  // FILE UPLOAD
  // ------------------------------------------
  resumeFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) {
      fileName.textContent = "No file chosen";
      resumeBase64 = null;
      return;
    }

    fileName.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      resumeBase64 = e.target.result;

      // If plain text, auto-fill the textarea
      if (file.type === "text/plain") {
        const textPart = e.target.result.split(",")[1];
        resumeText.value = atob(textPart);
      }
    };
    reader.readAsDataURL(file);
  });


  // ------------------------------------------
  // ADD SKILL
  // ------------------------------------------
  addSkillBtn.addEventListener("click", () => {
    const skill = newSkill.value.trim();
    if (!skill) return;

    addSkillTag(skill);
    newSkill.value = "";
  });

  // Add skill via ENTER
  newSkill.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkillBtn.click();
    }
  });


  // Render skill tag
  function addSkillTag(skill) {
    const currentSkills = getSkills();
    if (currentSkills.includes(skill)) {
      showStatus("Skill already exists.", "error");
      return;
    }

    const tag = document.createElement("div");
    tag.className = "flex items-center bg-gray-200 px-3 py-1 rounded-full text-sm";

    tag.innerHTML = `
      <span>${skill}</span>
      <button class="ml-2 text-red-600 hover:text-red-800 font-bold remove">&times;</button>
    `;

    tag.querySelector(".remove").addEventListener("click", () => tag.remove());
    skillsContainer.appendChild(tag);
  }


  // Return array of all skills
  function getSkills() {
    return Array.from(skillsContainer.querySelectorAll("span"))
      .map((s) => s.textContent);
  }


  // ------------------------------------------
  // LOAD SAVED SETTINGS
  // ------------------------------------------
  async function loadData() {
    try {
      const data = await chrome.storage.sync.get([
        "name",
        "email",
        "phone",
        "linkedin",
        "resumeText",
        "skills",
        "geminiKey"
      ]);

      if (data.name) nameInput.value = data.name;
      if (data.email) emailInput.value = data.email;
      if (data.phone) phoneInput.value = data.phone;
      if (data.linkedin) linkedinInput.value = data.linkedin;
      if (data.resumeText) resumeText.value = data.resumeText;

      if (Array.isArray(data.skills)) {
        data.skills.forEach(addSkillTag);
      }

      // DO NOT AUTOFILL API KEY for security (Chrome guidelines)
      // No file reload — Chrome restricts this for user safety

    } catch (err) {
      console.error("Load Error:", err);
      showStatus("Failed to load saved settings.", "error");
    }
  }


  // ------------------------------------------
  // SAVE SETTINGS
  // ------------------------------------------
  saveBtn.addEventListener("click", saveSettings);

  async function saveSettings() {
    try {
      const payload = {
        name: nameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        linkedin: linkedinInput.value,
        resumeText: resumeText.value,
        skills: getSkills(),
      };

      // Only save if user typed a key
      if (geminiKeyInput.value.trim() !== "") {
        payload.geminiKey = geminiKeyInput.value.trim();
      }

      // Save uploaded resume
      if (resumeBase64) {
        payload.resumeFile = resumeBase64;
      }

      await chrome.storage.sync.set(payload);

      showStatus("Settings saved successfully!", "success");
    } catch (err) {
      console.error("Save Error:", err);
      showStatus("Failed to save settings.", "error");
    }
  }


  // ------------------------------------------
  // STATUS BOX (Tailwind compatible)
  // ------------------------------------------
  function showStatus(message, type = "success") {
    statusBox.textContent = message;
    statusBox.className =
      "mt-4 p-3 rounded-lg text-center text-sm " +
      (type === "success"
        ? "bg-green-100 text-green-700 border border-green-300"
        : "bg-red-100 text-red-700 border border-red-300");

    statusBox.classList.remove("hidden");

    setTimeout(() => {
      statusBox.classList.add("hidden");
    }, 3000);
  }
});
