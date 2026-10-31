import type { ReactNode } from 'react';

interface Props {
  action?: ReactNode;
}

export function EmptyOpenMicState({ action }: Props) {
  return (
    <div className="empty-open-mic-state">
      <div className="empty-open-mic-animation" aria-hidden="true">
        <div className="empty-open-mic-glow" />
        <div className="empty-open-mic-beam empty-open-mic-beam-left" />
        <div className="empty-open-mic-beam empty-open-mic-beam-right" />
        <div className="empty-open-mic-floor" />
        <div className="empty-open-mic-rug" />
        <div className="empty-open-mic-rollup">
          <div className="empty-open-mic-rollup-print">
            <div className="empty-open-mic-rollup-light" aria-hidden="true" />
            <h3>
              <span>Belum ada</span>
              <span>Open Mic</span>
              <span>yang tersedia.</span>
            </h3>
            <p>Pantau terus untuk panggung berikutnya.</p>
            <p className="empty-open-mic-smoke">🚭 No Smoke Area</p>
          </div>
        </div>
        <img src="/assets/images/open-mic-empty-performer.png" alt="" className="empty-open-mic-performer" />
      </div>
      <div className="empty-open-mic-copy">
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
