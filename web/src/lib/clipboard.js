// Sao chép có phương án dự phòng cho môi trường bị chặn quyền clipboard (iframe
// trong preview chẳng hạn).

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* rơi xuống phương án dự phòng */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// Đối chiếu lại nội dung clipboard sau khi ghi (nếu trình duyệt cho phép đọc).
// Giúp phát hiện công cụ nhớ đệm ghi đè ngay sau khi sao chép.
export async function readClipboardIfAllowed() {
  try {
    if (!navigator.clipboard?.readText) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
