import { KeyRound } from 'lucide-react';
import { AdminModal } from '@/components/admin/AdminModal';
import { MemberModal } from '@/components/member/MemberModal';
import { Modal } from '@/components/ui/Modal';

interface PasswordChangeConfirmationModalProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  useAdminHeader?: boolean;
  useMemberHeader?: boolean;
}

export function PasswordChangeConfirmationModal({ open, saving, onClose, onConfirm, useAdminHeader = false, useMemberHeader = false }: PasswordChangeConfirmationModalProps) {
  const ConfirmationModal = useAdminHeader ? AdminModal : useMemberHeader ? MemberModal : Modal;

  return (
    <ConfirmationModal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Yakin ingin mengganti password?"
      titleEyebrow="Konfirmasi Keamanan"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">Password akun akan diperbarui. Pastikan password baru sudah benar dan dapat kamu ingat.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
          <button type="button" onClick={onConfirm} disabled={saving} className="btn-primary min-h-11 w-full sm:w-auto">
            <KeyRound className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Ya, Ganti Password'}
          </button>
        </div>
      </div>
    </ConfirmationModal>
  );
}
