import { useCallback, useMemo, useState } from 'react';
import { copyText, readClipboardIfAllowed } from '../lib/clipboard.js';
import { verifyEntryIdent } from '../lib/ident.js';
import { toast } from '../lib/toast.js';
import { useVault } from '../lib/useVault.jsx';
import EntryCard from './EntryCard.jsx';
import EntryEditor from './EntryEditor.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import TopBar from './TopBar.jsx';

const COPY_TOOLTIP_MS = 9000;

export default function Workspace() {
  const { data, addEntry, updateEntry, deleteEntry } = useVault();
  const [editor, setEditor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [copiedAt, setCopiedAt] = useState({});
  const [tampered, setTampered] = useState({});
  const [busyId, setBusyId] = useState(null);

  const entries = useMemo(
    () => [...data.entries].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [data.entries],
  );

  const handleCopy = useCallback(async (entry) => {
    setBusyId(entry.id);
    try {
      const check = await verifyEntryIdent(entry);
      if (!check.ok) {
        setTampered((prev) => ({ ...prev, [entry.id]: true }));
        toast(`${check.reason} Hãy sửa lại địa chỉ trước khi sao chép.`, 'danger', 8000);
        setEditor({ entry, tamperWarning: true });
        return;
      }

      setTampered((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });

      const ok = await copyText(entry.address);
      if (!ok) {
        toast('Trình duyệt chặn sao chép — hãy sao chép thủ công.', 'danger', 6000);
        return;
      }

      const at = Date.now();
      setCopiedAt((prev) => ({ ...prev, [entry.id]: at }));
      toast(`Đã sao chép “${entry.label}”.`, 'success');
      window.setTimeout(
        () =>
          setCopiedAt((prev) => {
            const next = { ...prev };
            delete next[entry.id];
            return next;
          }),
        COPY_TOOLTIP_MS,
      );

      const echoed = await readClipboardIfAllowed();
      if (echoed !== null && echoed.trim() !== entry.address) {
        toast('Cảnh báo: nội dung clipboard đã bị thay đổi sau khi sao chép.', 'danger', 9000);
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleSave = useCallback(
    async (record, meta) => {
      if (meta.isNew) {
        addEntry(record);
        toast('Đã lưu địa chỉ mới vào két.', 'success');
      } else {
        updateEntry(record.id, record);
        toast('Đã cập nhật địa chỉ.', 'success');
      }
    },
    [addEntry, updateEntry],
  );

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteEntry(pendingDelete.id);
    toast(`Đã xóa “${pendingDelete.label}”.`, 'info');
    setPendingDelete(null);
  };

  return (
    <section className="screen">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="workspace">
        <div className="workspace__head">
          <div>
            <h1 className="workspace__title">Danh bạ ví SOL</h1>
            <p className="workspace__sub">
              {entries.length > 0
                ? `${entries.length} địa chỉ · mã hóa AES-GCM trong localStorage`
                : 'Mã hóa AES-GCM trong localStorage của thiết bị'}
            </p>
          </div>
          <span className="secure-badge">
            <Icon name="shield" size={15} />
            Đã mã hóa
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="wallet" size={30} />
            </span>
            <h2 className="empty-state__title">Chưa có địa chỉ nào</h2>
            <p className="empty-state__text">
              Thêm địa chỉ ví SOL kèm nhãn màu và ident vắn tắt. Mọi thứ được mã hóa và bảo vệ bằng
              passkey / mã PIN của bạn.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setEditor({ entry: null, tamperWarning: false })}
            >
              <Icon name="plus" size={18} />
              Thêm địa chỉ đầu tiên
            </button>
          </div>
        ) : (
          <div className="entry-grid">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                copiedAt={copiedAt[entry.id]}
                tampered={Boolean(tampered[entry.id])}
                busy={busyId === entry.id}
                onCopy={handleCopy}
                onEdit={(item) => setEditor({ entry: item, tamperWarning: false })}
                onDelete={(item) => setPendingDelete(item)}
              />
            ))}
          </div>
        )}

        <p className="workspace__foot">
          <Icon name="lock" size={13} />
          Mỗi lần sao chép, địa chỉ được đối chiếu lại với ident đã neo để phát hiện giả mạo.
        </p>
      </div>

      <button
        type="button"
        className="fab"
        onClick={() => setEditor({ entry: null, tamperWarning: false })}
        aria-label="Thêm địa chỉ ví SOL"
        title="Thêm địa chỉ"
      >
        <Icon name="plus" size={26} />
      </button>

      <EntryEditor
        open={Boolean(editor)}
        entry={editor?.entry ?? null}
        tamperWarning={Boolean(editor?.tamperWarning)}
        onClose={() => setEditor(null)}
        onSave={handleSave}
      />

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Modal
        open={Boolean(pendingDelete)}
        title="Xóa cụm danh bạ?"
        subtitle="Nhãn · ident · địa chỉ"
        size="sm"
        onClose={() => setPendingDelete(null)}
        footer={
          <div className="modal__buttons">
            <button type="button" className="btn btn--ghost" onClick={() => setPendingDelete(null)}>
              Giữ lại
            </button>
            <button type="button" className="btn btn--danger" onClick={confirmDelete}>
              <Icon name="trash" size={16} />
              Xóa
            </button>
          </div>
        }
      >
        <p className="modal__text">
          Xóa vĩnh viễn “{pendingDelete?.label}” cùng ident và địa chỉ của mục này khỏi thiết bị.
        </p>
      </Modal>
    </section>
  );
}
