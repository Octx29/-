const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// No-op (logs only) until LINE_CHANNEL_ACCESS_TOKEN is set and the classroom has a lineGroupId.
// Never throws: a LINE outage or missing config must never break the caller's save/create flow.
async function notifyGroup(lineGroupId, message) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineGroupId) {
    console.log(`[lineNotify] not configured or no lineGroupId set - would have sent: "${message}"`);
    return;
  }

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineGroupId, messages: [{ type: 'text', text: message }] }),
    });
    if (!res.ok) {
      console.error(`[lineNotify] push failed (${res.status}): ${await res.text()}`);
    } else {
      console.log(`[lineNotify] sent to ${lineGroupId}: "${message}"`);
    }
  } catch (err) {
    console.error('[lineNotify] push error:', err.message);
  }
}

export function notifyNewAssignment(classRoom, assignment) {
  const due = assignment.dueDate ? ` กำหนดส่ง ${assignment.dueDate}` : '';
  return notifyGroup(classRoom.lineGroupId, `📚 มีงานใหม่: "${assignment.title}" (${classRoom.name})${due}`);
}

export function notifyDueTomorrow(classRoom, assignment) {
  return notifyGroup(classRoom.lineGroupId, `⏰ แจ้งเตือน: งาน "${assignment.title}" (${classRoom.name}) กำหนดส่งพรุ่งนี้!`);
}

export function notifyExpired(classRoom, assignment) {
  return notifyGroup(classRoom.lineGroupId, `❗ งาน "${assignment.title}" (${classRoom.name}) เลยกำหนดส่งแล้ว`);
}
