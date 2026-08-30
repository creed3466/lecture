function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
    const expectedToken = properties.getProperty("WEBHOOK_TOKEN");
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");

    if (!spreadsheetId || !expectedToken || payload.token !== expectedToken) {
      return output.setContent(JSON.stringify({ ok: false, error: "unauthorized" }));
    }

    const event = payload.event || {};
    const feedback = payload.feedback || {};
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const now = new Date();
      spreadsheet.getSheetByName("event_log").appendRow([
        safeText_(event.eventId),
        now,
        safeDate_(event.absenceStart),
        safeDate_(event.absenceEnd),
        Number(event.absenceDays) || 1,
        safeText_(event.inputSource),
        Boolean(event.eventPreview),
        safeText_(event.imageSource),
        safeText_(event.analysisMode),
        Number(event.confidence) || 0,
        safeText_(event.sceneSummary),
        safeText_(event.detectedCase),
        safeText_(event.relayTarget),
        safeText_(event.notificationIntent),
        Boolean(payload.testMode),
        "stored"
      ]);

      spreadsheet.getSheetByName("feedback").appendRow([
        "fb_" + safeText_(event.eventId),
        safeText_(event.eventId),
        now,
        safeText_(feedback.problemFrequency),
        safeText_(feedback.aiHelpful),
        safeText_(feedback.relayIntentFeedback),
        safeText_(feedback.moreUseful),
        safeText_(feedback.payIntent),
        Boolean(payload.testMode)
      ]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return output.setContent(JSON.stringify({ ok: true, eventId: event.eventId }));
  } catch (error) {
    console.error(error);
    return output.setContent(JSON.stringify({ ok: false, error: "write_failed" }));
  }
}

function safeText_(value) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 300);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function safeDate_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
