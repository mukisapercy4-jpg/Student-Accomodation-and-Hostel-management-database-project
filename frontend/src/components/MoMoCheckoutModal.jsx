import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, X, XCircle } from 'lucide-react';
import { api, money } from '../api.js';

// Mirrors services.MOMO_PREFIXES on the server, which stays the authority.
const NETWORKS = {
  MTN: { prefixes: ['077', '078', '076', '039'], on: 'border-yellow-400 bg-yellow-50 text-yellow-900', dot: 'bg-yellow-400' },
  Airtel: { prefixes: ['070', '075', '074'], on: 'border-red-400 bg-red-50 text-red-900', dot: 'bg-red-500' },
};
const POLL_MS = 3000;
const MAX_POLLS = 40; // about two minutes, then the payment is left Pending
// No real MTN/Airtel gateway is connected. The simulate buttons only exist in dev builds,
// or when VITE_MOMO_SIMULATE=true is set explicitly.
const SIMULATE = import.meta.env.DEV || import.meta.env.VITE_MOMO_SIMULATE === 'true';

/** 07XXXXXXXX from 07..., 2567... or +2567...; null when it cannot be one. */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (d.startsWith('256') && d.length === 12) d = `0${d.slice(3)}`;
  return /^0\d{9}$/.test(d) ? d : null;
}

function phoneProblem(raw, network) {
  if (!raw.trim()) return '';
  const n = normalizePhone(raw);
  if (!n) return 'Enter a Ugandan mobile number, e.g. 0772 123 456.';
  if (!NETWORKS[network].prefixes.some((p) => n.startsWith(p))) return `This number does not look like an ${network} number.`;
  return '';
}

/**
 * @param {{booking: {booking_id:number, student_name:string, hostel_name:string, room_number:string,
 *   agreed_price:string, completed_payments?:string}, onClose: () => void, onSettled?: (message:string) => void}} props
 * onClose is always called when the dialog is dismissed; onSettled when a payment reached Completed/Failed.
 */
export default function MoMoCheckoutModal({ booking, onClose, onSettled }) {
  const balance = Math.max(Number(booking?.agreed_price || 0) - Number(booking?.completed_payments || 0), 0);
  const [step, setStep] = useState('form'); // form | waiting | success | failed | timeout
  const [network, setNetwork] = useState('MTN');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState(balance ? String(balance) : '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const phoneRef = useRef(null);
  const settledRef = useRef(false);

  const problem = phoneProblem(phone, network);
  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const canSubmit = !busy && !!phone.trim() && !problem && amountOk;

  useEffect(() => { phoneRef.current?.focus(); }, []);

  const close = useCallback(() => {
    if (step === 'waiting' && !window.confirm('The payment is still waiting for PIN approval and will stay Pending. Close anyway?')) return;
    onClose();
  }, [step, onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const finish = useCallback((status, p) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setStep(status === 'Completed' ? 'success' : 'failed');
    onSettled?.(`Mobile Money payment ${p.reference_number} ${status === 'Completed' ? 'completed' : 'failed'}.`);
  }, [onSettled]);

  // While waiting, watch the payment record: whoever settles it (a gateway callback later, or the
  // simulate buttons now) changes payment_status, and this picks it up.
  useEffect(() => {
    if (step !== 'waiting' || !payment) return undefined;
    let polls = 0;
    const id = setInterval(async () => {
      polls += 1;
      try {
        const p = await api(`/payments/${payment.payment_id}/`);
        if (p.payment_status === 'Completed' || p.payment_status === 'Failed') { clearInterval(id); finish(p.payment_status, p); return; }
      } catch { /* transient: keep waiting, the next poll retries */ }
      if (polls >= MAX_POLLS) { clearInterval(id); setStep('timeout'); }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [step, payment, finish]);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setBusy(true); setError('');
    try {
      const p = await api('/payments/momo/', {
        method: 'POST',
        body: JSON.stringify({ booking: booking.booking_id, amount: amountNum, network, phone: normalizePhone(phone) }),
      });
      settledRef.current = false;
      setPayment(p); setStep('waiting');
    } catch (err) { setError(err.message || 'Could not start the payment.'); } finally { setBusy(false); }
  };

  const simulate = async (status) => {
    setBusy(true); setError('');
    try {
      // simulated gateway callback: allowed for the student who owns the payment, and for staff
      const p = await api(`/payments/${payment.payment_id}/momo-confirm/`, {
        method: 'POST', body: JSON.stringify({ outcome: status === 'Completed' ? 'success' : 'failure' }),
      });
      finish(status, p);
    } catch (err) { setError(err.message || 'Could not update the payment.'); } finally { setBusy(false); }
  };

  const retry = () => { setStep('form'); setPayment(null); setError(''); };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="momo-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface-container-lowest p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p id="momo-title" className="flex items-center gap-2 text-base font-extrabold text-on-surface">
              <Smartphone size={18} aria-hidden="true" /> Mobile Money checkout
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Booking #{booking.booking_id} · {booking.student_name} · {booking.hostel_name} {booking.room_number}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-slate-100"><X size={18} /></button>
        </div>

        {SIMULATE && step !== 'success' && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
            Simulation mode: no real MTN/Airtel request is sent and no money moves.
          </p>
        )}

        {step === 'form' && (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div role="radiogroup" aria-label="Network" className="grid grid-cols-2 gap-2">
              {Object.entries(NETWORKS).map(([name, n]) => (
                <button key={name} type="button" role="radio" aria-checked={network === name} onClick={() => setNetwork(name)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold ${network === name ? n.on : 'border-outline-variant text-on-surface-variant'}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${n.dot}`} aria-hidden="true" />{name === 'MTN' ? 'MTN MoMo' : 'Airtel Money'}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="momo-phone" className="mb-1 block text-xs font-semibold text-on-surface-variant">Mobile money number</label>
              <input id="momo-phone" ref={phoneRef} type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456"
                value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched(true)}
                aria-invalid={touched && !!problem} aria-describedby="momo-phone-help"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 ${touched && problem ? 'border-rose-400' : 'border-outline-variant'}`} />
              <p id="momo-phone-help" className={`mt-1 text-[11px] ${touched && problem ? 'text-rose-600' : 'text-outline'}`}>
                {touched && problem ? problem : 'The number is used for this request only and is not saved.'}
              </p>
            </div>

            <div>
              <label htmlFor="momo-amount" className="mb-1 block text-xs font-semibold text-on-surface-variant">Amount (UGX)</label>
              <input id="momo-amount" type="number" inputMode="numeric" min="1" step="1" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-outline-variant px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
              <p className="mt-1 text-[11px] text-outline">Balance on this booking: {money(balance)}</p>
              {touched && !amountOk && <p className="text-[11px] text-rose-600">Enter an amount above zero.</p>}
            </div>

            {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}
            <button type="submit" disabled={busy || (touched && !canSubmit)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {busy ? 'Sending request…' : `Pay ${amountOk ? money(amountNum) : ''}`.trim()}
            </button>
          </form>
        )}

        {step === 'waiting' && payment && (
          <div className="grid gap-4 text-center" role="status" aria-live="polite">
            <Loader2 size={34} className="mx-auto animate-spin text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-on-surface">Waiting for PIN authorization...</p>
              <p className="mt-1 text-xs text-on-surface-variant">A prompt was sent to {payment.phone_masked}. Ask the payer to approve it on their phone.</p>
            </div>
            <div className="mx-auto w-full max-w-xs rounded-xl border border-outline-variant bg-slate-900 p-3 text-left font-mono text-[11px] leading-relaxed text-emerald-300">
              <p className="mb-1 text-outline">{SIMULATE ? 'Simulated USSD prompt' : 'USSD prompt'} · {network}</p>
              <p>Pay {money(amountNum)} to SAHMS?</p>
              <p>Ref {payment.reference_number}</p>
              <p>Enter PIN to confirm.</p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}
            {SIMULATE && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => simulate('Completed')}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50">Simulate: PIN approved</button>
                <button type="button" disabled={busy} onClick={() => simulate('Failed')}
                  className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">Simulate: declined</button>
              </div>
            )}
            <p className="text-[11px] text-outline">The payment stays Pending until it is approved or declined.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="grid gap-3 text-center" role="status">
            <CheckCircle2 size={44} className="mx-auto text-emerald-500" aria-hidden="true" />
            <p className="text-base font-extrabold text-on-surface">Payment completed</p>
            <p className="text-xs text-on-surface-variant">{money(amountNum)} received · Ref {payment?.reference_number}</p>
            <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Done</button>
          </div>
        )}

        {step === 'failed' && (
          <div className="grid gap-3 text-center" role="alert">
            <XCircle size={44} className="mx-auto text-rose-500" aria-hidden="true" />
            <p className="text-base font-extrabold text-on-surface">Payment failed</p>
            <p className="text-xs text-on-surface-variant">The request was declined or cancelled. It is recorded as Failed; no money was received.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-outline-variant px-4 py-3 text-sm font-bold text-on-surface">Close</button>
              <button type="button" onClick={retry} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Try again</button>
            </div>
          </div>
        )}

        {step === 'timeout' && (
          <div className="grid gap-3 text-center" role="alert">
            <Loader2 size={34} className="mx-auto text-amber-500" aria-hidden="true" />
            <p className="text-base font-extrabold text-on-surface">Still waiting</p>
            <p className="text-xs text-on-surface-variant">No approval yet. The payment {payment?.reference_number} stays Pending and can be completed or failed from the Payments list.</p>
            <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
