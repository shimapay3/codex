import AuthForm from './AuthForm.jsx';
import Modal from './Modal.jsx';

export default function AuthPrompt({ open, auth, title, description, actionLabel, onCancel, onSuccess }) {
  return (
    <Modal open={open} title={title} subtitle={description} onClose={onCancel} size="sm">
      <AuthForm auth={auth} actionLabel={actionLabel} onSuccess={onSuccess} />
      <button type="button" className="btn btn--ghost btn--block" onClick={onCancel}>
        Hủy
      </button>
    </Modal>
  );
}
