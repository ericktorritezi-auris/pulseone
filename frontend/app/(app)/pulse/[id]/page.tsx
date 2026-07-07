'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { api } from '../../../../lib/api';
import { PulseFeedbackDetail } from '../../../../lib/types';

const MIN_COMMENT_LENGTH = 200;

export default function PulseWizardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<PulseFeedbackDetail | null>(null);
  const [step, setStep] = useState(0); // 0..n-1 perguntas, n = comentário
  const [values, setValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<PulseFeedbackDetail>(`/pulse-feedbacks/${params.id}`)
      .then((data) => {
        setDetail(data);
        const initial: Record<string, number> = {};
        data.answers.forEach((a) => (initial[a.questionId] = a.value));
        setValues(initial);
        setComment(data.comment ?? '');
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;
  if (!detail) return <p className="text-sm text-red-600">Avaliação não encontrada.</p>;

  const questions = detail.questions;
  const totalSteps = questions.length + 1; // + comentário
  const isCommentStep = step === questions.length;
  const currentQuestion = !isCommentStep ? questions[step] : null;

  function goToStep(index: number) {
    setError('');
    setStep(index);
  }

  function handleNext() {
    if (currentQuestion && values[currentQuestion.id] === undefined) {
      setError('Selecione uma nota para continuar.');
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }

  async function handleSubmit() {
    if (comment.trim().length < MIN_COMMENT_LENGTH) {
      setError(`O comentário precisa ter no mínimo ${MIN_COMMENT_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post(`/pulse-feedbacks/${params.id}/answers`, {
        answers: Object.entries(values).map(([questionId, value]) => ({ questionId, value })),
        comment,
      });
      router.push('/pulse');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar avaliação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Avaliar: {detail.target.fullName}</h1>

      {/* Stepper de abas */}
      <div className="flex flex-wrap gap-2 mb-6 mt-4">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => goToStep(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              step === i
                ? 'bg-p-primary text-white'
                : values[q.id] !== undefined
                  ? 'bg-p-success/10 text-p-success'
                  : 'bg-slate-100 text-p-neutral'
            }`}
          >
            {values[q.id] !== undefined && <Check size={12} />}
            {i + 1}. {q.dimension}
          </button>
        ))}
        <button
          onClick={() => goToStep(questions.length)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            isCommentStep ? 'bg-p-primary text-white' : 'bg-slate-100 text-p-neutral'
          }`}
        >
          Comentário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {!isCommentStep && currentQuestion && (
          <div>
            <p className="text-xs text-p-neutral mb-1">
              {step + 1}. {currentQuestion.dimension}
            </p>
            <p className="text-base text-p-primary-dark mb-6">{currentQuestion.text}</p>

            <div className="flex justify-between text-xs text-p-neutral mb-2">
              <span>Discordo totalmente</span>
              <span>Concordo totalmente</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, n) => n).map((n) => (
                <button
                  key={n}
                  onClick={() => setValues({ ...values, [currentQuestion.id]: n })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    values[currentQuestion.id] === n
                      ? 'bg-p-primary text-white border-p-primary'
                      : 'border-slate-200 text-p-neutral hover:border-p-primary'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {isCommentStep && (
          <div>
            <p className="text-sm font-medium text-p-primary-dark mb-2">
              Comentário (mín. {MIN_COMMENT_LENGTH} caracteres)
            </p>
            <textarea
              rows={7}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
              placeholder="Escreva um feedback construtivo, específico e respeitoso..."
            />
            <p className={`text-xs mt-1 ${comment.length < MIN_COMMENT_LENGTH ? 'text-red-500' : 'text-p-success'}`}>
              {comment.length} caracteres
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={() => goToStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-p-neutral disabled:opacity-40"
          >
            Voltar
          </button>

          {!isCommentStep ? (
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-p-primary text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              Próxima pergunta
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 bg-p-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Concluir avaliação'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
