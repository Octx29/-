import assert from 'node:assert/strict';

export function makeSheetsFixture() {
  const names = ['Students', 'Attendance', 'Grades', 'TermScores'];
  const tabs = new Map();
  const calls = [];
  let nextGate = null, failNext = false;
  return {
    tabs, calls,
    failNextBatch() { failNext = true; },
    holdNextBatch() {
      let release, signal;
      const promise = new Promise(r => { release = r; });
      const started = new Promise(r => { signal = r; });
      nextGate = { promise, signal };
      return { started, release };
    },
    spreadsheets: {
      async get() { return { data: { sheets: names.map((title, sheetId) => ({ properties: { title, sheetId, gridProperties: { rowCount: 1000, columnCount: 26 } } })) } }; },
      async batchUpdate({ requestBody }) {
        calls.push(requestBody);
        const gate = nextGate; nextGate = null;
        if (gate) { gate.signal(); await gate.promise; }
        if (failNext) { failNext = false; throw new Error('Synthetic batch failure'); }
        const pending = new Map();
        for (const request of requestBody.requests) {
          if (!request.updateCells) continue;
          const update = request.updateCells;
          assert.equal(update.fields, 'userEnteredValue');
          assert.equal(update.range.startRowIndex, 0);
          assert.equal(update.range.endColumnIndex, 26);
          assert(update.range.endRowIndex >= update.rows.length);
          pending.set(names[update.range.sheetId], update.rows.map(row => row.values.map(cell => cell.userEnteredValue.numberValue ?? cell.userEnteredValue.stringValue)));
        }
        assert.equal(pending.size, 4, 'all mirror tabs must be in the same atomic request');
        for (const [key, rows] of pending) tabs.set(key, rows);
      },
    },
  };
}
