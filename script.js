const state = {
  recentExperience: null,
  caseData: null,
  aiReview: null,
  relayTarget: null,
  relayMessage: null,
  sendIntent: null,
  feedback: null
};

const screens = [...document.querySelectorAll(".screen")];
const progressSteps = [...document.querySelectorAll("[data-progress]")];
const flowStatus = document.getElementById("flow-status");
const globalNav = document.querySelector(".global-nav");
const menuToggle = document.getElementById("menu-toggle");
let maxUnlockedStep = 1;

function unlockStep(step) {
  maxUnlockedStep = Math.max(maxUnlockedStep, step);
  progressSteps.forEach((el) => {
    const n = Number(el.dataset.progress);
    el.disabled = n > maxUnlockedStep;
  });
}

function showScreen(id) {
  screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === id));
  const active = document.getElementById(id);
  const step = Number(active.dataset.step || 1);
  progressSteps.forEach((el) => {
    const n = Number(el.dataset.progress);
    el.classList.toggle("is-active", n === step);
    el.classList.toggle("is-complete", n < step);
    if (n === step) el.setAttribute("aria-current", "step");
    else el.removeAttribute("aria-current");
  });
  flowStatus.textContent = `${step} / 5`;
  document.title = `${step}단계 · CatGuard Relay`;
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => active.focus({ preventScroll: true }), 300);
}

progressSteps.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (!tab.disabled) showScreen(tab.dataset.navScreen);
  });
});

document.querySelectorAll("[data-landing-anchor]").forEach((button) => {
  button.addEventListener("click", () => {
    showScreen("screen-landing");
    globalNav.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    window.setTimeout(() => document.getElementById(button.dataset.landingAnchor)?.scrollIntoView({ behavior: "smooth" }), 80);
  });
});

menuToggle.addEventListener("click", () => {
  const open = globalNav.classList.toggle("is-menu-open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
});

function setHidden(el, hidden) {
  el.classList.toggle("hidden", hidden);
}

function getChecked(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function renderList(element, values) {
  element.replaceChildren();
  const list = Array.isArray(values) && values.length ? values : ["확인 불가"];
  list.forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    element.appendChild(li);
  });
}

function wait(ms = 450) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSentence(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// 로컬 데모 처리기: 외부 API 호출 없이 사용자가 입력한 사실만 재구성한다.
function buildLocalReview(caseData) {
  const observed = [
    `부재 유형: ${caseData.absenceType}`,
    `집을 비운 시간: ${caseData.absenceDuration}`,
    `마지막 원격 확인 시각: ${caseData.lastCheckTime}`,
    `홈캠에서 직접 확인한 내용: ${normalizeSentence(caseData.observedFacts)}`
  ];

  if (caseData.deviceAlert) {
    observed.push(`기기 알림 문구: ${normalizeSentence(caseData.deviceAlert)}`);
  }
  if (caseData.imageFile) {
    observed.push("사용자가 홈캠 캡처 이미지 1장을 첨부했습니다. 로컬 데모에서는 이미지 내용 자체를 분석하지 않습니다.");
  }

  const unknown = [
    "현재 시점의 실제 반려묘 상태는 원격 입력만으로 확정할 수 없습니다.",
    "입력되지 않은 식사·음수·배변·이동 상황은 확인할 수 없습니다."
  ];
  if (caseData.imageFile) {
    unknown.push("첨부 이미지의 내용은 로컬 데모 처리기에서 해석하지 않습니다.");
  }
  if (caseData.availableContact === "없음") {
    unknown.push("현재 입력 기준으로 현장 확인을 부탁할 수 있는 사람이 없습니다.");
  }

  const reasons = [
    `사용자가 추가 확인이 필요하다고 느낀 이유: ${normalizeSentence(caseData.concernReason)}`,
    "원격 확인 정보만으로 현재 상태를 확정할 수 없어, 보호자가 필요하다고 판단하면 현장 확인을 고려할 수 있습니다."
  ];

  return {
    observed_facts: observed,
    unknown_or_missing: unknown,
    reasons_to_consider_check: reasons,
    available_person: caseData.availableContact || "확인 불가"
  };
}

function buildLocalRelayMessage(caseData, target) {
  const alertLine = caseData.deviceAlert
    ? `\n- 기기 알림: ${normalizeSentence(caseData.deviceAlert)}`
    : "";

  return `[CatGuard Relay 현장 확인 요청]\n\n${target}에게 부탁드립니다.\n\n제가 지금 ${caseData.absenceType}으로 집을 비운 상태입니다.\n- 집을 비운 시간: ${caseData.absenceDuration}\n- 마지막 원격 확인: ${caseData.lastCheckTime}\n- 홈캠에서 확인한 내용: ${normalizeSentence(caseData.observedFacts)}\n- 추가 확인이 필요하다고 느낀 이유: ${normalizeSentence(caseData.concernReason)}${alertLine}\n\n가능하시면 집에 가서 현재 상황을 한 번 확인해 주세요.\n이 요청은 질병·응급 여부를 판단한 것이 아니라, 원격 확인만으로 알 수 없는 부분을 직접 확인하기 위한 요청입니다.`;
}

// Screen A
const recentExperienceInputs = [...document.querySelectorAll('input[name="recentExperience"]')];
const startButton = document.getElementById("start-button");
const notTargetNote = document.getElementById("not-target-note");

recentExperienceInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.recentExperience = input.value;
    startButton.disabled = false;
    setHidden(notTargetNote, input.value !== "no");
  });
});

startButton.addEventListener("click", () => {
  if (state.recentExperience === "yes") {
    unlockStep(2);
    showScreen("screen-input");
  } else {
    setHidden(notTargetNote, false);
  }
});

// Screen B
const caseForm = document.getElementById("case-form");
const consent = document.getElementById("privacy-consent");
const aiSubmitButton = document.getElementById("ai-submit-button");
const formError = document.getElementById("form-error");

function updateAiSubmitState() {
  aiSubmitButton.disabled = !consent.checked;
}
consent.addEventListener("change", updateAiSubmitState);

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setHidden(formError, true);

  if (!caseForm.checkValidity() || !consent.checked) {
    formError.textContent = "필수 항목과 개인정보·이미지 처리 동의를 확인해주세요.";
    setHidden(formError, false);
    caseForm.reportValidity();
    return;
  }

  const imageFile = document.getElementById("camera-image").files[0] || null;
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    formError.textContent = "캡처 이미지는 5MB 이하 파일을 사용해주세요.";
    setHidden(formError, false);
    return;
  }

  state.caseData = {
    absenceType: document.getElementById("absence-type").value,
    absenceDuration: document.getElementById("absence-duration").value.trim(),
    lastCheckTime: document.getElementById("last-check-time").value,
    availableContact: document.getElementById("available-contact").value,
    observedFacts: document.getElementById("observed-facts").value.trim(),
    concernReason: document.getElementById("concern-reason").value.trim(),
    deviceAlert: document.getElementById("device-alert").value.trim(),
    imageFile
  };

  document.getElementById("input-summary").textContent =
    `${state.caseData.absenceType} · ${state.caseData.absenceDuration} · 마지막 확인 ${state.caseData.lastCheckTime} · 현장 확인 가능 대상 ${state.caseData.availableContact}`;

  unlockStep(3);
  showScreen("screen-result");
  await runReview();
});

async function runReview() {
  const loading = document.getElementById("ai-loading");
  const errorBox = document.getElementById("ai-error");
  const resultWrap = document.getElementById("ai-result");

  setHidden(loading, false);
  setHidden(errorBox, true);
  setHidden(resultWrap, true);

  try {
    await wait();
    const result = buildLocalReview(state.caseData);
    state.aiReview = result;
    renderList(document.getElementById("facts-list"), result.observed_facts);
    renderList(document.getElementById("unknown-list"), result.unknown_or_missing);
    renderList(document.getElementById("consider-list"), result.reasons_to_consider_check);
    document.getElementById("available-person").textContent = result.available_person || "확인 불가";
    setHidden(resultWrap, false);
  } catch (error) {
    errorBox.textContent = error.message;
    setHidden(errorBox, false);
  } finally {
    setHidden(loading, true);
  }
}

// Screen C
const relayTargetInputs = [...document.querySelectorAll('input[name="relayTarget"]')];
const relayNextButton = document.getElementById("relay-next-button");
relayTargetInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.relayTarget = input.value;
    relayNextButton.disabled = false;
  });
});

relayNextButton.addEventListener("click", async () => {
  if (!state.relayTarget) return;

  if (state.relayTarget === "지금은 요청하지 않음") {
    state.sendIntent = "없다";
    unlockStep(5);
    showScreen("screen-feedback");
    return;
  }

  document.getElementById("relay-target-label").textContent =
    `${state.relayTarget}에게 보낼 수 있는 현장 확인 요청 내용을 정리합니다.`;
  unlockStep(4);
  showScreen("screen-relay");
  await runRelayMessage();
});

async function runRelayMessage() {
  const loading = document.getElementById("relay-loading");
  const errorBox = document.getElementById("relay-error");
  const contentWrap = document.getElementById("relay-content-wrap");

  setHidden(loading, false);
  setHidden(errorBox, true);
  setHidden(contentWrap, true);

  try {
    await wait(350);
    state.relayMessage = buildLocalRelayMessage(state.caseData, state.relayTarget);
    document.getElementById("relay-message").textContent = state.relayMessage;
    setHidden(contentWrap, false);
  } catch (error) {
    errorBox.textContent = error.message;
    setHidden(errorBox, false);
  } finally {
    setHidden(loading, true);
  }
}

// Screen D
const copyButton = document.getElementById("copy-message-button");
const copyStatus = document.getElementById("copy-status");
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.relayMessage || "");
    copyStatus.textContent = "복사되었습니다.";
  } catch {
    copyStatus.textContent = "복사하지 못했습니다.";
  }
});

const sendIntentInputs = [...document.querySelectorAll('input[name="sendIntent"]')];
const feedbackFromRelay = document.getElementById("feedback-from-relay");
sendIntentInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.sendIntent = input.value;
    feedbackFromRelay.disabled = false;
  });
});
feedbackFromRelay.addEventListener("click", () => {
  unlockStep(5);
  showScreen("screen-feedback");
});

// Back buttons
document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.back));
});

// Screen E
const feedbackForm = document.getElementById("feedback-form");
const feedbackError = document.getElementById("feedback-error");
const feedbackComplete = document.getElementById("feedback-complete");

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setHidden(feedbackError, true);

  if (!feedbackForm.checkValidity()) {
    feedbackError.textContent = "모든 필수 피드백 항목을 선택해주세요.";
    setHidden(feedbackError, false);
    feedbackForm.reportValidity();
    return;
  }

  const aiHelpful = getChecked("aiHelpful");
  const relayIntentFeedback = getChecked("relayIntentFeedback");
  const moreUseful = getChecked("moreUseful");
  const payIntent = getChecked("payIntent");

  if (!aiHelpful || !relayIntentFeedback || !moreUseful || !payIntent) {
    feedbackError.textContent = "모든 필수 피드백 항목을 선택해주세요.";
    setHidden(feedbackError, false);
    return;
  }

  state.feedback = {
    problemFrequency: document.getElementById("problem-frequency").value,
    aiHelpful,
    relayIntentFeedback,
    moreUseful,
    payIntent
  };

  console.info("CatGuard Relay local MVP feedback (not persisted):", {
    recentExperience: state.recentExperience,
    relayTarget: state.relayTarget,
    sendIntent: state.sendIntent,
    feedback: state.feedback
  });

  feedbackForm.reset();
  feedbackForm.classList.add("hidden");
  setHidden(feedbackComplete, false);
});
