import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { StatusBanner } from '../components/StatusBanner';
import { playErrorTone, playSuccessTone } from '../lib/audio';
import { buildItemUpdateFromItem } from '../lib/homebox/helpers';
import { useSession } from '../state/session';

export function AdjustQuantityPage(): JSX.Element {
  const { entityId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { api } = useSession();
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [appendReason, setAppendReason] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();

  const entityQuery = useQuery({
    queryKey: ['item', entityId],
    queryFn: () => api.getItem(entityId)
  });

  useEffect(() => {
    if (entityQuery.data?.quantity !== undefined) {
      setQuantity(entityQuery.data.quantity);
    }
  }, [entityQuery.data?.quantity]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!entityQuery.data) throw new Error('Item not loaded.');

      const notes = appendReason && reason.trim()
        ? `${entityQuery.data.notes ? `${entityQuery.data.notes}\n\n` : ''}[Qty Change ${new Date().toLocaleString()}] ${reason.trim()}`
        : entityQuery.data.notes;

      return api.updateItem(
        entityId,
        buildItemUpdateFromItem(entityQuery.data, {
          quantity,
          notes
        })
      );
    },
    onSuccess: async () => {
      playSuccessTone();
      await queryClient.invalidateQueries({ queryKey: ['item', entityId] });
      setMessage({ tone: 'success', text: 'Quantity updated.' });
      navigate(`/item/${entityId}`);
    },
    onError: (caught) => {
      playErrorTone();
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Unable to update quantity'
      });
    }
  });

  return (
    <Layout title="Adjust Quantity">
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <div className="card">
        <div className="section-title">{entityQuery.data?.name || 'Item'}</div>

        <div className="qty-stepper">
          <button type="button" className="secondary-button" onClick={() => setQuantity((current) => Math.max(0, current - 1))}>-1</button>
          <input
            className="qty-input"
            value={quantity}
            type="number"
            min={0}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
          <button type="button" className="secondary-button" onClick={() => setQuantity((current) => current + 1)}>+1</button>
        </div>

        <label className="field-label">Optional reason</label>
        <textarea
          className="text-area"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Battery pack consumed, parts used, counted duplicates, etc."
        />

        <label className="checkbox-row">
          <input type="checkbox" checked={appendReason} onChange={(event) => setAppendReason(event.target.checked)} />
          <span>Append reason to HomeBox notes</span>
        </label>

        <div className="helper-text">
          HomeBox does not expose a dedicated quantity-adjustment audit note field in the current API, so note persistence is explicit and opt-in.
        </div>
      </div>

      <div className="action-row">
        <button type="button" className="primary-button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save Quantity'}
        </button>
        <Link className="secondary-button" to={`/item/${entityId}`}>Cancel</Link>
      </div>
    </Layout>
  );
}
