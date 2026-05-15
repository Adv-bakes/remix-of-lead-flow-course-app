import { Link } from "react-router-dom";

export interface PipelineCardData {
  id: string;
  email: string;
  contact_name: string | null;
  company_name: string | null;
  stage: string | null;
  stage_updated_at: string | null;
  has_nda?: boolean;
  has_pss?: boolean;
  has_prf?: boolean;
}

const daysSince = (iso: string | null) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
};

interface Props {
  client: PipelineCardData;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export const PipelineCard = ({ client, isDragging, onDragStart, onDragEnd }: Props) => {
  const days = daysSince(client.stage_updated_at);
  const stale = days >= 7;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", client.id);
        onDragStart(client.id);
      }}
      onDragEnd={onDragEnd}
      className="tp-card cursor-grab active:cursor-grabbing p-3.5"
      style={{ opacity: isDragging ? 0.45 : 1 }}
    >
      <Link to={`/team/sales/clients/${client.id}`} className="block">
        <p className="font-display text-[14px] font-semibold leading-tight text-[hsl(var(--tp-text))] truncate">
          {client.company_name || client.contact_name || client.email}
        </p>
        {client.contact_name && (
          <p className="text-[11px] mt-0.5 text-[hsl(var(--tp-text-muted))] truncate">
            {client.contact_name}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-3" title="NDA · PSS · PRF">
          <span className={`tp-dot ${client.has_nda ? "on" : ""}`} />
          <span className={`tp-dot ${client.has_pss ? "on" : ""}`} />
          <span className={`tp-dot ${client.has_prf ? "on" : ""}`} />
          <span className="text-[10px] ml-1 text-[hsl(var(--tp-text-dim))] uppercase tracking-wider">
            NDA · PSS · PRF
          </span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--tp-hairline))]">
          <span
            className={`text-[11px] ${stale ? "text-[hsl(var(--tp-warning))]" : "text-[hsl(var(--tp-text-dim))]"}`}
          >
            {days}d in stage{stale ? " • stale" : ""}
          </span>
        </div>
      </Link>
    </div>
  );
};
