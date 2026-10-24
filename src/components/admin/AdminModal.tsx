import type { ComponentProps } from 'react';
import { Modal } from '@/components/ui/Modal';

type AdminModalProps = ComponentProps<typeof Modal>;

export function AdminModal(props: AdminModalProps) {
  return (
    <Modal
      {...props}
      headerClassName="!bg-gradient-to-br !from-blue-700 !via-blue-800 !to-blue-900 !px-4 !pb-3 !pt-3 sm:!px-6 sm:!pb-4 sm:!pt-4"
      titleClassName="!text-lg !font-black !text-white sm:!text-xl [overflow-wrap:anywhere]"
      titleEyebrowClassName="!mb-1 !text-blue-200"
      closeButtonClassName="!bg-white/15 !text-white hover:!bg-white/25 hover:!text-white"
    />
  );
}
