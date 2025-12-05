// background.js — Universal matching + hybrid AI + routing

console.log("AutoApply Pro: Background script loaded");

let cachedJob = null;

// ----------------------------------------------
// Router
// ----------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("AutoApply Pro: BG received", msg);

  const map = {
    extractJobDetails: () => handleExtract(sendResponse),
    matchResumeToJob: () => handleMatch(sendResponse),
    generateCoverLetter: () => handleCoverLetter(sendResponse),
    autoFillForm: () => handleAutofill(sendResponse)
  };

  if (map[msg.action]) {
    map[msg.action]();
  } else {
    sendResponse({ error: "Unknown action: " + msg.action });
  }

  return true;
});

// ----------------------------------------------
// Utility: Active tab
// ----------------------------------------------
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

// ----------------------------------------------
// 1️⃣ Extract Job Details
// ----------------------------------------------
async function handleExtract(sendResponse) {
  try {
    const tab = await getActiveTab();
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: "extractJobDetails"
    });

    cachedJob = res.jobDetails || null;
    sendResponse({ jobDetails: cachedJob });
  } catch (err) {
    console.error("Extract error:", err);
    sendResponse({ error: err.message });
  }
}

// ----------------------------------------------
// 2️⃣ Universal Resume Matching (Hybrid)
// ----------------------------------------------
async function handleMatch(sendResponse) {
  try {
    const user = await chrome.storage.sync.get([
      "resumeText",
      "skills",
      "name",
      "geminiKey"
    ]);

    if (!user.resumeText || !Array.isArray(user.skills)) {
      return sendResponse({
        error: "Please complete your profile in Settings (resume + skills)."
      });
    }

    // Ensure we have job details
    if (!cachedJob) {
      const tab = await getActiveTab();
      const res = await chrome.tabs.sendMessage(tab.id, {
        action: "extractJobDetails"
      });
      cachedJob = res.jobDetails;
    }

    if (!cachedJob || !cachedJob.description) {
      return sendResponse({ error: "Unable to extract job details." });
    }

    const jobDesc = cachedJob.description;

    // 1) Local keyword/skill extraction
    const localTerms = extractKeyTerms(jobDesc, 25); // generic important terms
    let jobSkills = localTerms.slice(0, 12); // treat top as "skills"
    let jobKeywords = localTerms.slice(0, 20);

    // 2) Optional AI-enhanced skill extraction (hybrid)
    if (user.geminiKey) {
      try {
        const aiSkills = await extractSkillsWithGemini(jobDesc, user.geminiKey);
        jobSkills = mergeUnique(jobSkills, aiSkills);
      } catch (e) {
        console.warn("Gemini skill extraction failed, using local only:", e.message);
      }
    }

    const matchResult = matchResumeUniversal(cachedJob, user, jobSkills, jobKeywords);
    sendResponse({ matchResult });

  } catch (err) {
    console.error("Match error:", err);
    sendResponse({ error: err.message });
  }
}

// ----------------------------------------------
// Local term extraction (domain-agnostic)
// ----------------------------------------------
const STOPWORDS = new Set([
  "the","and","for","with","you","your","our","this","that","from","will","have","are",
  "job","role","responsibilities","responsibility","requirements","requirement",
  "skills","skill","about","company","candidate","work","team","we","us","they","their",
  "who","what","when","where","how","must","should","such","as","also","etc","able"
]);

function extractKeyTerms(text, limit = 25) {
  if (!text) return [];

  const cleaned = text
    .replace(/[\r\n]+/g, " ")
    .replace(/[^a-zA-Z0-9+\/\- ]+/g, " ")
    .toLowerCase();

  const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  const freq = new Map();

  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  return sorted.slice(0, limit);
}

// Merge & dedupe arrays (strings)
function mergeUnique(a = [], b = []) {
  const set = new Set();
  a.forEach(x => x && set.add(x.toLowerCase()));
  b.forEach(x => x && set.add(x.toLowerCase()));
  return Array.from(set);
}

// ----------------------------------------------
// Hybrid: Gemini Skill Extraction (fallback / enhancer)
// ----------------------------------------------
async function extractSkillsWithGemini(description, apiKey) {
  if (!description || !apiKey) return [];

  const prompt = `
You are helping extract skills from a job posting.

Job description:
${description}

Task:
- Extract up to 12 of the most important skills, competencies, tools, or domain-specific keywords.
- These can be technical skills, soft skills, tools, software, or domain knowledge.
- Output them as a comma-separated list only. No extra text.
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gemini skill extraction error");
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return text
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

// ----------------------------------------------
// Universal resume–job matching
// ----------------------------------------------
function matchResumeUniversal(job, user, jobSkills, jobKeywords) {
  const jobDesc = (job.description || "").toLowerCase();
  const resume = (user.resumeText || "").toLowerCase();

  // Build resume skills from user skills + extracted terms from resume
  const resumeTerms = extractKeyTerms(user.resumeText || "", 25);
  const resumeSkills = mergeUnique(user.skills || [], resumeTerms);

  const jobSkillsNorm = jobSkills.map(s => s.toLowerCase());
  const resumeSkillsNorm = resumeSkills.map(s => s.toLowerCase());

  // Matching and missing skills
  const matchingSkills = jobSkillsNorm.filter(s =>
    resumeSkillsNorm.includes(s) || resume.includes(s)
  );

  const missingSkills = jobSkillsNorm.filter(
    s => !resumeSkillsNorm.includes(s) && !resume.includes(s)
  );

  // Relevant keywords: those job keywords that appear in resume
  const relevantKeywords = (jobKeywords || []).filter(k =>
    resume.includes(k.toLowerCase())
  );

  // Scores
  let skillMatchPercentage = 0;
  if (jobSkillsNorm.length > 0) {
    skillMatchPercentage = Math.round(
      (matchingSkills.length / jobSkillsNorm.length) * 100
    );
  } else {
    // If no skills extracted, fall back to similarity alone
    skillMatchPercentage = Math.round(similarity(jobDesc, resume) * 100);
  }

  const similarityScore = similarity(jobDesc, resume) * 100; // 0–100
  const keywordScore = Math.min(100, relevantKeywords.length * 10);
  const missingPenalty = Math.min(30, missingSkills.length * 3); // cap penalty

  const finalScore = Math.max(
    0,
    Math.round(
      skillMatchPercentage * 0.45 +
        similarityScore * 0.35 +
        keywordScore * 0.20 -
        missingPenalty * 0.2
    )
  );

  return {
    skillMatchPercentage,
    matchingSkills,
    missingSkills,
    relevantKeywords,
    score: finalScore
  };
}

// Basic overlap similarity
function similarity(a, b) {
  if (!a || !b) return 0;
  const aWords = a.split(/\W+/).filter(w => w.length > 3);
  const bSet = new Set(b.split(/\W+/).filter(w => w.length > 3));
  if (aWords.length === 0 || bSet.size === 0) return 0;

  let match = 0;
  aWords.forEach(w => {
    if (bSet.has(w)) match++;
  });

  return match / aWords.length;
}

// ----------------------------------------------
// 3️⃣ Universal Cover Letter (field-agnostic)
// ----------------------------------------------
async function handleCoverLetter(sendResponse) {
  try {
    const tab = await getActiveTab();

    if (!cachedJob) {
      const res = await chrome.tabs.sendMessage(tab.id, {
        action: "extractJobDetails"
      });
      cachedJob = res.jobDetails;
    }

    if (!cachedJob || !cachedJob.description) {
      return sendResponse({ error: "Could not extract job details." });
    }

    const user = await chrome.storage.sync.get([
      "name",
      "email",
      "phone",
      "resumeText",
      "skills",
      "geminiKey"
    ]);

    if (!user.geminiKey) {
      return sendResponse({
        error: "Missing Gemini API Key in Settings."
      });
    }

    const coverLetter = await generateCoverLetterAI(cachedJob, user);
    sendResponse({ coverLetter });

  } catch (err) {
    console.error("Cover letter error:", err);
    sendResponse({ error: err.message });
  }
}

async function generateCoverLetterAI(job, user) {
  const prompt = `
You are an assistant helping a candidate apply for a job in ANY domain.

Job:
Title: ${job.title || "Not specified"}
Company: ${job.company || "Not specified"}
Location: ${job.location || "Not specified"}
Description:
${job.description || "Not provided"}

Candidate:
Name: ${user.name || "Candidate"}
Skills: ${(user.skills || []).join(", ")}
Resume Summary (raw text):
${(user.resumeText || "").substring(0, 800)}

Write a professional, concise cover letter:
- Adapt tone and content to the job domain (could be tech, HR, marketing, finance, core engineering, healthcare, etc.).
- Highlight relevant skills and experience.
- Do NOT exceed 300 words.
- Avoid generic filler.
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${user.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gemini cover letter error");
  }

  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

// ----------------------------------------------
// 4️⃣ Auto-fill passthrough
// ----------------------------------------------
async function handleAutofill(sendResponse) {
  try {
    const tab = await getActiveTab();
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: "autoFillForm"
    });
    sendResponse(res);
  } catch (err) {
    console.error("Autofill error:", err);
    sendResponse({ error: err.message });
  }
}
