const state = {
  recentExperience: null,
  caseData: null,
  aiReview: null,
  relayTarget: null,
  relayMessage: null,
  sendIntent: null,
  feedback: null,
  eventId: null,
  processedImage: null,
  imageProcessing: null,
  imageRevision: 0
};

const AI_ENDPOINT = String(
  window.CATGUARD_CONFIG?.aiEndpoint || "https://catguard-relay-ai.creed3466.workers.dev/analyze"
).trim();
const COLLECT_ENDPOINT = String(
  window.CATGUARD_CONFIG?.collectEndpoint || "https://catguard-relay-ai.creed3466.workers.dev/collect"
).trim();
const TEST_MODE = window.CATGUARD_CONFIG?.testMode !== false;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    image.src = objectUrl;
  });
}

// Canvas로 다시 인코딩하면 EXIF 위치정보가 제거되고 전송량도 작아진다.
async function prepareImage(file) {
  const image = await fileToImage(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
  return {
    mimeType: "image/jpeg",
    data: dataUrl.split(",")[1],
    previewUrl: dataUrl,
    width,
    height,
    bytes: Math.round(dataUrl.length * 0.75)
  };
}

// AI 서버가 설정되지 않았거나 일시적으로 실패해도 전체 MVP 흐름은 유지한다.
function buildLocalReview(caseData) {
  const observed = [
    `부재 유형: ${caseData.absenceType}`,
    `집을 비운 시간: ${caseData.absenceDuration}`,
    `홈캠에서 직접 확인한 내용: ${normalizeSentence(caseData.observedFacts)}`
  ];

  if (caseData.eventDetectionPreview) observed.push("이벤트 감지 분석 Preview가 선택되었습니다.");

  if (caseData.deviceAlert) {
    observed.push(`기기 알림 문구: ${normalizeSentence(caseData.deviceAlert)}`);
  }
  if (caseData.image) {
    observed.push(`홈캠 캡처 1장이 개인정보 메타데이터 제거 후 첨부되었습니다 (${caseData.image.width}×${caseData.image.height}).`);
  }

  const unknown = [
    "현재 시점의 실제 반려묘 상태는 원격 입력만으로 확정할 수 없습니다.",
    "입력되지 않은 식사·음수·배변·이동 상황은 확인할 수 없습니다."
  ];
  if (caseData.image) {
    unknown.push("현재 AI 서버에 연결되지 않아 이미지 속 대상과 행동은 확인하지 못했습니다.");
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
    image_observations: caseData.image
      ? ["이미지 입력은 준비되었지만 현재 로컬 안전 모드에서는 장면을 해석하지 않습니다."]
      : ["분석할 홈캠 캡처가 첨부되지 않았습니다."],
    unknown_or_missing: unknown,
    reasons_to_consider_check: reasons,
    onsite_checklist: ["고양이가 있는 위치 확인", "물과 사료의 남은 양 확인", "화장실과 주변 환경 확인"],
    available_person: caseData.availableContact || "확인 불가",
    scene_summary: caseData.image ? "이미지 분석 서버 연결이 필요합니다." : "입력한 설명을 기준으로 사실을 정리했습니다.",
    confidence: 0,
    mode: "local"
  };
}

function normalizeReview(payload) {
  return {
    observed_facts: Array.isArray(payload.observed_facts) ? payload.observed_facts.slice(0, 6) : [],
    image_observations: Array.isArray(payload.image_observations) ? payload.image_observations.slice(0, 6) : [],
    unknown_or_missing: Array.isArray(payload.unknown_or_missing) ? payload.unknown_or_missing.slice(0, 6) : [],
    reasons_to_consider_check: Array.isArray(payload.reasons_to_consider_check) ? payload.reasons_to_consider_check.slice(0, 5) : [],
    onsite_checklist: Array.isArray(payload.onsite_checklist) ? payload.onsite_checklist.slice(0, 6) : [],
    available_person: normalizeSentence(payload.available_person) || state.caseData.availableContact || "확인 불가",
    scene_summary: normalizeSentence(payload.scene_summary) || "이미지와 설명을 함께 살펴봤습니다.",
    confidence: clamp(payload.confidence, 0, 100),
    mode: payload.mode === "test" ? "test" : "gemini"
  };
}

async function requestAiReview(caseData) {
  if (!AI_ENDPOINT) throw new Error("AI_ENDPOINT_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        caseData: {
          absenceType: caseData.absenceType,
          absenceDuration: caseData.absenceDuration,
          absenceStartDate: caseData.absenceStartDate,
          absenceEndDate: caseData.absenceEndDate,
          lastCheckTime: caseData.lastCheckTime,
          availableContact: caseData.availableContact,
          observedFacts: caseData.observedFacts,
          concernReason: caseData.concernReason,
          deviceAlert: caseData.deviceAlert,
          eventDetectionPreview: caseData.eventDetectionPreview
        },
        image: caseData.image ? { mimeType: caseData.image.mimeType, data: caseData.image.data } : null,
        testMode: TEST_MODE
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `AI 서버 오류 (${response.status})`);
    return normalizeReview(payload);
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildLocalRelayMessage(caseData, target) {
  const alertLine = caseData.deviceAlert
    ? `\n- 기기 알림: ${normalizeSentence(caseData.deviceAlert)}`
    : "";

  const aiLine = state.aiReview?.scene_summary ? `\n- AI 관찰 요약: ${state.aiReview.scene_summary}` : "";
  const checklist = state.aiReview?.onsite_checklist?.length
    ? `\n\n확인 부탁드릴 항목\n${state.aiReview.onsite_checklist.map((item) => `- ${item}`).join("\n")}`
    : "";
  return `[CatGuard Relay 현장 확인 요청]\n\n${target}에게 부탁드립니다.\n\n제가 지금 ${caseData.absenceType}으로 집을 비운 상태입니다.\n- 집을 비운 시간: ${caseData.absenceDuration}\n- 홈캠에서 확인한 내용: ${normalizeSentence(caseData.observedFacts)}\n- 추가 확인이 필요하다고 느낀 이유: ${normalizeSentence(caseData.concernReason)}${alertLine}${aiLine}${checklist}\n\n가능하시면 집에 가서 현재 상황을 한 번 확인해 주세요.\nAI 관찰은 질병·응급 여부를 판단한 것이 아니라, 직접 확인할 항목을 정리한 참고 정보입니다.`;
}

function buildOwnerAlert(caseData) {
  const summary = state.aiReview?.scene_summary || "평소와 다른 장면을 확인했습니다.";
  return {
    title: "확인이 필요한 장면이 감지되었어요",
    preview: `${summary} · ${caseData.absenceDuration}`
  };
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
const cameraImageInput = document.getElementById("camera-image");
const imagePreviewWrap = document.getElementById("image-preview-wrap");
const imagePreview = document.getElementById("image-preview");
const imageMeta = document.getElementById("image-meta");
const removeImageButton = document.getElementById("remove-image");
const useExampleButton = document.getElementById("use-example");
const absenceStartDate = document.getElementById("absence-start-date");
const absenceEndDate = document.getElementById("absence-end-date");
const absenceRangeSummary = document.getElementById("absence-range-summary");
const eventDetectionPreview = document.getElementById("event-detection-preview");

function updateAiSubmitState() {
  aiSubmitButton.disabled = !consent.checked;
}
consent.addEventListener("change", updateAiSubmitState);

function clearPreparedImage() {
  state.imageRevision += 1;
  state.processedImage = null;
  state.imageProcessing = null;
  cameraImageInput.value = "";
  imagePreview.removeAttribute("src");
  setHidden(imagePreviewWrap, true);
}

function showPreparedImage(prepared, label = "위치정보 제거") {
  state.processedImage = prepared;
  imagePreview.src = prepared.previewUrl;
  imageMeta.textContent = `${label} · ${prepared.width} × ${prepared.height} · ${Math.max(1, Math.round(prepared.bytes / 1024))}KB`;
  setHidden(imagePreviewWrap, false);
}

cameraImageInput.addEventListener("change", () => {
  const file = cameraImageInput.files[0];
  const imageRevision = ++state.imageRevision;
  state.processedImage = null;
  imagePreview.removeAttribute("src");
  setHidden(imagePreviewWrap, true);
  setHidden(formError, true);
  if (!file) {
    clearPreparedImage();
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    formError.textContent = "캡처 이미지는 5MB 이하 파일을 사용해주세요.";
    setHidden(formError, false);
    clearPreparedImage();
    return;
  }
  state.imageProcessing = prepareImage(file)
    .then((prepared) => {
      if (imageRevision !== state.imageRevision) return null;
      showPreparedImage(prepared, `${file.name} · 위치정보 제거`);
      return prepared;
    })
    .catch((error) => {
      if (imageRevision !== state.imageRevision) return null;
      clearPreparedImage();
      formError.textContent = error.message;
      setHidden(formError, false);
      throw error;
    });
});

removeImageButton.addEventListener("click", clearPreparedImage);

function localDateDaysFromNow(days) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function formatAbsenceRange(start, end) {
  if (!start || !end) return "시작일과 종료일을 선택하세요";
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const dayCount = Math.max(1, Math.round((endDate - startDate) / 86400000));
  const label = (value) => value.replaceAll("-", ".");
  return `${label(start)} – ${label(end)} · ${dayCount}일`;
}

function updateAbsenceRange() {
  if (absenceStartDate.value) absenceEndDate.min = absenceStartDate.value;
  if (absenceStartDate.value && absenceEndDate.value && absenceEndDate.value < absenceStartDate.value) {
    absenceEndDate.value = absenceStartDate.value;
  }
  absenceRangeSummary.textContent = formatAbsenceRange(absenceStartDate.value, absenceEndDate.value);
}

absenceStartDate.addEventListener("change", updateAbsenceRange);
absenceEndDate.addEventListener("change", updateAbsenceRange);

async function fillExampleData({ onlyMissing = false, focus = false, enablePreview = false, useNeutralImageText = false } = {}) {
  setHidden(formError, true);
  useExampleButton.disabled = true;
  useExampleButton.textContent = "불러오는 중…";
  try {
    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (!onlyMissing || !element.value.trim()) element.value = value;
    };
    setValue("absence-type", "출근");
    setValue("available-contact", "가족");
    if (!onlyMissing || !absenceStartDate.value) absenceStartDate.value = localDateDaysFromNow(0);
    if (!onlyMissing || !absenceEndDate.value) absenceEndDate.value = localDateDaysFromNow(2);
    updateAbsenceRange();
    setValue("observed-facts", useNeutralImageText
      ? "직접 선택한 홈캠 캡처 1장을 기준으로 반려동물의 위치와 주변 환경을 확인합니다. 사진에 보이지 않는 움직임, 식사, 음수와 배변 여부는 알 수 없습니다."
      : "오후 거실 홈캠 캡처에서 고양이 두 마리가 확인됩니다. 회색 줄무늬 고양이는 소파 왼쪽 좌석에 몸을 낮추고 앞을 바라보고 있으며, 흰 고양이는 소파 앞 바닥에 배를 댄 자세로 누워 있습니다. 두 고양이 모두 눈을 뜨고 있고 이미지 안에서 큰 물건이 쓰러지거나 주변이 어질러진 모습은 보이지 않습니다. 다만 물그릇, 사료그릇과 화장실은 카메라 촬영 범위에 포함되지 않아 현재 상태를 확인할 수 없습니다.");
    setValue("concern-reason", useNeutralImageText
      ? "집을 비운 동안 직접 선택한 사진에 보이는 반려동물의 상태와 생활 환경 변화를 확인하고 싶습니다."
      : "평소 활동 시간인데 두 고양이가 약 두 시간 동안 거실 주변의 비슷한 위치에 머무는 이벤트가 감지되었습니다. 사진 한 장만으로 실제 움직임, 식사, 음수, 배변 여부를 알 수 없어 추가 확인이 필요합니다.");
    setValue("device-alert", useNeutralImageText
      ? "직접 업로드한 홈캠 이미지 분석 요청"
      : "이벤트 감지 Preview · 장시간 움직임 없음 패턴이 감지됨");
    if (enablePreview) eventDetectionPreview.checked = true;

    if (!state.processedImage && !state.imageProcessing) {
      cameraImageInput.value = "";
      const response = await fetch("./assets/default/cat-scene-224.jpg", { cache: "force-cache" });
      if (!response.ok) throw new Error("예시 이미지를 불러오지 못했습니다.");
      const blob = await response.blob();
      const file = new File([blob], "cat-scene-224.jpg", { type: "image/jpeg" });
      state.imageProcessing = prepareImage(file);
      const prepared = await state.imageProcessing;
      prepared.isExample = true;
      showPreparedImage(prepared, "자동 적용된 기본 예시");
    }
    if (focus) document.getElementById("observed-facts").focus();
  } catch (error) {
    formError.textContent = error.message || "예시 데이터를 불러오지 못했습니다.";
    setHidden(formError, false);
    throw error;
  } finally {
    useExampleButton.disabled = false;
    useExampleButton.textContent = "예시 다시 불러오기";
  }
}

useExampleButton.addEventListener("click", async () => {
  try {
    await fillExampleData({ focus: true, enablePreview: true });
  } catch {
    // 오류 메시지는 fillExampleData에서 표시한다.
  }
});

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setHidden(formError, true);

  if (!consent.checked) {
    formError.textContent = "분석 전 개인정보·이미지 처리 동의를 확인해주세요.";
    setHidden(formError, false);
    return;
  }

  const isBlankCase = [
    document.getElementById("absence-type").value,
    document.getElementById("available-contact").value,
    absenceStartDate.value,
    absenceEndDate.value,
    document.getElementById("observed-facts").value,
    document.getElementById("concern-reason").value,
    document.getElementById("device-alert").value
  ].every((value) => !String(value).trim()) && !state.processedImage && !state.imageProcessing;
  const hasDirectImage = Boolean(cameraImageInput.files[0]) || Boolean(state.processedImage && !state.processedImage.isExample);

  try {
    await fillExampleData({ onlyMissing: true, enablePreview: isBlankCase, useNeutralImageText: hasDirectImage });
  } catch {
    return;
  }

  if (state.imageProcessing) {
    aiSubmitButton.disabled = true;
    try {
      await state.imageProcessing;
    } catch {
      aiSubmitButton.disabled = false;
      return;
    }
    aiSubmitButton.disabled = false;
  }

  state.caseData = {
    absenceType: document.getElementById("absence-type").value,
    absenceStartDate: absenceStartDate.value,
    absenceEndDate: absenceEndDate.value,
    absenceDuration: formatAbsenceRange(absenceStartDate.value, absenceEndDate.value),
    lastCheckTime: absenceEndDate.value,
    availableContact: document.getElementById("available-contact").value,
    observedFacts: document.getElementById("observed-facts").value.trim(),
    concernReason: document.getElementById("concern-reason").value.trim(),
    deviceAlert: document.getElementById("device-alert").value.trim(),
    eventDetectionPreview: eventDetectionPreview.checked,
    image: state.processedImage
  };

  document.getElementById("input-summary").textContent =
    `${state.caseData.absenceType} · 집을 비운 시간 ${state.caseData.absenceDuration} · ${state.caseData.eventDetectionPreview ? "이벤트 감지 Preview · " : ""}현장 확인 가능 대상 ${state.caseData.availableContact}`;

  unlockStep(3);
  showScreen("screen-result");
  await runReview();
});

async function runReview() {
  const loading = document.getElementById("ai-loading");
  const errorBox = document.getElementById("ai-error");
  const resultWrap = document.getElementById("ai-result");

  setHidden(loading, false);
  errorBox.className = "notice notice--error hidden";
  setHidden(errorBox, true);
  setHidden(resultWrap, true);

  const modeLabel = document.getElementById("analysis-mode-label");
  const visionStage = document.getElementById("vision-stage");
  const analysisImage = document.getElementById("analysis-image");
  const confidenceBar = document.getElementById("confidence-bar");
  const confidenceLabel = document.getElementById("confidence-label");

  document.getElementById("loading-title").textContent = state.caseData.image
    ? "멀티모달 AI가 장면을 살펴보고 있어요."
    : "AI가 입력 내용을 정리하고 있어요.";

  try {
    let result;
    try {
      result = await requestAiReview(state.caseData);
    } catch (apiError) {
      await wait(650);
      result = buildLocalReview(state.caseData);
      const notConfigured = apiError.message === "AI_ENDPOINT_NOT_CONFIGURED";
      errorBox.textContent = notConfigured
        ? "AI Worker 주소가 아직 설정되지 않아 로컬 안전 분석으로 표시합니다. 설정 후 같은 화면에서 실제 Gemini 분석이 동작합니다."
        : "AI 연결이 원활하지 않아 로컬 안전 분석으로 전환했습니다. 입력한 내용은 계속 확인할 수 있습니다.";
      errorBox.className = "notice notice--warning";
      setHidden(errorBox, false);
    }
    state.aiReview = result;
    modeLabel.textContent = result.mode === "gemini"
      ? "Gemini 멀티모달 분석"
      : result.mode === "test"
        ? "테스트 분석 · Gemini 미사용"
        : "로컬 안전 분석";
    visionStage.classList.toggle("vision-stage--text-only", !state.caseData.image);
    if (state.caseData.image) analysisImage.src = state.caseData.image.previewUrl;
    else analysisImage.removeAttribute("src");
    document.getElementById("scene-summary").textContent = result.scene_summary;
    confidenceBar.style.width = `${result.confidence}%`;
    confidenceLabel.textContent = result.mode === "local" ? "N/A" : `${result.confidence}%`;
    renderList(document.getElementById("image-observations-list"), result.image_observations);
    renderList(document.getElementById("facts-list"), result.observed_facts);
    renderList(document.getElementById("unknown-list"), result.unknown_or_missing);
    renderList(document.getElementById("consider-list"), result.reasons_to_consider_check);
    renderList(document.getElementById("checklist-list"), result.onsite_checklist);
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
  const noRelay = state.relayTarget === "지금은 요청하지 않음";
  document.getElementById("relay-target-label").textContent = noRelay
    ? "보호자 본인에게 전달되는 자동 감지 알림을 재현합니다."
    : `보호자 본인에게 먼저 알린 뒤, ${state.relayTarget}에게 보낼 추가 확인 요청을 정리합니다.`;
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
    const noRelay = state.relayTarget === "지금은 요청하지 않음";
    const ownerAlert = buildOwnerAlert(state.caseData);
    document.getElementById("owner-alert-title").textContent = ownerAlert.title;
    document.getElementById("owner-alert-preview").textContent = ownerAlert.preview;
    const kakaoNotification = document.getElementById("kakao-notification");
    kakaoNotification.classList.remove("is-arriving");
    void kakaoNotification.offsetWidth;
    kakaoNotification.classList.add("is-arriving");

    const optionalRelayWrap = document.getElementById("optional-relay-wrap");
    const relayCopyActions = document.getElementById("relay-copy-actions");
    setHidden(optionalRelayWrap, noRelay);
    setHidden(relayCopyActions, noRelay);
    state.relayMessage = noRelay ? "" : buildLocalRelayMessage(state.caseData, state.relayTarget);
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
const relayContentWrap = document.getElementById("relay-content-wrap");
const relayDeclineComplete = document.getElementById("relay-decline-complete");
sendIntentInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.sendIntent = input.value;
    feedbackFromRelay.disabled = false;
    feedbackFromRelay.innerHTML = input.value === "없다"
      ? "감사합니다로 마치기 <span>→</span>"
      : "피드백 남기기 <span>→</span>";
  });
});
feedbackFromRelay.addEventListener("click", () => {
  if (state.sendIntent === "없다") {
    setHidden(relayContentWrap, true);
    setHidden(relayDeclineComplete, false);
    return;
  }
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

async function saveMvpData() {
  const start = new Date(`${state.caseData.absenceStartDate}T00:00:00`);
  const end = new Date(`${state.caseData.absenceEndDate}T00:00:00`);
  const absenceDays = Math.max(1, Math.round((end - start) / 86400000));
  state.eventId ||= crypto.randomUUID();
  const isExample = Boolean(state.caseData.image?.isExample);
  const payload = {
    testMode: TEST_MODE,
    event: {
      eventId: state.eventId,
      absenceStart: state.caseData.absenceStartDate,
      absenceEnd: state.caseData.absenceEndDate,
      absenceDays,
      inputSource: isExample ? "기본 예시" : "직접 작성",
      eventPreview: state.caseData.eventDetectionPreview,
      imageSource: isExample ? "예시 사진" : state.caseData.image ? "직접 사진" : "없음",
      analysisMode: state.aiReview?.mode || "local",
      confidence: state.aiReview?.confidence || 0,
      sceneSummary: state.aiReview?.scene_summary || "확인 불가",
      detectedCase: state.caseData.eventDetectionPreview ? "장시간 움직임 없음" : "생활 환경 변화",
      relayTarget: state.relayTarget || "지금은 요청하지 않음",
      notificationIntent: state.sendIntent || "없다"
    },
    feedback: state.feedback
  };
  const response = await fetch(COLLECT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Google Sheets 저장 요청에 실패했습니다.");
  return result;
}

feedbackForm.addEventListener("submit", async (event) => {
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

  const submitButton = feedbackForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Google Sheets에 저장 중…";
  let saveResult;
  try {
    saveResult = await saveMvpData();
  } catch (error) {
    feedbackError.textContent = `${error.message} 입력 내용은 브라우저에 저장하지 않았습니다.`;
    setHidden(feedbackError, false);
    submitButton.disabled = false;
    submitButton.textContent = "다시 저장";
    return;
  }

  console.info("CatGuard Relay MVP feedback pipeline:", {
    recentExperience: state.recentExperience,
    relayTarget: state.relayTarget,
    sendIntent: state.sendIntent,
    feedback: state.feedback
  });

  const databaseStatus = document.getElementById("database-save-status");
  databaseStatus.textContent = saveResult.stored
    ? `Google Sheets 저장 완료 · 익명 ID ${state.eventId.slice(0, 8)}`
    : `테스트 페이로드 검증 완료 · Sheets 웹훅 연결 대기 · ${state.eventId.slice(0, 8)}`;
  feedbackForm.reset();
  feedbackForm.classList.add("hidden");
  setHidden(feedbackComplete, false);
});
