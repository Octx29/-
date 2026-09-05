const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export function reminderPayload(classRoom, assignment, kind) {
  const text = kind === 'expired'
    ? `❗ งาน "${assignment.title}" (${classRoom.name}) เลยกำหนดส่ง ${assignment.dueDate} แล้ว`
    : `⏰ แจ้งเตือน: งาน "${assignment.title}" (${classRoom.name}) กำหนดส่ง ${assignment.dueDate}`;
  return { to: classRoom.lineGroupId, messages: [{ type: 'text', text }] };
}

// Accepted by LINE does not guarantee delivery to every recipient.
export async function pushLine(payload, retryKey) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !payload.to) return { accepted: false, error: 'LINE not configured' };
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
        ...(retryKey ? { 'X-Line-Retry-Key': retryKey } : {}) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    if (res.ok || (retryKey && res.status === 409 && res.headers.get('x-line-accepted-request-id'))) return { accepted: true };
    return { accepted: false, error: `LINE rejected request (${res.status})` };
  } catch (error) { return { accepted: false, error: error.message }; }
}

export async function notifyNewAssignment(classRoom, assignment) {
  const due = assignment.dueDate ? ` กำหนดส่ง ${assignment.dueDate}` : '';
  const result = await pushLine({ to: classRoom.lineGroupId, messages: [{ type: 'text', text: `📚 มีงานใหม่: "${assignment.title}" (${classRoom.name})${due}` }] });
  if (!result.accepted) console.warn('[lineNotify]', result.error);
  return result;
}
