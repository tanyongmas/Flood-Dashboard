// เปิด Side Panel ทันทีเมื่อคลิกไอคอน Extension
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('SidePanel error:', error));

// ส่งคีย์ลัด Alt+F ไปให้ Side Panel ทำงาน AutoFill
chrome.commands.onCommand.addListener((command) => {
  if (command === 'trigger-autofill') {
    chrome.runtime.sendMessage({ type: 'COMMAND_TRIGGER_AUTOFILL' }).catch(() => {
      // Side Panel อาจยังไม่เปิดอยู่
    });
  }
});
