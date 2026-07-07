import { Feedback } from '../../lib/types';
import { AvatarInitials } from './AvatarInitials';

interface FeedbackListProps {
  items: Feedback[];
  direction: 'received' | 'sent';
  loading: boolean;
}

export function FeedbackList({ items, direction, loading }: FeedbackListProps) {
  if (loading) {
    return <p className="text-sm text-p-neutral py-8 text-center">Carregando...</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-p-neutral py-8 text-center">
        {direction === 'received' ? 'Nenhum feedback recebido ainda.' : 'Nenhum feedback enviado ainda.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const person = direction === 'received' ? item.remetente : item.destinatario;
        return (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3">
            <AvatarInitials name={person ?? '?'} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-p-primary-dark">{person}</p>
                <span className="text-xs text-p-neutral">
                  {new Date(item.criadoEm).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <p className="text-sm text-p-neutral mt-1">{item.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
