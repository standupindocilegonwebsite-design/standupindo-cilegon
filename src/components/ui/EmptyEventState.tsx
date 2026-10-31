import type { ReactNode } from 'react';

interface Props {
  action?: ReactNode;
}

export function EmptyEventState({ action }: Props) {
  return (
    <div className="empty-event-state">
      <div className="empty-event-stage" aria-hidden="true">
        <div className="empty-event-glow" />
        <div className="empty-event-beam empty-event-beam-left" />
        <div className="empty-event-beam empty-event-beam-right" />
        <div className="empty-event-rug" />
        <img src="/assets/images/open-mic-empty-performer.png" alt="" className="empty-event-performer" />
        <div className="empty-event-audience empty-event-audience-back">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="empty-event-audience empty-event-audience-front">
          <span /><span /><span /><span /><span />
        </div>
      </div>
      <div className="empty-event-copy">
        <h3 aria-label="Belum ada event mendatang.">
          <span>Belum ada</span>
          <span>event mendatang.</span>
        </h3>
        <p>Pantau terus untuk keseruan berikutnya.</p>
        {action && <div className="empty-event-action">{action}</div>}
      </div>
    </div>
  );
}
